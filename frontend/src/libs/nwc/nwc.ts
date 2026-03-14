import { finalizeEvent, getPublicKey } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";
import * as nip04 from "nostr-tools/nip04";
import { hexToBytes } from "@noble/hashes/utils.js";

export interface NWCConfig {
    walletPubkey: string;
    relayUrl: string;
    secret: string;
    encryptionMode: "nip44" | "nip04";
}

export interface LookupInvoiceResult {
    state: "pending" | "settled" | "expired" | "accepted" | "failed";
    preimage?: string;
    settledAt?: number;
}

export function parseNWCString(nwcString: string): NWCConfig {
    const str = nwcString.trim();
    if (!str.startsWith("nostr+walletconnect://")) {
        throw new Error("Invalid NWC string: must start with nostr+walletconnect://");
    }
    const withoutScheme = str.slice("nostr+walletconnect://".length);
    const qMark = withoutScheme.indexOf("?");
    if (qMark < 0) throw new Error("Invalid NWC string: missing query params");
    const walletPubkey = withoutScheme.slice(0, qMark);
    const params = new URLSearchParams(withoutScheme.slice(qMark + 1));
    const relayUrl = params.get("relay");
    const secret = params.get("secret");
    if (!relayUrl) throw new Error("Invalid NWC string: missing relay");
    if (!secret) throw new Error("Invalid NWC string: missing secret");
    if (!/^[0-9a-f]{64}$/i.test(walletPubkey)) throw new Error("Invalid NWC string: bad pubkey");
    if (!/^[0-9a-f]{64}$/i.test(secret)) throw new Error("Invalid NWC string: bad secret");
    return { walletPubkey, relayUrl, secret, encryptionMode: "nip44" };
}

export function validateNWCString(nwcString: string): string | null {
    try {
        parseNWCString(nwcString);
        return null;
    } catch (e) {
        return e instanceof Error ? e.message : "Invalid NWC string";
    }
}

async function encrypt(config: NWCConfig, plaintext: string): Promise<string> {
    const privkeyBytes = hexToBytes(config.secret);
    if (config.encryptionMode === "nip44") {
        const convKey = nip44.getConversationKey(privkeyBytes, config.walletPubkey);
        return nip44.encrypt(plaintext, convKey);
    }
    return nip04.encrypt(config.secret, config.walletPubkey, plaintext);
}

async function decrypt(config: NWCConfig, ciphertext: string): Promise<string> {
    const privkeyBytes = hexToBytes(config.secret);
    // Try NIP-44 first, fall back to NIP-04
    try {
        const convKey = nip44.getConversationKey(privkeyBytes, config.walletPubkey);
        return nip44.decrypt(ciphertext, convKey);
    } catch {
        return nip04.decrypt(config.secret, config.walletPubkey, ciphertext);
    }
}

// Single NWC request over a raw WebSocket
// Uses a raw WS instead of SimplePool to avoid the double-close race condition.

async function sendNWCRequest(
    config: NWCConfig,
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 10_000,
): Promise<unknown> {
    const privkeyBytes = hexToBytes(config.secret);
    const clientPubkey = getPublicKey(privkeyBytes);

    const payload = JSON.stringify({ method, params });
    const encrypted = await encrypt(config, payload);

    const encryptionTag = config.encryptionMode === "nip44"
        ? [["encryption", "nip44_v2"]]
        : [];

    const requestEvent = finalizeEvent(
        {
            kind: 23194,
            created_at: Math.floor(Date.now() / 1000),
            tags: [...encryptionTag, ["p", config.walletPubkey]],
            content: encrypted,
        },
        privkeyBytes,
    );

    return new Promise((resolve, reject) => {
        let settled = false;
        let ws: WebSocket;

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            // Close WS safely — it may already be closing
            try {
                if (ws && ws.readyState === WebSocket.OPEN) ws.close();
            } catch { /* ignore */ }
            fn();
        };

        const timer = setTimeout(() => {
            finish(() => reject(new Error(`NWC request timed out (${method})`)));
        }, timeoutMs);

        try {
            ws = new WebSocket(config.relayUrl);
        } catch (e) {
            clearTimeout(timer);
            reject(e);
            return;
        }

        ws.onopen = () => {
            // Subscribe for response first
            const subId = Math.random().toString(36).slice(2);
            const since = Math.floor(Date.now() / 1000) - 5;
            ws.send(JSON.stringify([
                "REQ", subId,
                {
                    kinds: [23195],
                    authors: [config.walletPubkey],
                    "#p": [clientPubkey],
                    "#e": [requestEvent.id],
                    since,
                },
            ]));
            // Then publish the request
            ws.send(JSON.stringify(["EVENT", requestEvent]));
        };

        ws.onmessage = async (msg) => {
            if (settled) return;
            try {
                const data = JSON.parse(msg.data as string);
                // data = ["EVENT", subId, event] or ["EOSE", subId] or ["OK", ...]
                if (!Array.isArray(data) || data[0] !== "EVENT") return;
                const event = data[2];
                if (!event?.content) return;

                let decrypted: string;
                try {
                    decrypted = await decrypt(config, event.content);
                } catch {
                    // Try flipping encryption mode and retry once
                    const flipped = { ...config, encryptionMode: config.encryptionMode === "nip44" ? "nip04" : "nip44" } as NWCConfig;
                    decrypted = await decrypt(flipped, event.content);
                }

                const parsed = JSON.parse(decrypted);
                if (parsed.error) {
                    finish(() => reject(new Error(`NWC ${parsed.error.code}: ${parsed.error.message}`)));
                } else {
                    finish(() => resolve(parsed.result));
                }
            } catch (e) {
                finish(() => reject(e));
            }
        };

        ws.onerror = (e) => {
            finish(() => reject(new Error(`NWC WebSocket error ${e}`)));
        };

        ws.onclose = () => {
            if (!settled) {
                finish(() => reject(new Error("NWC WebSocket closed before response")));
            }
        };
    });
}

// Public API

export async function lookupInvoice(
    config: NWCConfig,
    paymentHash: string,
): Promise<LookupInvoiceResult> {
    const result = await sendNWCRequest(config, "lookup_invoice", { payment_hash: paymentHash }) as {
        state?: string;
        preimage?: string;
        settled_at?: number;
    };
    return {
        state: (result.state ?? "pending") as LookupInvoiceResult["state"],
        preimage: result.preimage,
        settledAt: result.settled_at,
    };
}

// Poll lookup_invoice every intervalMs until settled/expired/failed or timeout.
// No probe — goes straight to lookup_invoice. If the first call errors,
// it logs and keeps retrying (relay may be briefly unavailable).
export function pollInvoiceSettlement(
    config: NWCConfig,
    paymentHash: string,
    onSettled: () => void,
    options: { intervalMs?: number; timeoutMs?: number } = {},
): () => void {
    const { intervalMs = 3_000, timeoutMs = 120_000 } = options;
    let cancelled = false;
    const startTime = Date.now();

    const check = async () => {
        if (cancelled) return;
        if (Date.now() - startTime > timeoutMs) return;
        try {
            const result = await lookupInvoice(config, paymentHash);
            if (result.state === "settled") {
                if (!cancelled) onSettled();
                return; // stop — caller's handledRef prevents double-fire
            }
            if (result.state === "expired" || result.state === "failed") {
                cancelled = true; // stop polling, zap fallback may still catch it
                return;
            }
            // pending / accepted — schedule next check
            if (!cancelled) setTimeout(check, intervalMs);
        } catch (e) {
            // Network error / timeout — keep retrying
            console.warn("NWC lookup_invoice error (retrying):", e);
            if (!cancelled) setTimeout(check, intervalMs);
        }
    };

    // Start immediately
    check();

    return () => { cancelled = true; };
}
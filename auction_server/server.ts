import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";
import * as nip04 from "nostr-tools/nip04";
import { hexToBytes } from "@noble/hashes/utils.js";
import * as fs from "fs";
import * as path from "path";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const LOCK_TIMEOUT_MS = 2 * 60 * 1000;
const CLEANUP_DELAY_MS = 60 * 1000;
const NWC_POLL_INTERVAL_MS = 3_000;
const NWC_FILE = path.join(process.cwd(), "nwc.json");

const RELAYS = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
];

// ─── NWC storage (JSON file, keyed by lightningAddress) ───────────────────────

function readNWCStore(): Record<string, string> {
    try {
        if (!fs.existsSync(NWC_FILE)) return {};
        return JSON.parse(fs.readFileSync(NWC_FILE, "utf-8"));
    } catch {
        return {};
    }
}

function writeNWCStore(store: Record<string, string>): void {
    try {
        fs.writeFileSync(NWC_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
        console.error("[NWC] Failed to write nwc.json:", e);
    }
}

function saveNWC(lightningAddress: string, nwcString: string): void {
    const store = readNWCStore();
    store[lightningAddress.toLowerCase().trim()] = nwcString;
    writeNWCStore(store);
    console.log(`[NWC] Saved NWC for ${lightningAddress}`);
}

function getNWC(lightningAddress: string): string | null {
    const store = readNWCStore();
    return store[lightningAddress.toLowerCase().trim()] ?? null;
}

// ─── NWC client (NIP-44 + NIP-04 fallback) ───────────────────────────────────

interface NWCConfig {
    walletPubkey: string;
    relayUrl: string;
    secret: string;
    encryptionMode: "nip44" | "nip04";
}

function parseNWCString(nwcString: string): NWCConfig {
    const str = nwcString.trim();
    if (!str.startsWith("nostr+walletconnect://")) throw new Error("Invalid NWC string");
    const withoutScheme = str.slice("nostr+walletconnect://".length);
    const qMark = withoutScheme.indexOf("?");
    if (qMark < 0) throw new Error("Invalid NWC string: missing query params");
    const walletPubkey = withoutScheme.slice(0, qMark);
    const params = new URLSearchParams(withoutScheme.slice(qMark + 1));
    const relayUrl = params.get("relay");
    const secret = params.get("secret");
    if (!relayUrl || !secret) throw new Error("Invalid NWC string: missing relay or secret");
    return { walletPubkey, relayUrl, secret, encryptionMode: "nip44" };
}

async function nwcEncrypt(config: NWCConfig, plaintext: string): Promise<string> {
    const privkeyBytes = hexToBytes(config.secret);
    if (config.encryptionMode === "nip44") {
        const convKey = nip44.getConversationKey(privkeyBytes, config.walletPubkey);
        return nip44.encrypt(plaintext, convKey);
    }
    return nip04.encrypt(config.secret, config.walletPubkey, plaintext);
}

async function nwcDecrypt(config: NWCConfig, ciphertext: string): Promise<string> {
    const privkeyBytes = hexToBytes(config.secret);
    try {
        const convKey = nip44.getConversationKey(privkeyBytes, config.walletPubkey);
        return nip44.decrypt(ciphertext, convKey);
    } catch {
        return nip04.decrypt(config.secret, config.walletPubkey, ciphertext);
    }
}

async function lookupInvoice(config: NWCConfig, paymentHash: string): Promise<string> {
    const privkeyBytes = hexToBytes(config.secret);
    const clientPubkey = getPublicKey(privkeyBytes);

    const payload = JSON.stringify({ method: "lookup_invoice", params: { payment_hash: paymentHash } });
    const encrypted = await nwcEncrypt(config, payload);

    const encryptionTag = config.encryptionMode === "nip44" ? [["encryption", "nip44_v2"]] : [];
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
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { if (ws.readyState === ws.OPEN) ws.close(); } catch { }
            fn();
        };

        const timer = setTimeout(() => finish(() => reject(new Error("NWC lookup_invoice timed out"))), 10_000);

        const ws = new (require("ws"))(config.relayUrl);

        ws.on("open", () => {
            const subId = Math.random().toString(36).slice(2);
            ws.send(JSON.stringify(["REQ", subId, {
                kinds: [23195],
                authors: [config.walletPubkey],
                "#p": [clientPubkey],
                "#e": [requestEvent.id],
                since: Math.floor(Date.now() / 1000) - 5,
            }]));
            ws.send(JSON.stringify(["EVENT", requestEvent]));
        });

        ws.on("message", async (raw: Buffer) => {
            if (settled) return;
            try {
                const data = JSON.parse(raw.toString());
                if (!Array.isArray(data) || data[0] !== "EVENT") return;
                const event = data[2];
                if (!event?.content) return;
                let decrypted: string;
                try {
                    decrypted = await nwcDecrypt(config, event.content);
                } catch {
                    const flipped = { ...config, encryptionMode: config.encryptionMode === "nip44" ? "nip04" : "nip44" } as NWCConfig;
                    decrypted = await nwcDecrypt(flipped, event.content);
                }
                const parsed = JSON.parse(decrypted);
                if (parsed.error) {
                    finish(() => reject(new Error(`NWC error: ${parsed.error.message}`)));
                } else {
                    finish(() => resolve(parsed.result?.state ?? "pending"));
                }
            } catch (e) {
                finish(() => reject(e));
            }
        });

        ws.on("error", (e: Error) => finish(() => reject(e)));
        ws.on("close", () => { if (!settled) finish(() => reject(new Error("NWC WS closed early"))); });
    });
}

// ─── Nostr rehydration ────────────────────────────────────────────────────────

const pieceBidTag = (pieceId: string) => `glassabbey-bid:${pieceId}`;

async function fetchPriceFromNostr(pieceId: string): Promise<number> {
    const pool = new SimplePool();
    return new Promise((resolve) => {
        const bids: { willingAmt: number; submitAmt: number }[] = [];
        const done = () => {
            pool.close(RELAYS);
            const top = bids.sort((a, b) => b.willingAmt - a.willingAmt)[0];
            const price = top ? top.willingAmt - top.submitAmt : 0;
            console.log(`[${pieceId}] Rehydrated currentPrice=${price} from ${bids.length} nostr bids`);
            resolve(price);
        };
        const timeout = setTimeout(done, 5000);
        const sub = pool.subscribeMany(
            RELAYS,
            { kinds: [30078], "#t": [pieceBidTag(pieceId)], limit: 100 },
            {
                onevent(event) {
                    try {
                        const data = JSON.parse(event.content);
                        if (data.willingAmt && data.submitAmt) {
                            bids.push({ willingAmt: data.willingAmt, submitAmt: data.submitAmt });
                        }
                    } catch { }
                },
                oneose() { clearTimeout(timeout); sub.close(); done(); },
            }
        );
    });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lock {
    ws: WebSocket;
    bidderName: string;
    bidAmt: number;
    submitAmt: number;
    willingAmt: number;
    timer: ReturnType<typeof setTimeout>;
}

interface NWCPoll {
    timer: ReturnType<typeof setTimeout> | null;
    cancelled: boolean;
    paymentHash: string;
    lightningAddress: string;
}

interface PieceState {
    currentPrice: number;
    rehydrated: boolean;
    rehydrating: boolean;
    pendingClients: WebSocket[];
    lock: Lock | null;
    lastConfirmedWillingAmt: number | null;
    nwcPoll: NWCPoll | null;
    clients: Set<WebSocket>;
    cleanupTimer: ReturnType<typeof setTimeout> | null;
}

interface SubmitBidMessage { type: "SUBMIT_BID"; bidderName: string; bidAmt: number; submitAmt: number; }
interface CancelBidMessage { type: "CANCEL_BID"; }
interface ZapConfirmedMessage { type: "ZAP_CONFIRMED"; }
interface StartPaymentMessage { type: "START_PAYMENT"; paymentHash: string; lightningAddress: string; }
type ClientMessage = SubmitBidMessage | CancelBidMessage | ZapConfirmedMessage | StartPaymentMessage;

// ─── Piece state ──────────────────────────────────────────────────────────────

const pieces = new Map<string, PieceState>();

function getPiece(pieceId: string): PieceState {
    if (!pieces.has(pieceId)) {
        pieces.set(pieceId, {
            currentPrice: 0,
            rehydrated: false,
            rehydrating: false,
            pendingClients: [],
            lock: null,
            lastConfirmedWillingAmt: null,
            nwcPoll: null,
            clients: new Set(),
            cleanupTimer: null,
        });
    }
    return pieces.get(pieceId)!;
}

function send(ws: WebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(piece: PieceState, message: object, excludeWs?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const client of piece.clients) {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) client.send(data);
    }
}

function clearLock(piece: PieceState, pieceId: string, reason = "LOCK_EXPIRED"): void {
    if (!piece.lock) return;
    clearTimeout(piece.lock.timer);
    piece.lock = null;
    console.log(`[${pieceId}] Lock cleared: ${reason}`);
    broadcast(piece, { type: reason });
}

function sendState(ws: WebSocket, piece: PieceState): void {
    send(ws, { type: "STATE", currentPrice: piece.currentPrice, locked: !!piece.lock });
}

function tryAcquireLock(piece: PieceState, pieceId: string, ws: WebSocket, bidderName: string, bidAmt: number, submitAmt: number): void {
    if (bidAmt <= 0) { send(ws, { type: "BID_REJECTED", reason: "Bid increment must be positive" }); return; }
    if (submitAmt > bidAmt) { send(ws, { type: "BID_REJECTED", reason: "Submit cannot exceed bid increment" }); return; }
    if (piece.lock) { send(ws, { type: "BID_QUEUED", reason: "Someone else is currently completing a payment, please wait" }); return; }

    const willingAmt = piece.currentPrice + bidAmt;
    const timer = setTimeout(() => {
        console.log(`[${pieceId}] Lock timed out for ${bidderName}`);
        clearLock(piece, pieceId, "LOCK_EXPIRED");
    }, LOCK_TIMEOUT_MS);

    piece.lock = { ws, bidderName, bidAmt, submitAmt, willingAmt, timer };
    console.log(`[${pieceId}] Lock acquired by ${bidderName}: bidAmt=${bidAmt}, submitAmt=${submitAmt}, willingAmt=${willingAmt}`);
    send(ws, { type: "BID_WON", willingAmt, submitAmt, bidderName });
    broadcast(piece, { type: "BID_LOCKED", reason: "A bidder is completing payment, please wait" }, ws);
}

// ─── NWC polling (server-side) ────────────────────────────────────────────────

function stopNWCPoll(piece: PieceState, pieceId: string): void {
    if (!piece.nwcPoll) return;
    piece.nwcPoll.cancelled = true;
    if (piece.nwcPoll.timer) clearTimeout(piece.nwcPoll.timer);
    piece.nwcPoll = null;
    console.log(`[${pieceId}] NWC poll stopped`);
}

function startNWCPoll(piece: PieceState, pieceId: string, paymentHash: string, lightningAddress: string): void {
    // Stop any existing poll first
    stopNWCPoll(piece, pieceId);

    const nwcString = getNWC(lightningAddress);
    if (!nwcString) {
        console.log(`[${pieceId}] No NWC string for ${lightningAddress} — skipping NWC poll`);
        return;
    }

    let config: NWCConfig;
    try {
        config = parseNWCString(nwcString);
    } catch (e) {
        console.error(`[${pieceId}] Invalid NWC string for ${lightningAddress}:`, e);
        return;
    }

    const poll: NWCPoll = { timer: null, cancelled: false, paymentHash, lightningAddress };
    piece.nwcPoll = poll;

    const startTime = Date.now();
    const TIMEOUT_MS = LOCK_TIMEOUT_MS;

    console.log(`[${pieceId}] NWC poll started for paymentHash=${paymentHash}`);

    const check = async () => {
        if (poll.cancelled) return;
        if (Date.now() - startTime > TIMEOUT_MS) {
            console.log(`[${pieceId}] NWC poll timed out`);
            stopNWCPoll(piece, pieceId);
            return;
        }

        try {
            const state = await lookupInvoice(config, paymentHash);
            console.log(`[${pieceId}] NWC lookup_invoice state=${state}`);

            if (poll.cancelled) return;

            if (state === "settled") {
                console.log(`[${pieceId}] NWC confirmed payment settled`);
                stopNWCPoll(piece, pieceId);
                // Broadcast to all clients — Payment.tsx listens for this
                broadcast(piece, { type: "PAYMENT_CONFIRMED" });
                return;
            }

            if (state === "expired" || state === "failed") {
                console.log(`[${pieceId}] NWC invoice ${state} — stopping poll`);
                stopNWCPoll(piece, pieceId);
                return;
            }

            // pending / accepted — keep polling
            if (!poll.cancelled) {
                poll.timer = setTimeout(check, NWC_POLL_INTERVAL_MS);
            }
        } catch (e) {
            console.warn(`[${pieceId}] NWC lookup error (retrying):`, e);
            if (!poll.cancelled) {
                poll.timer = setTimeout(check, NWC_POLL_INTERVAL_MS);
            }
        }
    };

    check();
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

// Separate handler for NWC registration (no pieceId needed)
wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const pieceId = url.searchParams.get("pieceId");
    const action = url.searchParams.get("action");

    // ── NWC registration endpoint: ?action=register ──
    if (action === "register") {
        ws.on("message", (raw: Buffer) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "REGISTER_NWC" && msg.lightningAddress && msg.nwcString) {
                    saveNWC(msg.lightningAddress, msg.nwcString);
                    send(ws, { type: "NWC_REGISTERED" });
                }
            } catch {
                send(ws, { type: "ERROR", reason: "Invalid message" });
            }
        });
        return;
    }

    // ── Normal auction endpoint: ?pieceId=... ──
    if (!pieceId) { ws.close(1008, "Missing pieceId"); return; }

    const piece = getPiece(pieceId);
    piece.clients.add(ws);

    if (piece.cleanupTimer) {
        clearTimeout(piece.cleanupTimer);
        piece.cleanupTimer = null;
    }

    console.log(`[${pieceId}] Client connected (${piece.clients.size} total)`);

    if (piece.rehydrated) {
        sendState(ws, piece);
    } else if (piece.rehydrating) {
        piece.pendingClients.push(ws);
    } else {
        piece.rehydrating = true;
        piece.pendingClients.push(ws);
        const price = await fetchPriceFromNostr(pieceId);
        piece.currentPrice = price;
        piece.rehydrated = true;
        piece.rehydrating = false;
        for (const client of piece.pendingClients) {
            if (client.readyState === WebSocket.OPEN) sendState(client, piece);
        }
        piece.pendingClients = [];
    }

    ws.on("message", (raw: Buffer) => {
        let msg: ClientMessage;
        try { msg = JSON.parse(raw.toString()) as ClientMessage; }
        catch { send(ws, { type: "ERROR", reason: "Invalid JSON" }); return; }

        console.log(`[${pieceId}] Message:`, msg.type);

        switch (msg.type) {
            case "SUBMIT_BID": {
                const { bidderName, bidAmt, submitAmt } = msg;
                if (!bidderName || !bidAmt || !submitAmt) {
                    send(ws, { type: "ERROR", reason: "Missing bidderName, bidAmt, or submitAmt" });
                    return;
                }
                tryAcquireLock(piece, pieceId, ws, bidderName, bidAmt, submitAmt);
                break;
            }
            case "CANCEL_BID": {
                if (piece.lock?.ws === ws) {
                    console.log(`[${pieceId}] Lock cancelled by ${piece.lock.bidderName}`);
                    clearLock(piece, pieceId, "LOCK_EXPIRED");
                }
                // Also stop any NWC poll
                stopNWCPoll(piece, pieceId);
                break;
            }
            case "START_PAYMENT": {
                const { paymentHash, lightningAddress } = msg;
                if (!paymentHash || !lightningAddress) {
                    send(ws, { type: "ERROR", reason: "Missing paymentHash or lightningAddress" });
                    return;
                }
                console.log(`[${pieceId}] START_PAYMENT received for ${lightningAddress}`);
                startNWCPoll(piece, pieceId, paymentHash, lightningAddress);
                break;
            }
            case "ZAP_CONFIRMED": {
                if (!piece.lock) {
                    console.log(`[${pieceId}] ZAP_CONFIRMED with no lock held — ignoring`);
                    return;
                }

                const { bidderName, bidAmt, submitAmt, willingAmt } = piece.lock;

                if (piece.lastConfirmedWillingAmt === willingAmt) {
                    console.log(`[${pieceId}] ZAP_CONFIRMED duplicate willingAmt=${willingAmt} — ignoring`);
                    return;
                }

                if (piece.lock.ws !== ws) {
                    console.log(`[${pieceId}] ZAP_CONFIRMED from non-lock socket — accepting (mobile path)`);
                }

                // Stop NWC poll — payment already confirmed via zap
                stopNWCPoll(piece, pieceId);

                piece.lastConfirmedWillingAmt = willingAmt;
                piece.currentPrice = piece.currentPrice + bidAmt - submitAmt;
                console.log(`[${pieceId}] Zap confirmed by ${bidderName}, new price: ${piece.currentPrice}`);
                clearTimeout(piece.lock.timer);
                piece.lock = null;

                broadcast(piece, { type: "NEW_BID", bidderName, willingAmt, submitAmt, currentPrice: piece.currentPrice });
                break;
            }
            default:
                send(ws, { type: "ERROR", reason: "Unknown message type" });
        }
    });

    ws.on("close", () => {
        piece.clients.delete(ws);
        console.log(`[${pieceId}] Client disconnected (${piece.clients.size} remaining)`);

        if (piece.lock?.ws === ws) {
            console.log(`[${pieceId}] Lock holder disconnected, releasing lock`);
            clearLock(piece, pieceId, "LOCK_EXPIRED");
            stopNWCPoll(piece, pieceId);
        }

        if (piece.clients.size === 0 && !piece.lock) {
            piece.cleanupTimer = setTimeout(() => {
                if (piece.clients.size === 0 && !piece.lock) {
                    stopNWCPoll(piece, pieceId);
                    pieces.delete(pieceId);
                    console.log(`[${pieceId}] Piece state cleaned up after delay`);
                }
            }, CLEANUP_DELAY_MS);
        }
    });

    ws.on("error", (err: Error) => console.error(`[${pieceId}] WebSocket error:`, err));
});

console.log(`Auction server running on ws://localhost:${PORT}`);
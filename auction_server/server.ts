import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { SimplePool } from "nostr-tools/pool";
import { finalizeEvent, getPublicKey } from "nostr-tools";
import * as nip44 from "nostr-tools/nip44";
import * as nip04 from "nostr-tools/nip04";
import { hexToBytes } from "@noble/hashes/utils.js";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const LOCK_TIMEOUT_MS = 1 * 60 * 1000;
const CLEANUP_DELAY_MS = 60 * 1000;
const NWC_WS_REFRESH_MS = 30_000;
const NWC_FILE = path.join(process.cwd(), "nwc.json");
const BIDS_FILE = path.join(process.cwd(), "bids.json");

const RELAYS = [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://nostr.mom",
    "wss://relay.angor.io/",
];

// ─── bids.json ────────────────────────────────────────────────────────────────

interface BidRecord {
    currentPrice: number;
    bidderName: string;
    willingAmt: number;
    submitAmt: number;
    confirmedAt: number;
}

function readBidsStore(): Record<string, BidRecord> {
    try {
        if (!fs.existsSync(BIDS_FILE)) return {};
        return JSON.parse(fs.readFileSync(BIDS_FILE, "utf-8"));
    } catch {
        return {};
    }
}

function writeBid(pieceId: string, record: BidRecord): void {
    try {
        const store = readBidsStore();
        store[pieceId] = record;
        fs.writeFileSync(BIDS_FILE, JSON.stringify(store, null, 2));
        console.log(`[${pieceId}] bids.json updated — currentPrice=${record.currentPrice}`);
    } catch (e) {
        console.error(`[${pieceId}] Failed to write bids.json:`, e);
    }
}

function getStoredPrice(pieceId: string): number | null {
    const store = readBidsStore();
    return store[pieceId]?.currentPrice ?? null;
}

// ─── nwc.json ─────────────────────────────────────────────────────────────────

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

// ─── NWC client ───────────────────────────────────────────────────────────────

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

async function nwcDecrypt(config: NWCConfig, ciphertext: string): Promise<string> {
    const privkeyBytes = hexToBytes(config.secret);
    try {
        const convKey = nip44.getConversationKey(privkeyBytes, config.walletPubkey);
        return nip44.decrypt(ciphertext, convKey);
    } catch {
        return nip04.decrypt(config.secret, config.walletPubkey, ciphertext);
    }
}

// ─── Nostr rehydration ────────────────────────────────────────────────────────

const pieceBidTag = (pieceId: string) => `glassabbey-bid:${pieceId}`;

async function fetchPriceFromNostr(pieceId: string): Promise<number> {
    const pool = new SimplePool();
    return new Promise((resolve) => {
        const bids: { willingAmt: number; submitAmt: number }[] = [];
        let eoseCount = 0;

        const done = () => {
            pool.close(RELAYS);
            const top = bids.sort((a, b) => b.willingAmt - a.willingAmt)[0];
            const price = top ? top.willingAmt - top.submitAmt : 0;
            console.log(`[${pieceId}] Nostr rehydration: currentPrice=${price} from ${bids.length} bids`);
            resolve(price);
        };

        const timeout = setTimeout(done, 7000);

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
                oneose() {
                    eoseCount++;
                    console.log(`[${pieceId}] Nostr EOSE ${eoseCount}/${RELAYS.length}`);
                    if (eoseCount >= RELAYS.length) {
                        clearTimeout(timeout);
                        sub.close();
                        done();
                    }
                },
            }
        );
    });
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Lock {
    ws: WebSocket;
    lockToken: string;   // UUID sent to winning bidder — used for cancel identity
    bidderName: string;
    bidAmt: number;
    submitAmt: number;
    willingAmt: number;
    timer: ReturnType<typeof setTimeout>;
}

interface NWCSubscription {
    cancelled: boolean;
    paymentHash: string;
    lightningAddress: string;
    ws: InstanceType<typeof WebSocket> | null;
    refreshTimer: ReturnType<typeof setTimeout> | null;
    lockStartTime: number;
}

interface PieceState {
    currentPrice: number;
    rehydrated: boolean;
    rehydrating: boolean;
    pendingClients: WebSocket[];
    lock: Lock | null;
    lastConfirmedWillingAmt: number | null;
    nwcSub: NWCSubscription | null;
    clients: Set<WebSocket>;
    cleanupTimer: ReturnType<typeof setTimeout> | null;
}

interface SubmitBidMessage { type: "SUBMIT_BID"; bidderName: string; bidAmt: number; submitAmt: number; }
interface CancelBidMessage { type: "CANCEL_BID"; lockToken: string; }
interface ZapConfirmedMessage { type: "ZAP_CONFIRMED"; }
interface StartPaymentMessage { type: "START_PAYMENT"; paymentHash: string; lightningAddress: string; }
interface CheckPaymentMessage { type: "CHECK_PAYMENT"; lockToken: string; willingAmt: number; }
type ClientMessage =
    | SubmitBidMessage
    | CancelBidMessage
    | ZapConfirmedMessage
    | StartPaymentMessage
    | CheckPaymentMessage;

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
            nwcSub: null,
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
    send(ws, {
        type: "STATE",
        currentPrice: piece.currentPrice,
        locked: !!piece.lock,
        // Expose the current lock's willingAmt publicly so reconnecting
        // Payment.tsx can identify if its bid is still the active lock
        lockWillingAmt: piece.lock?.willingAmt ?? null,
    });
}

function tryAcquireLock(
    piece: PieceState,
    pieceId: string,
    ws: WebSocket,
    bidderName: string,
    bidAmt: number,
    submitAmt: number,
): void {
    if (bidAmt <= 0) { send(ws, { type: "BID_REJECTED", reason: "Bid increment must be positive" }); return; }
    if (submitAmt > bidAmt) { send(ws, { type: "BID_REJECTED", reason: "Submit cannot exceed bid increment" }); return; }
    if (piece.lock) { send(ws, { type: "BID_QUEUED", reason: "Someone else is currently completing a payment, please wait" }); return; }

    const willingAmt = piece.currentPrice + bidAmt;
    const lockToken = randomUUID();

    const timer = setTimeout(() => {
        console.log(`[${pieceId}] Lock timed out for ${piece.lock?.bidderName ?? bidderName}`);
        stopNWCSub(piece, pieceId);
        clearLock(piece, pieceId, "LOCK_EXPIRED");
    }, LOCK_TIMEOUT_MS);

    piece.lock = { ws, lockToken, bidderName, bidAmt, submitAmt, willingAmt, timer };
    console.log(`[${pieceId}] Lock acquired by ${bidderName}: bidAmt=${bidAmt}, submitAmt=${submitAmt}, willingAmt=${willingAmt}, lockToken=${lockToken}`);

    // Send lockToken only to the winning bidder — no one else ever sees it
    send(ws, { type: "BID_WON", willingAmt, submitAmt, bidderName, lockToken });
    broadcast(piece, { type: "BID_LOCKED", reason: "A bidder is completing payment, please wait" }, ws);
}

// ─── Confirm payment ──────────────────────────────────────────────────────────

function confirmPayment(piece: PieceState, pieceId: string, source: "nwc" | "zap"): void {
    if (!piece.lock) {
        console.log(`[${pieceId}] confirmPayment(${source}) — no lock held, ignoring`);
        return;
    }

    const { bidderName, bidAmt, submitAmt, willingAmt } = piece.lock;

    if (piece.lastConfirmedWillingAmt === willingAmt) {
        console.log(`[${pieceId}] confirmPayment(${source}) — duplicate willingAmt=${willingAmt}, ignoring`);
        return;
    }

    console.log(`[${pieceId}] Payment confirmed via ${source} by ${bidderName}, willingAmt=${willingAmt}`);

    stopNWCSub(piece, pieceId);

    const newPrice = piece.currentPrice + bidAmt - submitAmt;
    piece.lastConfirmedWillingAmt = willingAmt;
    piece.currentPrice = newPrice;

    writeBid(pieceId, {
        currentPrice: newPrice,
        bidderName,
        willingAmt,
        submitAmt,
        confirmedAt: Date.now(),
    });

    clearTimeout(piece.lock.timer);
    piece.lock = null;

    console.log(`[${pieceId}] Broadcasting NEW_BID — new currentPrice=${newPrice}`);
    broadcast(piece, { type: "NEW_BID", bidderName, willingAmt, submitAmt, currentPrice: newPrice });
}

// ─── NWC notification subscription ───────────────────────────────────────────

function stopNWCSub(piece: PieceState, pieceId: string): void {
    if (!piece.nwcSub) return;
    piece.nwcSub.cancelled = true;
    if (piece.nwcSub.refreshTimer) clearTimeout(piece.nwcSub.refreshTimer);
    try {
        if (piece.nwcSub.ws && piece.nwcSub.ws.readyState === WebSocket.OPEN) {
            piece.nwcSub.ws.close();
        }
    } catch { }
    piece.nwcSub = null;
    console.log(`[${pieceId}] NWC subscription stopped`);
}

function startNWCSub(
    piece: PieceState,
    pieceId: string,
    paymentHash: string,
    lightningAddress: string,
): void {
    stopNWCSub(piece, pieceId);

    const nwcString = getNWC(lightningAddress);
    if (!nwcString) {
        console.log(`[${pieceId}] No NWC string for ${lightningAddress} — zap fallback only`);
        return;
    }

    let config: NWCConfig;
    try {
        config = parseNWCString(nwcString);
    } catch (e) {
        console.error(`[${pieceId}] Invalid NWC string:`, e);
        return;
    }

    const sub: NWCSubscription = {
        cancelled: false,
        paymentHash,
        lightningAddress,
        ws: null,
        refreshTimer: null,
        lockStartTime: Math.floor(Date.now() / 1000),
    };
    piece.nwcSub = sub;

    const privkeyBytes = hexToBytes(config.secret);
    const clientPubkey = getPublicKey(privkeyBytes);

    const connect = (since: number) => {
        if (sub.cancelled) return;

        console.log(`[${pieceId}] NWC subscription connecting (since=${since})`);

        let ws: InstanceType<typeof WebSocket>;
        try {
            ws = new (require("ws"))(config.relayUrl);
        } catch (e) {
            console.error(`[${pieceId}] NWC WS connect error:`, e);
            return;
        }
        sub.ws = ws;

        ws.on("open", () => {
            if (sub.cancelled) { ws.close(); return; }
            console.log(`[${pieceId}] NWC subscription open — listening for payment_received`);
            const subId = Math.random().toString(36).slice(2);
            ws.send(JSON.stringify(["REQ", subId, {
                kinds: [23197],
                authors: [config.walletPubkey],
                "#p": [clientPubkey],
                since,
            }]));
        });

        ws.on("message", async (raw: Buffer) => {
            if (sub.cancelled) return;
            try {
                const data = JSON.parse(raw.toString());
                if (!Array.isArray(data) || data[0] !== "EVENT") return;
                const event = data[2];
                if (!event?.content) return;

                console.log(`[${pieceId}] NWC notification event received`);

                let decrypted: string;
                try {
                    decrypted = await nwcDecrypt(config, event.content);
                } catch {
                    const flipped = { ...config, encryptionMode: config.encryptionMode === "nip44" ? "nip04" : "nip44" } as NWCConfig;
                    decrypted = await nwcDecrypt(flipped, event.content);
                }

                const parsed = JSON.parse(decrypted);
                console.log(`[${pieceId}] NWC notification type=${parsed.notification_type}`);

                if (parsed.notification_type !== "payment_received") return;

                const notifPaymentHash = parsed.notification?.payment_hash;
                console.log(`[${pieceId}] NWC payment_received — hash=${notifPaymentHash}, expected=${sub.paymentHash}`);

                if (notifPaymentHash !== sub.paymentHash) {
                    console.log(`[${pieceId}] NWC payment_received — hash mismatch, ignoring`);
                    return;
                }

                console.log(`[${pieceId}] NWC payment_received — hash matched! Confirming payment`);
                confirmPayment(piece, pieceId, "nwc");

            } catch (e) {
                console.warn(`[${pieceId}] NWC notification parse error:`, e);
            }
        });

        ws.on("error", (e: Error) => {
            console.warn(`[${pieceId}] NWC subscription WS error:`, e.message);
        });

        ws.on("close", () => {
            if (!sub.cancelled) {
                console.log(`[${pieceId}] NWC subscription WS closed unexpectedly`);
            }
        });

        sub.refreshTimer = setTimeout(() => {
            if (sub.cancelled) return;
            console.log(`[${pieceId}] NWC subscription refresh — reconnecting`);
            try { ws.close(); } catch { }
            connect(sub.lockStartTime);
        }, NWC_WS_REFRESH_MS);
    };

    console.log(`[${pieceId}] NWC subscription starting for paymentHash=${paymentHash}`);
    connect(sub.lockStartTime);
}

// ─── WebSocket server ─────────────────────────────────────────────────────────

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const pieceId = url.searchParams.get("pieceId");
    const action = url.searchParams.get("action");

    // ── NWC registration: ?action=register ──
    if (action === "register") {
        ws.on("message", (raw: Buffer) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === "REGISTER_NWC" && msg.lightningAddress && msg.nwcString) {
                    saveNWC(msg.lightningAddress, msg.nwcString);
                    send(ws, { type: "NWC_REGISTERED" });
                    console.log(`[register] NWC registered for ${msg.lightningAddress}`);
                }
            } catch {
                send(ws, { type: "ERROR", reason: "Invalid message" });
            }
        });
        return;
    }

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

        const storedPrice = getStoredPrice(pieceId);
        if (storedPrice !== null) {
            console.log(`[${pieceId}] Rehydrated from bids.json: currentPrice=${storedPrice}`);
            piece.currentPrice = storedPrice;
        } else {
            console.log(`[${pieceId}] No bids.json entry — fetching from Nostr relays`);
            piece.currentPrice = await fetchPriceFromNostr(pieceId);
        }

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

        console.log(`[${pieceId}] Message: ${msg.type}`);

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
                // Match by lockToken — unguessable UUID known only to the winning bidder.
                // Safe across reconnects: even a new socket can cancel if it has the token.
                const { lockToken } = msg;
                if (!lockToken) {
                    send(ws, { type: "ERROR", reason: "Missing lockToken" });
                    return;
                }
                if (piece.lock?.lockToken === lockToken) {
                    console.log(`[${pieceId}] Lock cancelled by token — bidder: ${piece.lock.bidderName}`);
                    stopNWCSub(piece, pieceId);
                    clearLock(piece, pieceId, "LOCK_EXPIRED");
                } else {
                    console.log(`[${pieceId}] CANCEL_BID with wrong or stale lockToken — ignoring`);
                }
                break;
            }
            case "START_PAYMENT": {
                const { paymentHash, lightningAddress } = msg;
                if (!paymentHash || !lightningAddress) {
                    send(ws, { type: "ERROR", reason: "Missing paymentHash or lightningAddress" });
                    return;
                }
                console.log(`[${pieceId}] START_PAYMENT — starting NWC subscription for ${lightningAddress}`);
                startNWCSub(piece, pieceId, paymentHash, lightningAddress);
                break;
            }
            case "ZAP_CONFIRMED": {
                if (!piece.lock) {
                    console.log(`[${pieceId}] ZAP_CONFIRMED — no lock held, ignoring`);
                    return;
                }
                console.log(`[${pieceId}] ZAP_CONFIRMED received`);
                confirmPayment(piece, pieceId, "zap");
                break;
            }
            case "CHECK_PAYMENT": {
                // Client reconnected after going to wallet app — check if their payment
                // was already confirmed while they were backgrounded.
                const { lockToken, willingAmt } = msg;
                if (!lockToken || !willingAmt) {
                    send(ws, { type: "ERROR", reason: "Missing lockToken or willingAmt" });
                    return;
                }

                console.log(`[${pieceId}] CHECK_PAYMENT — lockToken=${lockToken}, willingAmt=${willingAmt}`);

                // Case 1: payment was already confirmed — lastConfirmedWillingAmt matches
                if (piece.lastConfirmedWillingAmt === willingAmt) {
                    console.log(`[${pieceId}] CHECK_PAYMENT — already confirmed, notifying client`);
                    send(ws, { type: "PAYMENT_ALREADY_CONFIRMED", willingAmt });
                    return;
                }

                // Case 2: lock is still active and this client is the lock holder
                if (piece.lock?.lockToken === lockToken) {
                    console.log(`[${pieceId}] CHECK_PAYMENT — lock still active, client is lock holder`);
                    send(ws, { type: "LOCK_STILL_ACTIVE", willingAmt, submitAmt: piece.lock.submitAmt });
                    return;
                }

                // Case 3: lock expired without confirmation (payment failed or timed out)
                console.log(`[${pieceId}] CHECK_PAYMENT — lock expired, no confirmation found`);
                send(ws, { type: "PAYMENT_NOT_FOUND" });
                break;
            }
            default:
                send(ws, { type: "ERROR", reason: "Unknown message type" });
        }
    });

    ws.on("close", () => {
        piece.clients.delete(ws);
        console.log(`[${pieceId}] Client disconnected (${piece.clients.size} remaining)`);

        // Do NOT release lock on disconnect — mobile users leave browser to open
        // wallet app. Lock survives; 2-minute timer is the only expiry.
        if (piece.lock?.ws === ws) {
            console.log(`[${pieceId}] Lock holder disconnected — lock kept alive (mobile payment in progress)`);
        }

        if (piece.clients.size === 0 && !piece.lock) {
            piece.cleanupTimer = setTimeout(() => {
                if (piece.clients.size === 0 && !piece.lock) {
                    stopNWCSub(piece, pieceId);
                    pieces.delete(pieceId);
                    console.log(`[${pieceId}] Piece state cleaned up`);
                }
            }, CLEANUP_DELAY_MS);
        }
    });

    ws.on("error", (err: Error) => console.error(`[${pieceId}] WS error:`, err));
});

console.log(`Auction server running on ws://localhost:${PORT}`);
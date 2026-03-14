import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { SimplePool } from "nostr-tools/pool";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
const CLEANUP_DELAY_MS = 60 * 1000;    // 60s after last client leaves
const RELAYS = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
];

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
                oneose() {
                    clearTimeout(timeout);
                    sub.close();
                    done();
                },
            }
        );
    });
}

interface Lock {
    ws: WebSocket;
    bidderName: string;
    bidAmt: number;
    submitAmt: number;
    willingAmt: number;
    timer: ReturnType<typeof setTimeout>;
}

interface PieceState {
    currentPrice: number;
    rehydrated: boolean;
    rehydrating: boolean;
    pendingClients: WebSocket[];
    lock: Lock | null;
    clients: Set<WebSocket>;
    cleanupTimer: ReturnType<typeof setTimeout> | null;
}

interface SubmitBidMessage { type: "SUBMIT_BID"; bidderName: string; bidAmt: number; submitAmt: number; }
interface CancelBidMessage { type: "CANCEL_BID"; }
interface ZapConfirmedMessage { type: "ZAP_CONFIRMED"; }
type ClientMessage = SubmitBidMessage | CancelBidMessage | ZapConfirmedMessage;

const pieces = new Map<string, PieceState>();

// Track which pieceId each WebSocket belongs to, so we can find the lock
// even when the confirming socket is a reconnect or different instance.
const socketPieceMap = new Map<WebSocket, string>();

function getPiece(pieceId: string): PieceState {
    if (!pieces.has(pieceId)) {
        pieces.set(pieceId, {
            currentPrice: 0,
            rehydrated: false,
            rehydrating: false,
            pendingClients: [],
            lock: null,
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

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const pieceId = url.searchParams.get("pieceId");

    if (!pieceId) { ws.close(1008, "Missing pieceId"); return; }

    socketPieceMap.set(ws, pieceId);

    const piece = getPiece(pieceId);
    piece.clients.add(ws);

    // Cancel any pending cleanup since a client just connected
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

        console.log(`[${pieceId}] Message:`, msg);

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
                break;
            }
            case "ZAP_CONFIRMED": {
                // Accept ZAP_CONFIRMED from either:
                //   (a) the socket that holds the lock  — normal case
                //   (b) any socket for this pieceId     — mobile reconnect / new WS case
                // We trust the message came from a legit client because only
                // the winning bidder is ever sent the BID_WON message with the
                // correct willingAmt / submitAmt.
                if (!piece.lock) {
                    // Lock already cleared (e.g. duplicate confirm) — just ack and ignore
                    console.log(`[${pieceId}] ZAP_CONFIRMED received but no lock held — ignoring`);
                    return;
                }

                const isLockHolder = piece.lock.ws === ws;
                if (!isLockHolder) {
                    // Mobile reconnect or throwaway-WS path: the message came from a
                    // different socket but for the same pieceId. Accept it.
                    console.log(`[${pieceId}] ZAP_CONFIRMED from non-lock socket — accepting (mobile reconnect path)`);
                }

                const { bidderName, bidAmt, submitAmt, willingAmt } = piece.lock;
                piece.currentPrice = piece.currentPrice + bidAmt - submitAmt;
                console.log(`[${pieceId}] Zap confirmed by ${bidderName}, new price: ${piece.currentPrice}`);
                clearTimeout(piece.lock.timer);
                piece.lock = null;

                // Broadcast NEW_BID to ALL clients (including the confirming socket).
                // The confirming client is navigating away immediately, so it won't
                // render the update — but crucially all OTHER clients (including the
                // mobile's original shared socket) will receive it and unlock.
                const newBidMsg = { type: "NEW_BID", bidderName, willingAmt, submitAmt, currentPrice: piece.currentPrice };
                broadcast(piece, newBidMsg);
                break;
            }
            default:
                send(ws, { type: "ERROR", reason: "Unknown message type" });
        }
    });

    ws.on("close", () => {
        piece.clients.delete(ws);
        socketPieceMap.delete(ws);
        console.log(`[${pieceId}] Client disconnected (${piece.clients.size} remaining)`);

        if (piece.lock?.ws === ws) {
            console.log(`[${pieceId}] Lock holder disconnected, releasing lock`);
            clearLock(piece, pieceId, "LOCK_EXPIRED");
        }

        // Delay cleanup — client may reconnect (mobile backgrounding)
        if (piece.clients.size === 0 && !piece.lock) {
            piece.cleanupTimer = setTimeout(() => {
                if (piece.clients.size === 0 && !piece.lock) {
                    pieces.delete(pieceId);
                    console.log(`[${pieceId}] Piece state cleaned up after delay`);
                }
            }, CLEANUP_DELAY_MS);
        }
    });

    ws.on("error", (err: Error) => console.error(`[${pieceId}] WebSocket error:`, err));
});

console.log(`Auction server running on ws://localhost:${PORT}`);
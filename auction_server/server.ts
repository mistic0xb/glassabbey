import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

interface Lock {
    ws: WebSocket;
    bidderName: string;
    bidAmt: number;
    submitAmt: number;
    finalBidAmt: number;
    timer: ReturnType<typeof setTimeout>;
}

interface PieceState {
    currentHighestBid: number;
    lock: Lock | null;
    clients: Set<WebSocket>;
}

interface SubmitBidMessage {
    type: "SUBMIT_BID";
    bidderName: string;
    bidAmt: number;
    submitAmt: number;
}

interface CancelBidMessage {
    type: "CANCEL_BID";
}

interface ZapConfirmedMessage {
    type: "ZAP_CONFIRMED";
}

type ClientMessage = SubmitBidMessage | CancelBidMessage | ZapConfirmedMessage;

const pieces = new Map<string, PieceState>();

function getPiece(pieceId: string): PieceState {
    if (!pieces.has(pieceId)) {
        pieces.set(pieceId, {
            currentHighestBid: 0,
            lock: null,
            clients: new Set(),
        });
    }
    return pieces.get(pieceId)!;
}

function send(ws: WebSocket, message: object): void {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

function broadcast(piece: PieceState, message: object, excludeWs?: WebSocket): void {
    const data = JSON.stringify(message);
    for (const client of piece.clients) {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    }
}

function clearLock(piece: PieceState, pieceId: string, reason = "LOCK_EXPIRED"): void {
    if (!piece.lock) return;
    clearTimeout(piece.lock.timer);
    piece.lock = null;
    console.log(`[${pieceId}] Lock cleared: ${reason}`);
    broadcast(piece, { type: reason });
}

function tryAcquireLock(
    piece: PieceState,
    pieceId: string,
    ws: WebSocket,
    bidderName: string,
    bidAmt: number,
    submitAmt: number,
): void {
    const finalBidAmt = piece.currentHighestBid + bidAmt;

    if (finalBidAmt <= piece.currentHighestBid) {
        send(ws, { type: "BID_REJECTED", reason: "Bid must be higher than the current highest bid" });
        return;
    }

    if (piece.lock) {
        send(ws, { type: "BID_QUEUED", reason: "Someone else is currently completing a payment, please wait" });
        return;
    }

    const timer = setTimeout(() => {
        console.log(`[${pieceId}] Lock timed out for ${bidderName}`);
        clearLock(piece, pieceId, "LOCK_EXPIRED");
    }, LOCK_TIMEOUT_MS);

    piece.lock = { ws, bidderName, bidAmt, submitAmt, finalBidAmt, timer };
    console.log(`[${pieceId}] Lock acquired by ${bidderName} for ${finalBidAmt} sats`);

    send(ws, { type: "BID_WON", finalBidAmt, submitAmt, bidderName });
    broadcast(piece, { type: "BID_LOCKED", reason: "A bidder is completing payment, please wait" }, ws);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const pieceId = url.searchParams.get("pieceId");

    if (!pieceId) {
        ws.close(1008, "Missing pieceId");
        return;
    }

    const piece = getPiece(pieceId);
    piece.clients.add(ws);
    console.log(`[${pieceId}] Client connected (${piece.clients.size} total)`);

    send(ws, {
        type: "STATE",
        currentHighestBid: piece.currentHighestBid,
        locked: !!piece.lock,
    });

    ws.on("message", (raw: Buffer) => {
        let msg: ClientMessage;
        try {
            msg = JSON.parse(raw.toString()) as ClientMessage;
        } catch {
            send(ws, { type: "ERROR", reason: "Invalid JSON" });
            return;
        }

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
                if (!piece.lock || piece.lock.ws !== ws) {
                    send(ws, { type: "ERROR", reason: "You do not hold the current bid lock" });
                    return;
                }

                const { bidderName, finalBidAmt, submitAmt } = piece.lock;
                piece.currentHighestBid = finalBidAmt;
                console.log(`[${pieceId}] Zap confirmed by ${bidderName}, new highest: ${finalBidAmt}`);

                clearTimeout(piece.lock.timer);
                piece.lock = null;

                const newBidMsg = { type: "NEW_BID", bidderName, finalBidAmt, submitAmt };
                broadcast(piece, newBidMsg);
                send(ws, newBidMsg);
                break;
            }

            default:
                send(ws, { type: "ERROR", reason: `Unknown message type` });
        }
    });

    ws.on("close", () => {
        piece.clients.delete(ws);
        console.log(`[${pieceId}] Client disconnected (${piece.clients.size} remaining)`);

        if (piece.lock?.ws === ws) {
            console.log(`[${pieceId}] Lock holder disconnected, releasing lock`);
            clearLock(piece, pieceId, "LOCK_EXPIRED");
        }

        if (piece.clients.size === 0 && !piece.lock) {
            pieces.delete(pieceId);
            console.log(`[${pieceId}] Piece state cleaned up`);
        }
    });

    ws.on("error", (err: Error) => {
        console.error(`[${pieceId}] WebSocket error:`, err);
    });
});

console.log(`Auction server running on ws://localhost:${PORT}`);
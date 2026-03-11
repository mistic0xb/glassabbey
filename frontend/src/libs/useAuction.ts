import { useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_AUCTION_WS_URL || "ws://localhost:8080";

export type AuctionStatus = "connecting" | "idle" | "locked" | "won" | "error";

export interface WonDetails {
  finalBidAmt: number;
  submitAmt: number;
  bidderName: string;
}

export interface AuctionState {
  status: AuctionStatus;
  currentHighestBid: number;
  wonDetails: WonDetails | null;
  errorMsg: string | null;
}

// One persistent WS per pieceId that survives navigation
const sockets = new Map<string, WebSocket>();

function getSocket(pieceId: string): WebSocket {
  const existing = sockets.get(pieceId);
  if (existing && existing.readyState !== WebSocket.CLOSED) return existing;
  const ws = new WebSocket(`${WS_URL}?pieceId=${pieceId}`);
  sockets.set(pieceId, ws);
  return ws;
}

function closeSocket(pieceId: string) {
  const ws = sockets.get(pieceId);
  if (ws) {
    ws.close();
    sockets.delete(pieceId);
  }
}

export function useAuction(pieceId: string) {
  const [state, setState] = useState<AuctionState>({
    status: "connecting",
    currentHighestBid: 0,
    wonDetails: null,
    errorMsg: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalRef = useRef(false);

  useEffect(() => {
    intentionalRef.current = false;
    const ws = getSocket(pieceId);
    wsRef.current = ws;

    const onOpen = () => setState(s => ({ ...s, status: "idle" }));

    const onMessage = (event: MessageEvent) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }

      switch (msg.type) {
        case "STATE":
          setState(s => ({ ...s, currentHighestBid: msg.currentPrice, status: msg.locked ? "locked" : "idle" }));
          break;
        case "BID_WON":
          setState(s => ({ ...s, status: "won", wonDetails: { finalBidAmt: msg.willingAmt, submitAmt: msg.submitAmt, bidderName: msg.bidderName } }));
          break;
        case "BID_QUEUED":
          setState(s => ({ ...s, status: "locked", errorMsg: msg.reason }));
          break;
        case "BID_REJECTED":
          setState(s => ({ ...s, status: "idle", errorMsg: msg.reason }));
          break;
        case "BID_LOCKED":
          setState(s => ({ ...s, status: "locked", errorMsg: null }));
          break;
        case "LOCK_EXPIRED":
          setState(s => ({ ...s, status: "idle", errorMsg: null }));
          break;
        case "NEW_BID":
          setState(s => ({ ...s, status: "idle", currentHighestBid: msg.currentPrice, wonDetails: null, errorMsg: null }));
          break;
        case "ERROR":
          setState(s => ({ ...s, errorMsg: msg.reason }));
          break;
      }
    };

    const onClose = () => {
      sockets.delete(pieceId);
      if (!intentionalRef.current) {
        setState(s => ({ ...s, status: "error", errorMsg: "Disconnected from auction server" }));
      }
    };

    // If already open, just attach handlers and request state
    if (ws.readyState === WebSocket.OPEN) {
      setState(s => ({ ...s, status: "idle" }));
    }

    ws.addEventListener("open", onOpen);
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);

    return () => {
      ws.removeEventListener("open", onOpen);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
    };
  }, [pieceId]);

  const submitBid = (bidderName: string, bidAmt: number, submitAmt: number) => {
    const ws = getSocket(pieceId);
    wsRef.current = ws;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "SUBMIT_BID", bidderName, bidAmt, submitAmt }));
    }
  };

  const cancelBid = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "CANCEL_BID" }));
    }
    intentionalRef.current = true;
    closeSocket(pieceId);
    setState(s => ({ ...s, status: "idle", wonDetails: null, errorMsg: null }));
  };

  const confirmZap = () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ZAP_CONFIRMED" }));
    }
    intentionalRef.current = true;
    closeSocket(pieceId);
  };

  return { state, submitBid, cancelBid, confirmZap };
}
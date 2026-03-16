import { useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_AUCTION_WS_URL || "ws://localhost:8080";

export type AuctionStatus =
  | "connecting"
  | "idle"
  | "locked"
  | "won"
  | "error";

export interface WonDetails {
  finalBidAmt: number;
  submitAmt: number;
  bidderName: string;
  lockToken: string; // UUID — used to cancel and verify lock ownership
}

export interface AuctionState {
  status: AuctionStatus;
  currentHighestBid: number;
  lastNewBidWillingAmt: number | null;
  lockWillingAmt: number | null; // willingAmt of the current active lock (public)
  wonDetails: WonDetails | null;
  errorMsg: string | null;
}

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
    lastNewBidWillingAmt: null,
    lockWillingAmt: null,
    wonDetails: null,
    errorMsg: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalRef = useRef(false);

  // Stable ref to the latest onPaymentAlreadyConfirmed callback
  // set by Payment.tsx so we don't need it in useEffect deps
  const onPaymentAlreadyConfirmedRef = useRef<((willingAmt: number) => void) | null>(null);
  const onLockStillActiveRef = useRef<((willingAmt: number, submitAmt: number) => void) | null>(null);

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
          setState(s => ({
            ...s,
            currentHighestBid: msg.currentPrice,
            lockWillingAmt: msg.lockWillingAmt ?? null,
            status: msg.locked ? "locked" : "idle",
          }));
          break;
        case "BID_WON":
          setState(s => ({
            ...s,
            status: "won",
            wonDetails: {
              finalBidAmt: msg.willingAmt,
              submitAmt: msg.submitAmt,
              bidderName: msg.bidderName,
              lockToken: msg.lockToken,
            },
          }));
          break;
        case "BID_QUEUED":
          setState(s => ({ ...s, status: "locked", errorMsg: msg.reason }));
          break;
        case "BID_REJECTED":
          setState(s => ({ ...s, status: "idle", errorMsg: msg.reason }));
          break;
        case "BID_LOCKED":
          setState(s => ({ ...s, status: "locked", lockWillingAmt: msg.lockWillingAmt ?? null, errorMsg: null }));
          break;
        case "LOCK_EXPIRED":
          setState(s => ({ ...s, status: "idle", lockWillingAmt: null, errorMsg: null }));
          break;
        case "NEW_BID":
          setState(s => ({
            ...s,
            status: "idle",
            currentHighestBid: msg.currentPrice,
            lastNewBidWillingAmt: msg.willingAmt ?? null,
            lockWillingAmt: null,
            wonDetails: null,
            errorMsg: null,
          }));
          break;
        case "PAYMENT_ALREADY_CONFIRMED":
          // Server confirmed this bidder's payment was already processed while backgrounded
          onPaymentAlreadyConfirmedRef.current?.(msg.willingAmt);
          break;
        case "LOCK_STILL_ACTIVE":
          // Server confirmed the lock is still alive — client is still the lock holder
          onLockStillActiveRef.current?.(msg.willingAmt, msg.submitAmt);
          break;
        case "PAYMENT_NOT_FOUND":
          // Lock expired without confirmation — bid failed
          setState(s => ({ ...s, status: "idle", lockWillingAmt: null, errorMsg: null }));
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

  const cancelBid = (lockToken: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "CANCEL_BID", lockToken }));
    }
    intentionalRef.current = true;
    closeSocket(pieceId);
    setState(s => ({ ...s, status: "idle", wonDetails: null, lockWillingAmt: null, errorMsg: null }));
  };

  const confirmZap = () => {
    intentionalRef.current = true;
    const ws = getSocket(pieceId);
    wsRef.current = ws;
    const doSend = () => {
      ws.send(JSON.stringify({ type: "ZAP_CONFIRMED" }));
      setTimeout(() => closeSocket(pieceId), 500);
    };
    if (ws.readyState === WebSocket.OPEN) {
      doSend();
    } else {
      ws.addEventListener("open", doSend, { once: true });
      setTimeout(() => closeSocket(pieceId), 8000);
    }
  };

  // Send CHECK_PAYMENT to server — used by Payment.tsx on reconnect/visibility
  const checkPayment = (lockToken: string, willingAmt: number) => {
    const ws = getSocket(pieceId);
    wsRef.current = ws;
    const doSend = () => {
      ws.send(JSON.stringify({ type: "CHECK_PAYMENT", lockToken, willingAmt }));
    };
    if (ws.readyState === WebSocket.OPEN) {
      doSend();
    } else {
      ws.addEventListener("open", doSend, { once: true });
    }
  };

  // Register callbacks for CHECK_PAYMENT responses
  const setPaymentCallbacks = (
    onAlreadyConfirmed: (willingAmt: number) => void,
    onStillActive: (willingAmt: number, submitAmt: number) => void,
  ) => {
    onPaymentAlreadyConfirmedRef.current = onAlreadyConfirmed;
    onLockStillActiveRef.current = onStillActive;
  };

  return { state, submitBid, cancelBid, confirmZap, checkPayment, setPaymentCallbacks };
}
import { useEffect, useRef, useState, useCallback } from "react";

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

const DEFAULT_STATE: AuctionState = {
  status: "connecting",
  currentHighestBid: 0,
  wonDetails: null,
  errorMsg: null,
};

interface Entry {
  ws: WebSocket;
  state: AuctionState;
  listeners: Set<(s: AuctionState) => void>;
  intentionalClose: boolean; // true = cancel/confirm, don't set error status
}

const registry = new Map<string, Entry>();

function getOrCreate(pieceId: string): Entry {
  if (registry.has(pieceId)) return registry.get(pieceId)!;

  const entry: Entry = {
    ws: null!,
    state: { ...DEFAULT_STATE },
    listeners: new Set(),
    intentionalClose: false,
  };

  const notify = (update: Partial<AuctionState>) => {
    entry.state = { ...entry.state, ...update };
    entry.listeners.forEach((fn) => fn(entry.state));
  };

  const ws = new WebSocket(`${WS_URL}?pieceId=${pieceId}`);
  entry.ws = ws;
  registry.set(pieceId, entry);

  ws.onopen = () => notify({ status: "idle" });

  ws.onmessage = (event) => {
    let msg: any;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case "STATE":
        notify({ currentHighestBid: msg.currentPrice, status: msg.locked ? "locked" : "idle" });
        break;
      case "BID_WON":
        notify({
          status: "won",
          wonDetails: { finalBidAmt: msg.willingAmt, submitAmt: msg.submitAmt, bidderName: msg.bidderName },
        });
        break;
      case "BID_QUEUED":
        notify({ status: "locked", errorMsg: msg.reason });
        break;
      case "BID_REJECTED":
        notify({ status: "idle", errorMsg: msg.reason });
        break;
      case "BID_LOCKED":
        notify({ status: "locked", errorMsg: null });
        break;
      case "LOCK_EXPIRED":
        notify({ status: "idle", errorMsg: null });
        break;
      case "NEW_BID":
        notify({ status: "idle", currentHighestBid: msg.currentPrice, wonDetails: null, errorMsg: null });
        break;
      case "ERROR":
        notify({ errorMsg: msg.reason });
        break;
    }
  };

  ws.onclose = () => {
    registry.delete(pieceId);
    // Only show error if this was unexpected (not cancel/confirm)
    if (!entry.intentionalClose) {
      notify({ status: "error", errorMsg: "Disconnected from auction server" });
    } else {
      // Reset to idle so BiddingPage re-enables the button
      notify({ status: "idle", errorMsg: null, wonDetails: null });
    }
  };

  ws.onerror = () => {
    if (!entry.intentionalClose) {
      notify({ status: "error", errorMsg: "Connection error" });
    }
  };

  return entry;
}

export function useAuction(pieceId: string) {
  const entry = getOrCreate(pieceId);
  const [state, setState] = useState<AuctionState>(entry.state);
  const entryRef = useRef(entry);
  entryRef.current = entry;

  useEffect(() => {
    const e = entryRef.current;
    setState(e.state);
    e.listeners.add(setState);
    return () => {
      e.listeners.delete(setState);
    };
  }, [pieceId]);

  // Re-sync entry ref if pieceId causes a new entry to be created
  useEffect(() => {
    entryRef.current = getOrCreate(pieceId);
  });

  const submitBid = useCallback((bidderName: string, bidAmt: number, submitAmt: number) => {
    entryRef.current.ws.send(JSON.stringify({ type: "SUBMIT_BID", bidderName, bidAmt, submitAmt }));
  }, []);

  const cancelBid = useCallback(() => {
    const e = registry.get(pieceId);
    if (e) {
      e.intentionalClose = true;
      e.ws.send(JSON.stringify({ type: "CANCEL_BID" }));
      e.ws.close();
      registry.delete(pieceId);
    }
  }, [pieceId]);

  const confirmZap = useCallback(() => {
    const e = registry.get(pieceId);
    if (e) {
      e.intentionalClose = true;
      e.ws.send(JSON.stringify({ type: "ZAP_CONFIRMED" }));
      e.ws.close();
      registry.delete(pieceId);
    }
  }, [pieceId]);

  return { state, submitBid, cancelBid, confirmZap };
}
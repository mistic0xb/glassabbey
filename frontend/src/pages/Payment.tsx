import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { FiCheck, FiCopy, FiZap, FiArrowLeft } from "react-icons/fi";
import { generatePieceInvoice, monitorZapPayment } from "../libs/nostr/nip57";
import { useAuction } from "../libs/useAuction";
import type { Piece, Collection } from "../types/types";

const WS_URL = import.meta.env.VITE_AUCTION_WS_URL || "ws://localhost:8080";

interface PaymentState {
  piece: Piece;
  collection: Collection;
  collectionName: string;
  lightningAddress: string;
  recipientPubkey: string;
  willingAmt: number;
  submitAmt: number;
  bidderName: string;
  lockToken: string;
}

interface PersistedPaymentState {
  pieceId: string;
  willingAmt: number;
  submitAmt: number;
  bidderName: string;
  lockToken: string;
  lightningAddress: string;
  recipientPubkey: string;
  collectionName: string;
  collectionId: string;
  confirmed: boolean;
  lockStartTime: number;
}

const SESSION_KEY = "glassabbey_payment";

function saveSession(data: PersistedPaymentState): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {}
}

function loadSession(): PersistedPaymentState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

const formatSats = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;

const TIMER_SECONDS = 60;

function calcTimeLeft(lockStartTime: number): number {
  const elapsed = Math.floor((Date.now() - lockStartTime) / 1000);
  return Math.max(0, TIMER_SECONDS - elapsed);
}

const Payment = () => {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: PaymentState | null };

  const session = loadSession();

  const paymentContext =
    state ??
    (session
      ? ({
          piece: {
            id: session.pieceId,
            artifactName: "",
            makerName: "",
            collectionId: "",
            creatorPubkey: "",
          } as Piece,
          collection: {
            id: session.collectionId,
            name: session.collectionName,
            lightningAddress: session.lightningAddress,
          } as Collection,
          collectionName: session.collectionName,
          lightningAddress: session.lightningAddress,
          recipientPubkey: session.recipientPubkey,
          willingAmt: session.willingAmt,
          submitAmt: session.submitAmt,
          bidderName: session.bidderName,
          lockToken: session.lockToken,
        } as PaymentState)
      : null);

  if (!paymentContext) {
    navigate(-1);
    return null;
  }

  const {
    piece,
    collection,
    collectionName,
    lightningAddress,
    recipientPubkey,
    willingAmt,
    submitAmt,
    bidderName,
    lockToken,
  } = paymentContext;

  const [invoice, setInvoice] = useState<string | null>(null);
  const [zapRequestId, setZapRequestId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "confirmed">(
    "idle",
  );
  const [timeLeft, setTimeLeft] = useState<number>(() =>
    session?.lockStartTime
      ? calcTimeLeft(session.lockStartTime)
      : TIMER_SECONDS,
  );

  // Read confirmed state fresh from sessionStorage — not from stale closure
  const handledRef = useRef(
    !!(
      session?.confirmed &&
      session.pieceId === piece.id &&
      session.willingAmt === willingAmt
    ),
  );

  const {
    cancelBid,
    confirmZap,
    checkPayment,
    setPaymentCallbacks,
    state: auctionState,
  } = useAuction(piece.id);

  const goBackToPiece = useCallback(() => {
    navigate(`/piece/${piece.id}`);
  }, [piece.id, navigate]);

  // Payment confirmed — server already published to Nostr, just navigate away
  const handlePaymentConfirmed = useCallback(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    // Mark confirmed in session immediately so refresh won't re-run flow
    const currentSession = loadSession();
    if (currentSession) saveSession({ ...currentSession, confirmed: true });

    setStatus("confirmed");
    setTimeout(() => {
      clearSession();
      goBackToPiece();
    }, 3000);
  }, [goBackToPiece]);

  // On mount: if already confirmed (Safari resume / refresh), skip straight to confirmed
  useEffect(() => {
    if (handledRef.current) {
      console.log(
        "[Payment] Already confirmed on mount — skipping to confirmed screen",
      );
      setStatus("confirmed");
      setTimeout(() => {
        clearSession();
        goBackToPiece();
      }, 3000);
    }
  }, []);

  // Register CHECK_PAYMENT callbacks
  useEffect(() => {
    setPaymentCallbacks(
      (confirmedWillingAmt) => {
        if (confirmedWillingAmt === willingAmt) {
          console.log(
            "[Payment] Server: payment already confirmed while backgrounded",
          );
          handlePaymentConfirmed();
        }
      },
      (activeWillingAmt) => {
        if (activeWillingAmt === willingAmt) {
          console.log(
            "[Payment] Server: lock still active, continuing to wait",
          );
        }
      },
    );
  }, [willingAmt, handlePaymentConfirmed, setPaymentCallbacks]);

  // Watch for NEW_BID matching our willingAmt
  useEffect(() => {
    if (status !== "waiting") return;
    if (
      auctionState.status === "idle" &&
      auctionState.currentHighestBid > 0 &&
      auctionState.wonDetails === null
    ) {
      if (auctionState.currentHighestBid === willingAmt - submitAmt) {
        console.log("[Payment] NEW_BID matches — payment confirmed by server");
        handlePaymentConfirmed();
      }
    }
  }, [
    auctionState.status,
    auctionState.currentHighestBid,
    status,
    willingAmt,
    submitAmt,
    handlePaymentConfirmed,
  ]);

  // Generate invoice on mount — skipped if already confirmed
  useEffect(() => {
    if (handledRef.current) return;

    const generate = async () => {
      setGenerating(true);
      setError(null);
      try {
        const result = await generatePieceInvoice({
          lightningAddress,
          amount: submitAmt,
          pieceId: piece.id,
          recipientPubkey,
          bidderName,
        });
        setInvoice(result.invoice);
        setZapRequestId(result.zapRequestId);
        setStatus("waiting");

        // Save session for Safari resume — no signed event needed anymore
        const lockStartTime = Date.now();
        setTimeLeft(TIMER_SECONDS);
        saveSession({
          pieceId: piece.id,
          willingAmt,
          submitAmt,
          bidderName,
          lockToken,
          lightningAddress,
          recipientPubkey,
          collectionName,
          collectionId: collection.id,
          confirmed: false,
          lockStartTime,
        });

        if (result.paymentHash) {
          const ws = new WebSocket(`${WS_URL}?pieceId=${piece.id}`);
          ws.onopen = () => {
            ws.send(
              JSON.stringify({
                type: "START_PAYMENT",
                paymentHash: result.paymentHash,
                lightningAddress,
              }),
            );
            setTimeout(() => ws.close(), 1000);
          };
          ws.onerror = () => ws.close();
        } else {
          console.warn(
            "[Payment] No paymentHash — NWC unavailable, zap fallback only",
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to generate invoice",
        );
      } finally {
        setGenerating(false);
      }
    };
    generate();
  }, []);

  // Zap receipt monitor
  useEffect(() => {
    if (!invoice || !zapRequestId || status !== "waiting") return;
    const unsubscribe = monitorZapPayment(recipientPubkey, zapRequestId, () => {
      console.log("[Payment] Zap receipt detected — sending ZAP_CONFIRMED");
      confirmZap();
      handlePaymentConfirmed();
    });
    return () => unsubscribe();
  }, [invoice, zapRequestId, status, handlePaymentConfirmed, confirmZap]);

  // Focus/visibility recheck — mobile user returned from wallet
  useEffect(() => {
    if (status !== "waiting") return;

    const onReturn = () => {
      if (handledRef.current) return;
      console.log(
        "[Payment] Browser returned to foreground — checking payment status",
      );

      const s = loadSession();
      if (s?.lockStartTime) setTimeLeft(calcTimeLeft(s.lockStartTime));

      setTimeout(() => {
        if (handledRef.current) return;
        checkPayment(lockToken, willingAmt);
      }, 500);

      if (!zapRequestId) return;
      const since = Math.floor(Date.now() / 1000) - 10 * 60;
      const unsub = monitorZapPayment(
        recipientPubkey,
        zapRequestId,
        () => {
          unsub();
          console.log("[Payment] Zap recheck detected payment");
          confirmZap();
          handlePaymentConfirmed();
        },
        since,
      );
      setTimeout(() => unsub(), 10_000);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") onReturn();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onReturn);
    };
  }, [
    status,
    zapRequestId,
    recipientPubkey,
    lockToken,
    willingAmt,
    handlePaymentConfirmed,
    confirmZap,
    checkPayment,
  ]);

  // Countdown
  useEffect(() => {
    if (status !== "waiting") return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          if (!handledRef.current) {
            clearSession();
            cancelBid(lockToken);
            goBackToPiece();
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const handleCopy = () => {
    if (!invoice) return;
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    try {
      navigator.clipboard
        .writeText(invoice)
        .then(done)
        .catch(() => {
          const el = document.createElement("textarea");
          el.value = invoice;
          el.style.cssText = "position:fixed;opacity:0";
          document.body.appendChild(el);
          el.focus();
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
          done();
        });
    } catch {
      const el = document.createElement("textarea");
      el.value = invoice;
      el.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(el);
      el.focus();
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      done();
    }
  };

  const handleOpenWallet = () => {
    if (!invoice) return;
    window.open(`lightning:${invoice}`, "_blank");
  };

  const handleCancel = () => {
    clearSession();
    cancelBid(lockToken);
    goBackToPiece();
  };

  const timerColor =
    timeLeft <= 15
      ? "text-red-400"
      : timeLeft <= 30
        ? "text-yellow-400"
        : "text-white/40";
  const timerMinutes = Math.floor(timeLeft / 60);
  const timerSeconds = timeLeft % 60;
  const timerLabel = `${timerMinutes}:${String(timerSeconds).padStart(2, "0")}`;

  if (status === "confirmed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="border border-white/10 rounded-lg p-8 max-w-sm w-full text-center flex flex-col items-center gap-5 bg-white/2">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
            <FiCheck className="text-green-400 text-3xl" />
          </div>
          <div>
            <h2 className="text-white font-bold text-xl mb-1">
              Payment Confirmed
            </h2>
            <p className="text-white/40 text-sm">
              Bid recorded. Returning to piece…
            </p>
          </div>
          <div className="border border-white/10 rounded px-4 py-2 text-sm">
            <span className="text-white/60">{bidderName}</span>
            <span className="text-white/20 mx-2">·</span>
            <span className="text-green-400 font-semibold">
              {formatSats(submitAmt)} sats
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/30 text-sm">Generating invoice…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="border border-white/10 rounded-lg p-8 max-w-sm w-full text-center flex flex-col items-center gap-5 bg-white/2">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={handleCancel}
            className="flex items-center gap-2 px-5 py-2.5 border border-white/15 hover:border-white/30 text-white/60 hover:text-white text-sm rounded transition-colors bg-transparent cursor-pointer"
          >
            <FiArrowLeft /> Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="border border-white/10 rounded-lg p-6 max-w-sm w-full flex flex-col gap-6 bg-white/2">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-1">
              {collectionName}
            </p>
            <h1 className="text-white font-semibold text-lg">
              {piece.artifactName}
            </h1>
            <p className="text-white/40 text-sm mt-1">
              Bidding as <span className="text-white/70">{bidderName}</span>
            </p>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-white/20 text-xs mb-0.5">Time left</p>
            <p
              className={`font-mono font-bold text-lg tabular-nums ${timerColor}`}
            >
              {timerLabel}
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-lg px-4 py-3">
          <span className="text-white/40 text-sm">Deposit amount</span>
          <span className="text-green-400 font-bold text-xl">
            {formatSats(submitAmt)} sats
          </span>
        </div>

        {invoice && (
          <div className="flex flex-col items-center gap-3">
            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={invoice} size={200} level="M" />
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 text-white/40 hover:text-white text-sm transition-colors bg-transparent border-none cursor-pointer"
            >
              {copied ? (
                <>
                  <FiCheck className="text-green-400" /> Copied
                </>
              ) : (
                <>
                  <FiCopy /> Copy invoice
                </>
              )}
            </button>
          </div>
        )}

        <p className="text-white/20 text-xs text-center animate-pulse">
          Waiting for payment…
        </p>
        <p className="text-yellow-400/50 text-xs text-center">
          Do not refresh this page during payment
        </p>

        <div className="flex flex-col gap-2">
          <button
            onClick={handleOpenWallet}
            className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded transition-colors border-none cursor-pointer"
          >
            <FiZap /> Open in Wallet
          </button>
          <button
            onClick={handleCancel}
            className="w-full py-2.5 border border-white/10 hover:border-white/25 text-white/40 hover:text-white text-sm rounded transition-colors bg-transparent cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default Payment;

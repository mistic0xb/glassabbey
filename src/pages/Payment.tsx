import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { FiCheck, FiCopy, FiZap, FiArrowLeft } from "react-icons/fi";
import { generatePieceInvoice, monitorZapPayment } from "../libs/nostr/nip57";
import { publishBid } from "../libs/nostr/bid";
import { useAuction } from "../libs/useAuction";
import type { Piece } from "../types/types";

interface PaymentState {
  piece: Piece;
  collectionName: string;
  lightningAddress: string;
  recipientPubkey: string;
  willingAmt: number;
  submitAmt: number;
  bidderName: string;
}

const formatSats = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;

const TIMER_SECONDS = 120; // 2 minutes

const Payment = () => {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: PaymentState | null };

  const [invoice, setInvoice] = useState<string | null>(null);
  const [zapRequestId, setZapRequestId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "waiting" | "publishing" | "confirmed">("idle");
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);

  const handledRef = useRef(false);

  if (!state) { navigate(-1); return null; }

  const { piece, collectionName, lightningAddress, recipientPubkey, willingAmt, submitAmt, bidderName } = state;

  const { confirmZap, cancelBid } = useAuction(piece.id);

  const handlePaymentConfirmed = useCallback(async () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setStatus("publishing");
    try {
      await publishBid(piece.id, willingAmt, submitAmt, bidderName);
      confirmZap();
    } catch (err) {
      console.error("Failed to publish bid after payment:", err);
      confirmZap();
    } finally {
      setStatus("confirmed");
      setTimeout(() => navigate(`/piece/${piece.id}`, { state: { piece, collectionName } }), 3000);
    }
  }, [piece, willingAmt, submitAmt, bidderName, collectionName, navigate, confirmZap]);

  // Generate invoice on mount
  useEffect(() => {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate invoice");
      } finally {
        setGenerating(false);
      }
    };
    generate();
  }, []);

  // 2-minute countdown — starts when invoice is ready, auto-cancels on expiry
  useEffect(() => {
    if (status !== "waiting") return;
    setTimeLeft(TIMER_SECONDS);
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          if (!handledRef.current) {
            cancelBid();
            navigate(-1);
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  // Primary zap monitor
  useEffect(() => {
    if (!invoice || !zapRequestId || status !== "waiting") return;
    const unsubscribe = monitorZapPayment(recipientPubkey, zapRequestId, handlePaymentConfirmed);
    return () => unsubscribe();
  }, [invoice, zapRequestId, status, handlePaymentConfirmed]);

  // Recheck on focus/visibility — mobile
  useEffect(() => {
    if (status !== "waiting") return;
    const recheckOnFocus = () => {
      if (handledRef.current || !zapRequestId) return;
      const since = Math.floor(Date.now() / 1000) - 10 * 60;
      const unsub = monitorZapPayment(
        recipientPubkey,
        zapRequestId,
        () => { unsub(); handlePaymentConfirmed(); },
        since,
      );
      setTimeout(() => unsub(), 10_000);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") recheckOnFocus();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", recheckOnFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", recheckOnFocus);
    };
  }, [status, zapRequestId, recipientPubkey, handlePaymentConfirmed]);

  const handleCopy = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWallet = () => {
    if (!invoice) return;
    window.open(`lightning:${invoice}`, "_blank");
  };

  const handleCancel = () => {
    cancelBid();
    navigate(-1);
  };

  const timerColor = timeLeft <= 30 ? "text-red-400" : timeLeft <= 60 ? "text-yellow-400" : "text-white/40";
  const timerMinutes = Math.floor(timeLeft / 60);
  const timerSeconds = timeLeft % 60;
  const timerLabel = `${timerMinutes}:${String(timerSeconds).padStart(2, "0")}`;

  if (status === "confirmed" || status === "publishing") {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="border border-white/10 rounded-lg p-8 max-w-sm w-full text-center flex flex-col items-center gap-5 bg-white/2">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
            <FiCheck className="text-green-400 text-3xl" />
          </div>
          <div>
            <h2 className="text-white font-bold text-xl mb-1">Payment Confirmed</h2>
            <p className="text-white/40 text-sm">
              {status === "publishing" ? "Publishing your bid…" : "Bid recorded. Returning to piece…"}
            </p>
          </div>
          <div className="border border-white/10 rounded px-4 py-2 text-sm">
            <span className="text-white/60">{bidderName}</span>
            <span className="text-white/20 mx-2">·</span>
            <span className="text-green-400 font-semibold">{formatSats(submitAmt)} sats</span>
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
            <p className="text-white/30 text-xs uppercase tracking-widest mb-1">{collectionName}</p>
            <h1 className="text-white font-semibold text-lg">{piece.artifactName}</h1>
            <p className="text-white/40 text-sm mt-1">
              Bidding as <span className="text-white/70">{bidderName}</span>
            </p>
          </div>
          {/* Countdown timer */}
          <div className="flex flex-col items-end">
            <p className="text-white/20 text-xs mb-0.5">Time left</p>
            <p className={`font-mono font-bold text-lg tabular-nums ${timerColor}`}>
              {timerLabel}
            </p>
          </div>
        </div>

        <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-lg px-4 py-3">
          <span className="text-white/40 text-sm">Deposit amount</span>
          <span className="text-green-400 font-bold text-xl">{formatSats(submitAmt)} sats</span>
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
              {copied ? <><FiCheck className="text-green-400" /> Copied</> : <><FiCopy /> Copy invoice</>}
            </button>
          </div>
        )}

        <p className="text-white/20 text-xs text-center animate-pulse">Waiting for payment…</p>

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
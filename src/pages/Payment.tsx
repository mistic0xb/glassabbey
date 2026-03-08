import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
import { FiCheck, FiCopy, FiZap, FiArrowLeft } from "react-icons/fi";
import { generatePieceInvoice, monitorZapPayment } from "../libs/nostr/nip57";
import { publishBid } from "../libs/nostr/bid";
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

const Payment = () => {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: PaymentState | null };

  const [invoice, setInvoice] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    "idle" | "waiting" | "publishing" | "confirmed"
  >("idle");
  const [zapRequestId, setZapRequestId] = useState<string | null>(null);

  // Track whether we've already handled the payment to avoid double-publishing
  const handledRef = useRef(false);

  if (!state) {
    navigate(-1);
    return null;
  }

  const {
    piece,
    collectionName,
    lightningAddress,
    recipientPubkey,
    willingAmt,
    submitAmt,
    bidderName,
  } = state;

  const handlePaymentConfirmed = useCallback(async () => {
    if (handledRef.current) return;
    handledRef.current = true;
    setStatus("publishing");
    try {
      await publishBid(piece.id, willingAmt, submitAmt, bidderName);
    } catch (err) {
      console.error("Failed to publish bid after payment:", err);
    } finally {
      setStatus("confirmed");
      setTimeout(
        () =>
          navigate(`/piece/${piece.id}`, { state: { piece, collectionName } }),
        3000,
      );
    }
  }, [piece, willingAmt, submitAmt, bidderName, collectionName, navigate]);

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
        setError(
          err instanceof Error ? err.message : "Failed to generate invoice",
        );
      } finally {
        setGenerating(false);
      }
    };
    generate();
  }, []);

  // Monitor zap payment via nostr relay
  useEffect(() => {
    if (!invoice || !zapRequestId || status !== "waiting") return;
    const unsubscribe = monitorZapPayment(
      recipientPubkey,
      zapRequestId, // required, not optional anymore
      handlePaymentConfirmed,
      // no `since` override — defaults to now, won't catch old events
    );
    return () => unsubscribe();
  }, [invoice, zapRequestId, status, handlePaymentConfirmed]);

  // When user returns to the page (from wallet app), re-check for zap
  useEffect(() => {
    if (status !== "waiting") return;

    const recheckOnFocus = () => {
      if (handledRef.current || !zapRequestId) return;
      // Look back only 5 minutes — but zapRequestId match means
      // only OUR invoice can trigger this, so old bids are safe
      const since = Math.floor(Date.now() / 1000) - 5 * 60;
      const unsub = monitorZapPayment(
        recipientPubkey,
        zapRequestId,
        () => {
          unsub();
          handlePaymentConfirmed();
        },
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
    // Use window.open instead of window.location.href so the page stays alive
    // and can receive the payment confirmation when the user returns.
    // This also triggers the OS app picker if multiple wallet apps are installed.
    window.open(`lightning:${invoice}`, "_blank");
  };

  // Confirmed / Publishing
  if (status === "confirmed" || status === "publishing") {
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
              {status === "publishing"
                ? "Publishing your bid…"
                : "Bid recorded. Returning to piece…"}
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

  // Generating
  if (generating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/30 text-sm">Generating invoice…</p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="border border-white/10 rounded-lg p-8 max-w-sm w-full text-center flex flex-col items-center gap-5 bg-white/2">
          <p className="text-red-400 text-sm">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-5 py-2.5 border border-white/15 hover:border-white/30 text-white/60 hover:text-white text-sm rounded transition-colors bg-transparent cursor-pointer"
          >
            <FiArrowLeft /> Go Back
          </button>
        </div>
      </div>
    );
  }

  // Invoice / QR
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="border border-white/10 rounded-lg p-6 max-w-sm w-full flex flex-col gap-6 bg-white/2">
        {/* Header */}
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

        {/* Amount */}
        <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-lg px-4 py-3">
          <span className="text-white/40 text-sm">Deposit amount</span>
          <span className="text-green-400 font-bold text-xl">
            {formatSats(submitAmt)} sats
          </span>
        </div>

        {/* QR */}
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

        {/* Waiting */}
        <p className="text-white/20 text-xs text-center animate-pulse">
          Waiting for payment…
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <button
            onClick={handleOpenWallet}
            className="flex items-center justify-center gap-2 w-full py-3 bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded transition-colors border-none cursor-pointer"
          >
            <FiZap /> Open in Wallet
          </button>
          <button
            onClick={() => navigate(-1)}
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

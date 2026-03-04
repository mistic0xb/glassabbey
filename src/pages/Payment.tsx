import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { QRCodeSVG } from "qrcode.react";
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

  // Monitor for payment once invoice is ready
  useEffect(() => {
    if (!invoice || status !== "waiting") return;

    const unsubscribe = monitorZapPayment(
      piece.id,
      recipientPubkey,
      async () => {
        setStatus("publishing");
        try {
          await publishBid(piece.id, willingAmt, submitAmt);
          setStatus("confirmed");
          setTimeout(
            () =>
              navigate(`/piece/${piece.id}`, {
                state: { piece, collectionName },
              }),
            3000,
          );
        } catch (err) {
          console.error("Failed to publish bid after payment:", err);
          setStatus("confirmed"); // still confirmed, just bid publish failed silently
          setTimeout(
            () =>
              navigate(`/piece/${piece.id}`, {
                state: { piece, collectionName },
              }),
            3000,
          );
        }
      },
    );

    return () => unsubscribe();
  }, [invoice, status]);

  const handleCopy = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWallet = () => {
    if (!invoice) return;
    window.location.href = `lightning:${invoice}`;
  };

  // ── Confirmed state ──────────────────────────────────────────────
  if (status === "confirmed" || status === "publishing") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div
          className="frame-box"
          style={{
            padding: "3rem 2.5rem",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
            alignItems: "center",
          }}
        >
          <div style={{ fontSize: "3rem" }}>✓</div>
          <h2
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--gold-mid)",
              margin: 0,
            }}
          >
            Payment Confirmed
          </h2>
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--silver-mid)",
              margin: 0,
            }}
          >
            {status === "publishing"
              ? "Publishing your bid…"
              : "Bid recorded. Returning to piece…"}
          </p>
          <div style={{ fontSize: "0.85rem", color: "var(--silver-dark)" }}>
            <span style={{ color: "var(--gold-dim)" }}>{bidderName}</span> ·{" "}
            {formatSats(submitAmt)} sats
          </div>
        </div>
      </div>
    );
  }

  // ── Generating state ─────────────────────────────────────────────
  if (generating) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p
          className="anim-pulse-gold"
          style={{
            fontSize: "0.9rem",
            color: "var(--gold-dim)",
            letterSpacing: "0.15em",
          }}
        >
          Generating invoice…
        </p>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────
  if (error) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div
          className="frame-box"
          style={{
            padding: "2rem",
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <p
            style={{
              fontSize: "0.95rem",
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            {error}
          </p>
          <button
            className="btn-primary"
            onClick={() => navigate(-1)}
            style={{ padding: "0.7rem 1.5rem", fontSize: "0.9rem" }}
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Invoice / QR state ───────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
      }}
    >
      <div
        className="frame-box"
        style={{
          padding: "2.5rem",
          maxWidth: "420px",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "1.75rem",
        }}
      >
        {/* Header */}
        <div>
          <p
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              color: "var(--gold-dim)",
              textTransform: "uppercase",
              margin: 0,
              marginBottom: "0.4rem",
            }}
          >
            {collectionName}
          </p>
          <h1
            style={{
              fontSize: "1.3rem",
              fontWeight: 600,
              color: "var(--gold-mid)",
              margin: 0,
            }}
          >
            {piece.artifactName}
          </h1>
          <p
            style={{
              fontSize: "0.85rem",
              color: "var(--silver-dark)",
              margin: "0.25rem 0 0",
            }}
          >
            Bidding as{" "}
            <strong style={{ color: "var(--gold-mid)" }}>{bidderName}</strong>
          </p>
        </div>

        {/* Amount */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.25rem",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "4px",
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "var(--silver-dark)" }}>
            Submit amount
          </span>
          <span
            className="shimmer-text"
            style={{ fontSize: "1.4rem", fontWeight: 700 }}
          >
            {formatSats(submitAmt)} sats
          </span>
        </div>

        {/* QR */}
        {invoice && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <div
              style={{
                background: "white",
                padding: "1rem",
                borderRadius: "4px",
              }}
            >
              <QRCodeSVG value={invoice} size={220} level="M" />
            </div>
            <button
              onClick={handleCopy}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "0.85rem",
                color: "var(--silver-mid)",
              }}
            >
              {copied ? "✓ Copied" : "Copy invoice"}
            </button>
          </div>
        )}

        {/* Waiting indicator */}
        <p
          className="anim-pulse-gold"
          style={{
            fontSize: "0.8rem",
            color: "var(--gold-dim)",
            textAlign: "center",
            margin: 0,
          }}
        >
          Waiting for payment…
        </p>

        {/* Actions */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
        >
          <button
            className="btn-primary"
            onClick={handleOpenWallet}
            style={{ padding: "0.85rem", fontSize: "1rem", fontWeight: 600 }}
          >
            Open in Wallet
          </button>
          <button
            onClick={() => navigate(-1)}
            style={{
              background: "none",
              border: "1px solid var(--border-subtle)",
              borderRadius: "4px",
              padding: "0.7rem",
              fontSize: "0.9rem",
              color: "var(--silver-dark)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default Payment;

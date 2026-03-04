import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { fetchBidsForPiece, type Bid } from "../libs/nostr/bid";
import type { Piece } from "../types/types";

const getBidderName = (pubkey: string): string =>
  uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: "-",
    seed: pubkey,
  });

const formatSats = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;


const WILLING_PRESETS = [10, 2000, 4000, 10000, 21000];
const SUBMIT_PRESETS = [10, 2000, 3000];

interface BiddingState {
  piece: Piece;
  collectionName: string;
  lightningAddress: string;  // from Collection
  recipientPubkey: string;   // collection owner's pubkey
}

const BiddingPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: BiddingState | null };

  const [bids, setBids] = useState<Bid[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);

  const [willingAmt, setWillingAmt] = useState<number | null>(null);
  const [submitAmt, setSubmitAmt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Stable throwaway identity for this session
  const [myPubkey] = useState(() => getPublicKey(generateSecretKey()));
  const [bidderName, setBidderName] = useState("");
  const displayName = bidderName.trim() || getBidderName(myPubkey);

  useEffect(() => {
    if (!id) return;
    fetchBidsForPiece(id).then((fetched) => {
      setBids(fetched);
      setLoadingBids(false);
    });
  }, [id]);

  if (!state) {
    navigate(-1);
    return null;
  }
  const { piece, collectionName, lightningAddress, recipientPubkey } = state;

  const highestWilling = useMemo(
    () => Math.max(0, ...bids.map((b) => b.willingAmt)),
    [bids]
  );
  const highestSubmit = useMemo(
    () => Math.max(0, ...bids.map((b) => b.submitAmt)),
    [bids]
  );

  const value = highestWilling;
  const price = highestWilling - highestSubmit;

  const canSubmit = !!willingAmt && !!submitAmt && !submitting;

  const handleSubmitBid = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const slug = piece.artifactName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    navigate(`/payment/${slug}/${piece.id}`, {
      state: {
        piece,
        collectionName,
        lightningAddress,
        recipientPubkey,
        willingAmt,
        submitAmt,
        bidderName: displayName,
      },
    });
  };

  const submitLabel = () => {
    if (submitting) return "…";
    if (!willingAmt && !submitAmt) return "Select both amounts to bid";
    if (!willingAmt) return "Select a willing amount";
    if (!submitAmt) return "Select a submit amount";
    return `Bid ${formatSats(submitAmt)} sats →`;
  };

  const PresetBtn = ({
    amt,
    selected,
    onSelect,
  }: {
    amt: number;
    selected: number | null;
    onSelect: (n: number) => void;
  }) => {
    const isSelected = selected === amt;
    return (
      <button
        onClick={() => onSelect(amt)}
        style={{
          padding: "0.6rem 1.1rem",
          fontSize: "0.9rem",
          fontWeight: 500,
          fontFamily: "inherit",
          border: `2px solid ${isSelected ? "var(--gold-mid)" : "var(--border-subtle)"}`,
          background: isSelected
            ? "color-mix(in srgb, var(--gold-mid) 15%, var(--bg-elevated))"
            : "var(--bg-elevated)",
          color: isSelected ? "var(--gold-mid)" : "var(--silver-mid)",
          cursor: "pointer",
          borderRadius: "4px",
          transition: "all 0.15s ease",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.borderColor = "var(--gold-dim)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.borderColor = "var(--border-subtle)";
        }}
      >
        {formatSats(amt)} sats
      </button>
    );
  };

  return (
    <div style={{ minHeight: "100vh", padding: "2.5rem 1.5rem 6rem", maxWidth: "1100px", margin: "0 auto" }}>

      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--silver-dark)", fontSize: "0.9rem", marginBottom: "2rem", padding: 0 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold-mid)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--silver-dark)")}
      >
        ← Back
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "55% 45%", gap: "2.5rem", alignItems: "start" }}>

        {/* LEFT */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* Piece card */}
          <div className="frame-box" style={{ overflow: "hidden", background: "var(--bg-surface)" }}>
            <div
              style={{
                height: "280px",
                background: piece.imageUrl
                  ? `url(${piece.imageUrl}) center/cover no-repeat`
                  : "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {!piece.imageUrl && (
                <div className="w-12 h-12 rotate-45" style={{ border: "1px solid color-mix(in srgb, var(--gold-dim) 40%, transparent)" }} />
              )}
            </div>
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <p style={{ fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--gold-dim)", textTransform: "uppercase", margin: 0 }}>
                {collectionName}
              </p>
              <hr className="divider-gold" />
              <h1 style={{ fontSize: "1.4rem", fontWeight: 600, color: "var(--gold-mid)", lineHeight: 1.3, margin: 0 }}>
                {piece.artifactName}
              </h1>
              <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)", margin: 0 }}>
                by {piece.makerName}
              </p>
              {piece.size && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle)" }}>
                  <span style={{ fontSize: "0.75rem", letterSpacing: "0.15em", color: "var(--gold-dim)", textTransform: "uppercase" }}>Size</span>
                  <span style={{ fontSize: "0.9rem", color: "var(--silver-light)" }}>{piece.size}</span>
                </div>
              )}
            </div>
          </div>

          {/* Value & Price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {[
              { label: "Value", value, hint: "highest willing bid" },
              { label: "Price", value: price, hint: "willing − submit" },
            ].map(({ label, value: v, hint }) => (
              <div key={label} className="frame-box" style={{ padding: "1.25rem" }}>
                <p style={{ fontSize: "0.75rem", letterSpacing: "0.2em", color: "var(--gold-dim)", textTransform: "uppercase", margin: 0, marginBottom: "0.5rem" }}>
                  {label}
                </p>
                <p className="shimmer-text" style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>
                  {v > 0 ? `${formatSats(v)} sats` : "—"}
                </p>
                <p style={{ fontSize: "0.75rem", color: "var(--silver-dark)", margin: "0.25rem 0 0" }}>
                  {hint}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Willing to bid */}
          <div className="frame-box" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--gold-muted)", margin: 0, marginBottom: "0.3rem" }}>
                Willing to Bid
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--silver-dark)", margin: 0 }}>
                The maximum you'd consider paying
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {WILLING_PRESETS.map((amt) => (
                <PresetBtn key={amt} amt={amt} selected={willingAmt} onSelect={setWillingAmt} />
              ))}
            </div>
          </div>

          {/* Submit amount */}
          <div className="frame-box" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--gold-muted)", margin: 0, marginBottom: "0.3rem" }}>
                Submit Amount
              </p>
              <p style={{ fontSize: "0.85rem", color: "var(--silver-dark)", margin: 0 }}>
                Your firm offer — payment required
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {SUBMIT_PRESETS.map((amt) => (
                <PresetBtn key={amt} amt={amt} selected={submitAmt} onSelect={setSubmitAmt} />
              ))}
            </div>
          </div>

          {/* Bidder name */}
          <div className="frame-box" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--gold-muted)", margin: 0 }}>
              Bidder Name
            </p>
            <input
              value={bidderName}
              onChange={(e) => setBidderName(e.target.value)}
              placeholder={getBidderName(myPubkey)}
              style={{
                padding: "0.6rem 0.9rem",
                fontSize: "0.9rem",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "4px",
                color: "var(--silver-light)",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <p style={{ fontSize: "0.8rem", color: "var(--silver-dark)", margin: 0 }}>
              Bidding as <strong style={{ color: "var(--gold-mid)" }}>{displayName}</strong>
            </p>
          </div>

          {/* Bids list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <p style={{ fontSize: "1rem", fontWeight: 600, color: "var(--gold-muted)", margin: 0 }}>
                All Bids
              </p>
              {!loadingBids && bids.length > 0 && (
                <p style={{ fontSize: "0.85rem", color: "var(--silver-dark)", margin: 0 }}>
                  {bids.length} total
                </p>
              )}
            </div>

            {loadingBids ? (
              <p className="anim-pulse-gold" style={{ fontSize: "0.85rem", color: "var(--gold-dim)", padding: "1rem 0", margin: 0 }}>
                Loading bids…
              </p>
            ) : bids.length === 0 ? (
              <div className="frame-box" style={{ padding: "1.5rem", textAlign: "center" }}>
                <p style={{ fontSize: "0.9rem", color: "var(--silver-dark)", margin: 0 }}>
                  No bids yet. Be the first.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "220px", overflowY: "auto" }}>
                {bids.map((bid, i) => (
                  <div
                    key={bid.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2rem 1fr auto auto",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      background: i === 0 ? "color-mix(in srgb, var(--gold-mid) 8%, var(--bg-surface))" : "var(--bg-surface)",
                      border: `1px solid ${i === 0 ? "color-mix(in srgb, var(--gold-mid) 30%, transparent)" : "var(--border-subtle)"}`,
                      borderRadius: "4px",
                    }}
                  >
                    <span style={{ fontSize: "0.75rem", color: i === 0 ? "var(--gold-mid)" : "var(--silver-dark)", fontWeight: 600 }}>
                      #{i + 1}
                    </span>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getBidderName(bid.pubkey)}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "var(--silver-dark)", whiteSpace: "nowrap" }}>
                      w: {formatSats(bid.willingAmt)}
                    </span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--gold-mid)", flexShrink: 0 }}>
                      {formatSats(bid.submitAmt)} sats
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            className="btn-primary"
            onClick={handleSubmitBid}
            disabled={!canSubmit}
            style={{
              padding: "0.85rem",
              width: "100%",
              fontSize: "1rem",
              fontWeight: 600,
              opacity: canSubmit ? 1 : 0.5,
              cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {submitLabel()}
          </button>

        </div>
      </div>
    </div>
  );
};

export default BiddingPage;
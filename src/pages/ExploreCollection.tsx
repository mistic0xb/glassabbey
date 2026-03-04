import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { fetchPiecesByCollection } from "../libs/nostr/pieces";
import type { Collection, Piece } from "../types/types";

// Reuse PieceCard visuals — self-contained here for public view
const PieceCard = ({ piece }: { piece: Piece }) => (
  <div
    className="frame-box"
    style={{
      background: "var(--bg-surface)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    }}
  >
    {/* Image */}
    <div
      style={{
        height: "200px",
        background: piece.imageUrl
          ? `url(${piece.imageUrl}) center/cover no-repeat`
          : "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {!piece.imageUrl && (
        <div
          className="w-8 h-8 rotate-45"
          style={{
            border:
              "1px solid color-mix(in srgb, var(--gold-dim) 40%, transparent)",
          }}
        />
      )}
    </div>

    {/* Details */}
    <div
      style={{
        padding: "1.25rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}
    >
      <h3
        className="font-display"
        style={{
          fontSize: "0.82rem",
          letterSpacing: "0.08em",
          color: "var(--gold-mid)",
          lineHeight: 1.3,
        }}
      >
        {piece.artifactName}
      </h3>
      <p
        className="font-body"
        style={{
          fontSize: "0.78rem",
          color: "var(--text-secondary)",
          fontStyle: "italic",
        }}
      >
        by {piece.makerName}
      </p>
      {piece.size && (
        <>
          <hr className="divider-gold" />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span
              className="font-display"
              style={{
                fontSize: "0.52rem",
                letterSpacing: "0.2em",
                color: "var(--gold-dim)",
                textTransform: "uppercase",
              }}
            >
              Size
            </span>
            <span
              className="font-body"
              style={{ fontSize: "0.75rem", color: "var(--silver-light)" }}
            >
              {piece.size}
            </span>
          </div>
        </>
      )}
    </div>
  </div>
);

const ExploreCollection = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: Collection | null };

  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state?.pubkey || !id) return;
    setLoading(true);
    fetchPiecesByCollection(state.pubkey, id).then((fetched) => {
      setPieces(fetched);
      setLoading(false);
    });
  }, [id]);

  if (!state) {
    navigate("/explore");
    return null;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem 6rem",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      {/* Back */}
      <button
        onClick={() => navigate("/explore")}
        className="font-display"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--silver-dark)",
          fontSize: "0.6rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          marginBottom: "2.5rem",
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--gold-mid)")}
        onMouseLeave={(e) =>
          (e.currentTarget.style.color = "var(--silver-dark)")
        }
      >
        ← Explore
      </button>

      {/* Collection header */}
      <div className="anim-fade-up" style={{ marginBottom: "1rem" }}>
        {state.bannerUrl && (
          <div
            style={{
              height: "200px",
              background: `url(${state.bannerUrl}) center/cover no-repeat`,
              border: "1px solid var(--border-subtle)",
              marginBottom: "2rem",
            }}
          />
        )}
        <h1
          className="font-display shimmer-text"
          style={{
            fontSize: "clamp(1.4rem, 3vw, 2rem)",
            letterSpacing: "0.1em",
          }}
        >
          {state.name}
        </h1>
        <div
          style={{
            display: "flex",
            gap: "1.5rem",
            marginTop: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <p
            className="font-body"
            style={{
              fontSize: "0.78rem",
              color: "var(--silver-dark)",
              fontStyle: "italic",
            }}
          >
            ⚡ {state.lightningAddress}
          </p>
          {state.location && (
            <p
              className="font-body"
              style={{
                fontSize: "0.78rem",
                color: "var(--silver-dark)",
                fontStyle: "italic",
              }}
            >
              📍 {state.location}
            </p>
          )}
        </div>
        <hr className="divider-gold" style={{ marginTop: "1.25rem" }} />
      </div>

      {/* Pieces */}
      {loading ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "4rem 0",
            gap: "1rem",
          }}
        >
          <div
            className="w-8 h-8 rotate-45 anim-pulse-gold"
            style={{ border: "1px solid var(--border-subtle)" }}
          />
          <p
            className="font-display anim-pulse-gold"
            style={{
              fontSize: "0.6rem",
              letterSpacing: "0.3em",
              color: "var(--gold-dim)",
            }}
          >
            FETCHING PIECES…
          </p>
        </div>
      ) : pieces.length === 0 ? (
        <div
          className="frame-box"
          style={{
            padding: "4rem 2rem",
            textAlign: "center",
            marginTop: "2rem",
          }}
        >
          <p
            className="font-display"
            style={{
              fontSize: "0.65rem",
              letterSpacing: "0.25em",
              color: "var(--text-muted)",
            }}
          >
            NO PIECES YET
          </p>
        </div>
      ) : (
        <div className="anim-fade-up delay-1" style={{ marginTop: "2rem" }}>
          <p
            className="font-body"
            style={{
              fontSize: "0.78rem",
              color: "var(--silver-dark)",
              fontStyle: "italic",
              marginBottom: "1.5rem",
            }}
          >
            {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {pieces.map((piece) => (
              <div
                key={piece.id}
                onClick={() =>
                  navigate(`/piece/${piece.id}`, {
                    state: {
                      piece,
                      collectionName: state.name,
                      lightningAddress: state.lightningAddress,
                      recipientPubkey: state.pubkey,
                    },
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <PieceCard piece={piece} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExploreCollection;

import { useNavigate } from "react-router";
import type { Collection } from "../../types/types";
import type { DraftCollection } from "../../libs/draftCollections";

interface Props {
  collection: Collection | DraftCollection;
  pieceCount?: number;
  isDraft?: boolean;
}

const CollectionCard = ({ collection, pieceCount = 0, isDraft = false }: Props) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/admin/collection/${collection.id}/add-pieces`);
  };

  return (
    <div
      onClick={handleClick}
      className="frame-box cursor-pointer group transition-all duration-300"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
        transition: "border-color 0.3s ease",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.borderColor = "var(--gold-muted)")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.borderColor = "var(--border-subtle)")
      }
    >
      {/* Banner */}
      <div
        style={{
          height: "140px",
          background: collection.bannerUrl
            ? `url(${collection.bannerUrl}) center/cover no-repeat`
            : "linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-overlay) 100%)",
          position: "relative",
        }}
      >
        {/* Draft badge */}
        {isDraft && (
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "color-mix(in srgb, var(--gold-dim) 30%, var(--bg-base))",
              border: "1px solid var(--gold-dim)",
              padding: "2px 10px",
            }}
          >
            <span
              className="font-display"
              style={{ fontSize: "9px", letterSpacing: "0.2em", color: "var(--gold-muted)" }}
            >
              DRAFT
            </span>
          </div>
        )}

        {/* No banner placeholder */}
        {!collection.bannerUrl && (
          <div className="w-full h-full flex items-center justify-center">
            <div
              className="w-8 h-8 rotate-45"
              style={{
                border: "1px solid color-mix(in srgb, var(--gold-dim) 40%, transparent)",
              }}
            />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {/* Name */}
        <h3
          className="font-display truncate"
          style={{
            fontSize: "0.85rem",
            letterSpacing: "0.1em",
            color: "var(--gold-mid)",
            marginBottom: "0.5rem",
          }}
        >
          {collection.name}
        </h3>

        {/* Lightning address */}
        <p
          className="font-body truncate"
          style={{
            fontSize: "0.75rem",
            color: "var(--text-muted)",
            marginBottom: "0.4rem",
          }}
        >
          ⚡ {collection.lightningAddress}
        </p>

        {/* Location */}
        {collection.location && (
          <p
            className="font-body truncate"
            style={{ fontSize: "0.72rem", color: "var(--silver-dark)", marginBottom: "0.4rem" }}
          >
            📍 {collection.location}
          </p>
        )}

        {/* Divider */}
        <hr className="divider-gold" style={{ margin: "0.75rem 0" }} />

        {/* Piece count */}
        <p
          className="font-display"
          style={{ fontSize: "0.68rem", letterSpacing: "0.15em", color: "var(--text-muted)" }}
        >
          {pieceCount} {pieceCount === 1 ? "PIECE" : "PIECES"}
        </p>
      </div>
    </div>
  );
};

export default CollectionCard;
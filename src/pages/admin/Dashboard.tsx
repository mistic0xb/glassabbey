import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { fetchCollectionsByCreator } from "../../libs/nostr/collection";
import { getDraftCollections } from "../../libs/draftCollections";
import CollectionCard from "../../components/CollectionCard";
import type { Collection } from "../../types/types";
import type { DraftCollection } from "../../libs/draftCollections";
import { fetchPiecesByCollection } from "../../libs/nostr/pieces";

const Dashboard = () => {
  const { userPubkey, userName } = useAuth();
  const navigate = useNavigate();

  const [published, setPublished] = useState<Collection[]>([]);
  const [drafts, setDrafts] = useState<DraftCollection[]>([]);
  const [pieceCounts, setPieceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userPubkey) return;

    const load = async () => {
      setLoading(true);

      // Load drafts from localStorage
      if (userPubkey) setDrafts(getDraftCollections(userPubkey));

      // Fetch published collections from Nostr
      const cols = await fetchCollectionsByCreator(userPubkey);
      setPublished(cols);

      // Fetch piece counts in parallel
      const counts: Record<string, number> = {};
      await Promise.all(
        cols.map(async (col) => {
          const pieces = await fetchPiecesByCollection(userPubkey, col.id);
          counts[col.id] = pieces.length;
        }),
      );
      setPieceCounts(counts);
      setLoading(false);
    };

    load();
  }, [userPubkey]);

  console.log("DRAFTS:", drafts);

  const totalPublished = published.length;
  const totalDrafts = drafts.length;

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "3rem 1.5rem 5rem",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: "3rem" }}>
        <p
          className="font-display"
          style={{
            fontSize: "0.65rem",
            letterSpacing: "0.3em",
            color: "var(--gold-dim)",
            marginBottom: "0.5rem",
            textTransform: "uppercase",
          }}
        >
          Admin
        </p>
        <h1
          className="font-display shimmer-text"
          style={{
            fontSize: "clamp(1.4rem, 3vw, 2rem)",
            letterSpacing: "0.1em",
          }}
        >
          {userName ? `${userName}'s Collections` : "My Collections"}
        </h1>
        <hr
          className="divider-gold"
          style={{ marginTop: "1.25rem", maxWidth: "200px" }}
        />
      </div>

      {/* Stats row */}
      <div
        className="anim-fade-up delay-1"
        style={{
          display: "flex",
          gap: "1.5rem",
          marginBottom: "3rem",
          flexWrap: "wrap",
        }}
      >
        {[
          { label: "Published", value: totalPublished },
          { label: "Drafts", value: totalDrafts },
          {
            label: "Total Pieces",
            value: Object.values(pieceCounts).reduce((a, b) => a + b, 0),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="frame-box"
            style={{ padding: "1rem 1.75rem", minWidth: "120px" }}
          >
            <p
              className="font-display"
              style={{
                fontSize: "1.4rem",
                color: "var(--gold-mid)",
                letterSpacing: "0.05em",
              }}
            >
              {stat.value}
            </p>
            <p
              className="font-display"
              style={{
                fontSize: "0.6rem",
                letterSpacing: "0.25em",
                color: "var(--text-muted)",
                marginTop: "0.25rem",
              }}
            >
              {stat.label.toUpperCase()}
            </p>
          </div>
        ))}
      </div>

      {/* Drafts section */}
      {totalDrafts > 0 && (
        <section
          className="anim-fade-up delay-2"
          style={{ marginBottom: "3.5rem" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1.5rem",
            }}
          >
            <h2
              className="font-display"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.25em",
                color: "var(--gold-muted)",
                textTransform: "uppercase",
              }}
            >
              Drafts
            </h2>
            <hr className="divider-gold" style={{ flex: 1 }} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {drafts.map((draft) => (
              <CollectionCard
                key={draft.id}
                collection={draft}
                pieceCount={draft.pieces.length}
                isDraft
              />
            ))}
          </div>
        </section>
      )}

      {/* Published section */}
      <section className="anim-fade-up delay-3">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flex: 1,
            }}
          >
            <h2
              className="font-display"
              style={{
                fontSize: "0.7rem",
                letterSpacing: "0.25em",
                color: "var(--gold-muted)",
                textTransform: "uppercase",
                whiteSpace: "nowrap",
              }}
            >
              Published
            </h2>
            <hr className="divider-gold" style={{ flex: 1 }} />
          </div>

          {/* New Collection button */}
          <button
            className="btn-primary"
            style={{
              padding: "0.6rem 1.5rem",
              fontSize: "0.65rem",
              whiteSpace: "nowrap",
            }}
            onClick={() => navigate("/admin/collection/create")}
          >
            + New Collection
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "4rem 0", textAlign: "center" }}>
            <div
              className="anim-pulse-gold font-display"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.3em",
                color: "var(--gold-dim)",
              }}
            >
              FETCHING FROM RELAYS…
            </div>
          </div>
        ) : published.length === 0 ? (
          <div
            className="frame-box"
            style={{
              padding: "4rem 2rem",
              textAlign: "center",
              background: "var(--bg-surface)",
            }}
          >
            <div
              className="w-10 h-10 rotate-45 mx-auto"
              style={{
                border: "1px solid var(--border-subtle)",
                marginBottom: "1.5rem",
              }}
            />
            <p
              className="font-display"
              style={{
                fontSize: "0.65rem",
                letterSpacing: "0.25em",
                color: "var(--text-muted)",
              }}
            >
              NO PUBLISHED COLLECTIONS YET
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {published.map((col) => (
              <CollectionCard
                key={col.id}
                collection={col}
                pieceCount={pieceCounts[col.id] ?? 0}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;

import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { fetchAllCollections } from "../libs/nostr/collection";
import { fetchPiecesByCollection } from "../libs/nostr/pieces";
import CollectionCard from "../components/CollectionCard";
import type { Collection } from "../types/types";

const Explore = () => {
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [pieceCounts, setPieceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const cols = await fetchAllCollections(200);
      setCollections(cols);
      setLoading(false);

      // Fetch piece counts in parallel after collections load
      const counts: Record<string, number> = {};
      await Promise.all(
        cols.map(async (col) => {
          if (!col.pubkey) return;
          const pieces = await fetchPiecesByCollection(col.pubkey, col.id);
          counts[col.id] = pieces.length;
          // Update progressively as each resolves
          setPieceCounts((prev) => ({ ...prev, [col.id]: pieces.length }));
        })
      );
    };
    load();
  }, []);

  const handleCardClick = (col: Collection) => {
    const slug = col.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    navigate(`/explore/${slug}/${col.id}`, { state: col });
  };

  return (
    <div style={{ minHeight: "100vh", padding: "3rem 1.5rem 6rem", maxWidth: "1200px", margin: "0 auto" }}>

      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: "3rem" }}>
        <p className="font-display" style={{ fontSize: "0.6rem", letterSpacing: "0.35em", color: "var(--gold-dim)", marginBottom: "0.5rem", textTransform: "uppercase" }}>
          Discover
        </p>
        <h1 className="font-display shimmer-text" style={{ fontSize: "clamp(1.4rem, 3vw, 2rem)", letterSpacing: "0.1em" }}>
          Collections
        </h1>
        <hr className="divider-gold" style={{ marginTop: "1.25rem", maxWidth: "160px" }} />
      </div>

      {/* Loading */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "6rem 0", gap: "1.5rem" }}>
          <div className="w-10 h-10 rotate-45 anim-pulse-gold" style={{ border: "1px solid var(--border-subtle)" }} />
          <p className="font-display anim-pulse-gold" style={{ fontSize: "0.6rem", letterSpacing: "0.3em", color: "var(--gold-dim)" }}>
            FETCHING FROM RELAYS…
          </p>
        </div>

      ) : collections.length === 0 ? (
        <div className="frame-box" style={{ padding: "5rem 2rem", textAlign: "center" }}>
          <p className="font-display" style={{ fontSize: "0.65rem", letterSpacing: "0.25em", color: "var(--text-muted)" }}>
            NO COLLECTIONS FOUND
          </p>
        </div>

      ) : (
        <>
          <p className="font-body anim-fade-up" style={{ fontSize: "0.78rem", color: "var(--silver-dark)", fontStyle: "italic", marginBottom: "2rem" }}>
            {collections.length} collection{collections.length !== 1 ? "s" : ""} found
          </p>
          <div
            className="anim-fade-up delay-1"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1.25rem" }}
          >
            {collections.map((col) => (
              <div key={col.id} onClick={() => handleCardClick(col)} style={{ cursor: "pointer" }}>
                <CollectionCard
                  collection={col}
                  pieceCount={pieceCounts[col.id] ?? 0}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Explore;
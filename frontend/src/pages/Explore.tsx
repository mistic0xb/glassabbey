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

      await Promise.all(
        cols.map(async (col) => {
          if (!col.pubkey) return;
          const pieces = await fetchPiecesByCollection(col.pubkey, col.id);
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
    <div className="min-h-screen px-6 py-10 max-w-6xl mx-auto">

      {/* Header */}
      <div className="mb-10">
        <p className="text-white/30 text-xs uppercase tracking-widest mb-2">Discover</p>
        <h1 className="text-2xl font-bold text-white">Collections</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <p className="text-white/30 text-sm">Fetching from relays…</p>
        </div>
      ) : collections.length === 0 ? (
        <div className="border border-white/10 rounded-lg py-20 text-center">
          <p className="text-white/20 text-sm">No collections found.</p>
        </div>
      ) : (
        <>
          <p className="text-white/30 text-sm mb-6">
            {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {collections.map((col) => (
              <div key={col.id} onClick={() => handleCardClick(col)} className="cursor-pointer">
                <CollectionCard collection={col} pieceCount={pieceCounts[col.id] ?? 0} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Explore;
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
      setDrafts(getDraftCollections(userPubkey));
      const cols = await fetchCollectionsByCreator(userPubkey);
      setPublished(cols);
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

  const stats = [
    { label: "Published", value: published.length },
    { label: "Drafts", value: drafts.length },
    {
      label: "Total Pieces",
      value: Object.values(pieceCounts).reduce((a, b) => a + b, 0),
    },
  ];

  return (
    <div className="min-h-screen px-6 py-10 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <p className="text-white/30 text-xs tracking-widest uppercase mb-2">
          Admin
        </p>
        <h1 className="text-2xl font-bold text-white">
          {userName ? `${userName}'s Collections` : "My Collections"}
        </h1>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-10 flex-wrap">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="border border-white/10 rounded px-6 py-4 min-w-30"
          >
            <p className="text-2xl font-bold text-yellow-400">{stat.value}</p>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Published */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
            Published
          </h2>
          <button
            onClick={() => navigate("/admin/collection/create")}
            className="border border-green-500 text-green-400 text-sm px-4 py-1.5 rounded hover:bg-green-500/10 transition-colors cursor-pointer bg-transparent"
          >
            + New Collection
          </button>
        </div>

        {loading ? (
          <p className="text-white/30 text-sm py-10">Fetching from relays…</p>
        ) : published.length === 0 ? (
          <div className="border border-white/10 rounded px-6 py-16 text-center text-white/30 text-sm">
            No published collections yet.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
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

      {/* Drafts */}
      {drafts.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">
            Drafts
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
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
    </div>
  );
};

export default Dashboard;

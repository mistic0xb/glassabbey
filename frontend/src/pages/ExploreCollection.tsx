import { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { fetchPiecesByCollection } from "../libs/nostr/pieces";
import { PieceCard } from "./admin/AddPieces";
import type { Collection, Piece } from "../types/types";

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
    <div className="min-h-screen px-6 py-10 max-w-6xl mx-auto">

      {/* Back */}
      <button
        onClick={() => navigate("/explore")}
        className="text-white/30 text-xs hover:text-white transition-colors bg-transparent border-none cursor-pointer mb-8"
      >
        ← Explore
      </button>

      {/* Banner */}
      {state.bannerUrl && (
        <div
          className="h-48 rounded-lg overflow-hidden border border-white/10 mb-8 bg-cover bg-center"
          style={{ backgroundImage: `url(${state.bannerUrl})` }}
        />
      )}

      {/* Collection header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{state.name}</h1>
        <div className="flex gap-4 mt-2 flex-wrap">
          <p className="text-white/40 text-sm">⚡ {state.lightningAddress}</p>
          {state.location && (
            <p className="text-white/40 text-sm">📍 {state.location}</p>
          )}
        </div>
        <div className="border-t border-white/10 mt-6" />
      </div>

      {/* Pieces */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <p className="text-white/30 text-sm">Fetching pieces…</p>
        </div>
      ) : pieces.length === 0 ? (
        <div className="border border-white/10 rounded-lg py-20 text-center">
          <p className="text-white/20 text-sm">No pieces yet.</p>
        </div>
      ) : (
        <>
          <p className="text-white/30 text-sm mb-6">
            {pieces.length} {pieces.length === 1 ? "piece" : "pieces"}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {pieces.map((piece) => (
              <div
                key={piece.id}
                onClick={() => navigate(`/piece/${piece.id}`, {
                  state: {
                    piece,
                    collectionName: state.name,
                    lightningAddress: state.lightningAddress,
                    recipientPubkey: state.pubkey,
                  },
                })}
                className="cursor-pointer"
              >
                <PieceCard piece={piece} collectionName={state.name} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ExploreCollection;
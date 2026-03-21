import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { SimplePool } from "nostr-tools/pool";
import { fetchPiecesByCollection } from "../libs/nostr/pieces";
import { PieceCard } from "./admin/AddPieces";
import type { Collection, Piece } from "../types/types";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://nostr.mom",
  "wss://relay.angor.io",
];

const pieceBidTag = (pieceId: string) => `glassabbey-bid:${pieceId}`;

// Fetches current prices for a list of pieceIds from Nostr relays.
// Mirrors the server-side fetchPriceFromNostr logic exactly:
// currentPrice = willingAmt - submitAmt of the highest willingAmt bid.
function usePiecePricesFromNostr(pieceIds: string[]): {
  prices: Record<string, number>;
  loading: boolean;
} {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef<string>("");

  useEffect(() => {
    if (!pieceIds.length) return;

    const key = pieceIds.slice().sort().join(",");
    if (fetchedRef.current === key) return;
    fetchedRef.current = key;

    setLoading(true);

    const pool = new SimplePool();

    // Track bids per piece: pieceId → { willingAmt, submitAmt }[]
    const bidsByPiece: Record<string, { willingAmt: number; submitAmt: number }[]> = {};
    pieceIds.forEach((id) => (bidsByPiece[id] = []));

    // Subscribe to all pieces in one query using multiple #t filters
    const tags = pieceIds.map(pieceBidTag);

    let eoseCount = 0;

    const flushPrices = () => {
      const result: Record<string, number> = {};
      for (const pieceId of pieceIds) {
        const bids = bidsByPiece[pieceId] ?? [];
        if (!bids.length) {
          result[pieceId] = 0;
          continue;
        }
        const top = bids.reduce((a, b) =>
          b.willingAmt > a.willingAmt ? b : a,
        );
        result[pieceId] = top.willingAmt - top.submitAmt;
      }
      setPrices(result);
      setLoading(false);
    };

    const timeout = setTimeout(() => {
      sub.close();
      pool.close(RELAYS);
      flushPrices();
    }, 8000);

    const sub = pool.subscribeMany(
      RELAYS,
      { kinds: [30078], "#t": tags, limit: 500 },
      {
        onevent(event) {
          try {
            const data = JSON.parse(event.content) as {
              willingAmt?: number;
              submitAmt?: number;
            };
            if (!data.willingAmt || !data.submitAmt) return;

            // Figure out which pieceId this event belongs to by matching its tags
            const matchedTag = event.tags
              .filter(([name]) => name === "t")
              .map(([, val]) => val)
              .find((val) => val.startsWith("glassabbey-bid:") && val !== "glassabbey-bid");

            if (!matchedTag) return;
            const pieceId = matchedTag.replace("glassabbey-bid:", "");
            if (!bidsByPiece[pieceId]) return;

            bidsByPiece[pieceId].push({
              willingAmt: data.willingAmt,
              submitAmt: data.submitAmt,
            });
          } catch {}
        },
        oneose() {
          eoseCount++;
          if (eoseCount >= RELAYS.length) {
            clearTimeout(timeout);
            sub.close();
            pool.close(RELAYS);
            flushPrices();
          }
        },
      },
    );

    return () => {
      clearTimeout(timeout);
      try {
        sub.close();
        pool.close(RELAYS);
      } catch {}
    };
  }, [pieceIds.slice().sort().join(",")]);

  return { prices, loading };
}

const PriceBadge = ({
  pieceId,
  prices,
  pricesLoading,
}: {
  pieceId: string;
  prices: Record<string, number>;
  pricesLoading: boolean;
}) => {
  const hasPrice = pieceId in prices;

  if (pricesLoading && !hasPrice) {
    return (
      <div className="mt-2 px-3 pb-3">
        <div className="h-6 rounded bg-white/5 animate-pulse w-24" />
      </div>
    );
  }

  const price = prices[pieceId] ?? 0;

  return (
    <div className="mt-2 px-3 pb-3 flex items-center justify-between">
      <span className="text-[10px] text-white/30 uppercase tracking-widest">
        {price === 0 ? "No bids yet" : "Current bid"}
      </span>
      {price > 0 && (
        <span className="text-xs font-semibold text-amber-400">
          {price.toLocaleString()} sats
        </span>
      )}
    </div>
  );
};

const ExploreCollection = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { state } = useLocation() as { state: Collection | null };
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);

  const pieceIds = pieces.map((p) => p.id);
  const { prices, loading: pricesLoading } = usePiecePricesFromNostr(pieceIds);

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
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
                className="cursor-pointer flex flex-col"
              >
                <PieceCard piece={piece} collectionName={state.name} />
                <PriceBadge
                  pieceId={piece.id}
                  prices={prices}
                  pricesLoading={pricesLoading}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ExploreCollection;
import { useState, useEffect, useMemo, useCallback } from "react";
import { flushSync } from "react-dom";
import { useNavigate, useParams } from "react-router";
import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
} from "unique-names-generator";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { fetchBidsForPiece, type Bid } from "../libs/nostr/bid";
import { monitorZapPayment } from "../libs/nostr/nip57";
import { fetchPieceById } from "../libs/nostr/pieces";
import { fetchAllCollections } from "../libs/nostr/collection";
import type { Piece, Collection } from "../types/types";

const getBidderName = (pubkey: string): string =>
  uniqueNamesGenerator({
    dictionaries: [adjectives, colors, animals],
    separator: "-",
    seed: pubkey,
  });

const formatSats = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `${n}`;

const BID_PRESETS = [1000, 2000, 4000, 5000, 10000];
const SUBMIT_PRESETS = [10, 21, 2000, 3000];

const PresetBtn = ({
  label,
  value,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  value: number;
  selected: number | null;
  onSelect: (n: number) => void;
  disabled?: boolean;
}) => (
  <button
    onClick={() => !disabled && onSelect(value)}
    disabled={disabled}
    className={`px-4 py-2 text-sm rounded border transition-all cursor-pointer ${
      disabled
        ? "border-white/5 bg-white/2 text-white/20 cursor-not-allowed"
        : selected === value
          ? "border-green-500 bg-green-500/10 text-green-400"
          : "border-white/10 bg-white/5 text-white/50 hover:border-white/25 hover:text-white/80"
    }`}
  >
    {label}
  </button>
);

const BiddingPage = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [piece, setPiece] = useState<Piece | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [loadingPiece, setLoadingPiece] = useState(true);

  const [bids, setBids] = useState<Bid[]>([]);
  const [loadingBids, setLoadingBids] = useState(true);
  const [bidAmt, setBidAmt] = useState<number | null>(null);
  const [submitAmt, setSubmitAmt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bidderName, setBidderName] = useState("");

  const [myPubkey] = useState(() => getPublicKey(generateSecretKey()));
  const fallbackName = getBidderName(myPubkey);
  const displayName =
    bidderName.trim() !== "" ? bidderName.trim().toLowerCase() : fallbackName;

  // Fetch piece + collection
  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoadingPiece(true);
      const fetchedPiece = await fetchPieceById(id);
      if (!fetchedPiece) {
        navigate(-1);
        return;
      }
      setPiece(fetchedPiece);
      const allCollections = await fetchAllCollections(200);
      const match = allCollections.find(
        (c) =>
          c.id === fetchedPiece.collectionId &&
          c.pubkey === fetchedPiece.creatorPubkey,
      );
      setCollection(match ?? null);
      setLoadingPiece(false);
    };
    load();
  }, [id]);

  // Fetch bids
  const fetchBids = useCallback(() => {
    if (!id) return;
    setLoadingBids(true);
    fetchBidsForPiece(id).then((fetched) => {
      setBids(fetched);
      setLoadingBids(false);
    });
  }, [id]);

  useEffect(() => {
    fetchBids();
  }, [fetchBids]);

  // Refetch bids on window focus (after returning from payment)
  useEffect(() => {
    window.addEventListener("focus", fetchBids);
    return () => window.removeEventListener("focus", fetchBids);
  }, [fetchBids]);

  // Live-update: watch ALL zaps for this piece's recipient — no zapRequestId
  useEffect(() => {
    if (!piece) return;
    const unsubscribe = monitorZapPayment(piece.creatorPubkey, () => {
      flushSync(() => {
        fetchBids();
      });
    });
    return () => unsubscribe();
  }, [piece, fetchBids]);

  // Sort bids by bidAmt descending
  const sortedBids = useMemo(
    () => [...bids].sort((a, b) => b.willingAmt - a.willingAmt),
    [bids],
  );

  const topBidder = sortedBids[0] ?? null;

  const bidsWithPrice = useMemo(() => {
    const ascending = [...sortedBids].reverse();
    let cumSubmit = 0;
    const withPrice = ascending.map((bid) => {
      cumSubmit += bid.submitAmt;
      return { ...bid, runningPrice: bid.willingAmt - cumSubmit };
    });
    return withPrice.reverse();
  }, [sortedBids]);

  const currentHighestBid = useMemo(
    () => Math.max(0, ...bids.map((b) => b.willingAmt)),
    [bids],
  );

  const value = useMemo(
    () => currentHighestBid + bids.reduce((acc, b) => acc + b.submitAmt, 0),
    [bids, currentHighestBid],
  );

  const totalSubmit = useMemo(
    () => bids.reduce((acc, b) => acc + b.submitAmt, 0),
    [bids],
  );

  const topBidPrice = topBidder ? topBidder.willingAmt - totalSubmit : 0;

  const handleBidAmtSelect = (amt: number) => {
    setBidAmt(amt);
    const newFinalBidAmt = currentHighestBid + amt;
    if (submitAmt !== null && submitAmt > newFinalBidAmt) {
      setSubmitAmt(null);
    }
  };

  const finalBidAmt = bidAmt !== null ? currentHighestBid + bidAmt : null;

  const canSubmit =
    !!finalBidAmt && !!submitAmt && !submitting && !!piece && !!collection;

  const handleSubmitBid = () => {
    if (!canSubmit || !piece || !collection || finalBidAmt === null) return;
    setSubmitting(true);
    const slug = piece.artifactName
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    navigate(`/payment/${slug}/${piece.id}`, {
      state: {
        piece,
        collectionName: collection.name,
        lightningAddress: collection.lightningAddress,
        recipientPubkey: collection.pubkey,
        willingAmt: finalBidAmt,
        submitAmt,
        bidderName: displayName,
      },
    });
  };

  const submitLabel = () => {
    if (submitting) return "…";
    if (!bidAmt && !submitAmt) return "Select both amounts to bid";
    if (!bidAmt) return "Select a bid increment";
    if (!submitAmt) return "Select a submit amount";
    return "Bid";
  };

  if (loadingPiece) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/30 text-sm">Loading piece…</p>
      </div>
    );
  }

  if (!piece) return null;

  return (
    <div className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="text-white/30 text-xs hover:text-white transition-colors bg-transparent border-none cursor-pointer mb-8"
      >
        ← Back
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-6 items-start">
        {/* LEFT */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg overflow-hidden border border-white/10">
            <div className="h-64 sm:h-72 overflow-hidden">
              <img
                src={
                  piece.imageUrl ||
                  "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?w=600&h=400&fit=crop"
                }
                alt={piece.artifactName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-5 flex flex-col gap-2 border-t border-white/10">
              <p className="text-white/30 text-xs uppercase tracking-widest">
                {collection?.name}
              </p>
              <div className="border-t border-white/10 pt-3">
                <h1 className="text-white font-semibold text-xl">
                  {piece.artifactName}
                </h1>
                <p className="text-white/50 text-sm italic mt-1">
                  by {piece.makerName}
                </p>
              </div>
              {piece.size && (
                <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                  <span className="text-white/30 text-xs uppercase tracking-widest">
                    Size
                  </span>
                  <span className="text-white/70 text-sm">{piece.size}</span>
                </div>
              )}
            </div>
          </div>

          {topBidder && (
            <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-lg px-4 py-3 flex justify-between items-center">
              <div>
                <p className="text-white/30 text-xs uppercase tracking-widest mb-0.5">
                  Top Bidder
                </p>
                <p className="text-white/80 text-sm font-medium">
                  {topBidder.bidderName || getBidderName(topBidder.pubkey)}
                </p>
              </div>
              <p className="text-yellow-400 font-bold text-lg">
                {topBidPrice.toLocaleString()} sats
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Value", val: value, hint: "top bid + Σ(submit)" },
              { label: "Price", val: topBidPrice, hint: "top bid − Σ(submit)" },
            ].map(({ label, val, hint }) => (
              <div
                key={label}
                className="border border-white/10 rounded-lg p-4 bg-white/2"
              >
                <p className="text-white/30 text-xs uppercase tracking-widest mb-2">
                  {label}
                </p>
                <p className="text-yellow-400 font-bold text-xl">
                  {val > 0 ? `${val.toLocaleString()} sats` : "—"}
                </p>
                <p className="text-white/20 text-xs mt-1">{hint}</p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT */}
        <div className="flex flex-col gap-4">
          <div className="border border-white/10 rounded-lg p-5 bg-white/2">
            <p className="text-white font-semibold text-sm mb-4">Bid Amount</p>
            <div className="flex flex-wrap gap-2">
              {BID_PRESETS.map((amt) => (
                <PresetBtn
                  key={amt}
                  value={amt}
                  label={`+${formatSats(amt)}`}
                  selected={bidAmt}
                  onSelect={handleBidAmtSelect}
                />
              ))}
            </div>
          </div>

          <div className="border border-white/10 rounded-lg p-5 bg-white/2">
            <p className="text-white font-semibold text-sm mb-1">
              Submit Amount
            </p>
            <p className="text-white/40 text-xs mb-4">
              Paid now via Lightning — deducted from final price
            </p>
            <div className="flex flex-wrap gap-2">
              {SUBMIT_PRESETS.map((amt) => {
                const isDisabled = finalBidAmt !== null && amt > finalBidAmt;
                return (
                  <PresetBtn
                    key={amt}
                    value={amt}
                    label={`${formatSats(amt)} sats`}
                    selected={submitAmt}
                    onSelect={setSubmitAmt}
                    disabled={isDisabled}
                  />
                );
              })}
            </div>
          </div>

          <div className="border border-white/10 rounded-lg p-5 bg-white/2">
            <p className="text-white font-semibold text-sm mb-1">Bidder Name</p>
            <input
              value={bidderName}
              onChange={(e) => setBidderName(e.target.value)}
              placeholder={fallbackName}
              className="w-full bg-white/5 border border-white/10 focus:border-white/30 outline-none text-white text-sm px-3 py-2 rounded transition-colors placeholder:text-white/20 mt-2"
            />
            <p className="text-white/30 text-xs mt-2">
              Bidding as <span className="text-white/60">{displayName}</span>
            </p>
          </div>

          <div className="border border-white/10 rounded-lg p-5 bg-white/2">
            <div className="flex justify-between items-center mb-4">
              <p className="text-white font-semibold text-sm">All Bids</p>
              {!loadingBids && bids.length > 0 && (
                <span className="text-white/30 text-xs">
                  {bids.length} total
                </span>
              )}
            </div>
            {loadingBids ? (
              <p className="text-white/30 text-sm py-2">Loading bids…</p>
            ) : sortedBids.length === 0 ? (
              <p className="text-white/20 text-sm text-center py-4">
                No bids yet. Be the first.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto">
                {bidsWithPrice.map((bid, i) => (
                  <div
                    key={bid.id}
                    className={`grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 px-3 py-2.5 rounded border text-sm ${
                      i === 0
                        ? "border-green-500/20 bg-green-500/5"
                        : "border-white/5 bg-white/1"
                    }`}
                  >
                    <span
                      className={`text-xs font-semibold ${i === 0 ? "text-green-400" : "text-white/20"}`}
                    >
                      #{i + 1}
                    </span>
                    <span className="text-white/50 truncate text-xs">
                      {bid.bidderName || getBidderName(bid.pubkey)}
                    </span>
                    <span
                      className={`font-semibold text-xs whitespace-nowrap ${i === 0 ? "text-green-400" : "text-white/60"}`}
                    >
                      {bid.runningPrice.toLocaleString()} sats
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={handleSubmitBid}
            disabled={!canSubmit}
            className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded transition-colors border-none cursor-pointer"
          >
            {submitLabel()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BiddingPage;

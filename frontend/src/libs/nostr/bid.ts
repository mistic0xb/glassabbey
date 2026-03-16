import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import type { Event } from "nostr-tools";
import type { SubCloser } from "nostr-tools/abstract-pool";
import { getPool, DEFAULT_RELAYS } from "./pool";

export interface Bid {
  id: string;
  pieceId: string;
  bidderName?: string;
  willingAmt: number;
  submitAmt: number;
  createdAt: number;
  pubkey: string;
}

const pieceBidTag = (pieceId: string) => `glassabbey-bid:${pieceId}`;

export async function fetchBidsForPiece(pieceId: string): Promise<Bid[]> {
  const pool = getPool();
  return new Promise((resolve) => {
    const bids: Bid[] = [];
    const seen = new Set<string>();
    let sub: SubCloser;

    const timeout = setTimeout(() => {
      if (sub) sub.close();
      resolve(sortBids(bids));
    }, 5000);

    sub = pool.subscribeMany(
      DEFAULT_RELAYS,
      {
        kinds: [30078],
        "#t": [pieceBidTag(pieceId)],
        limit: 100,
      },
      {
        onevent(event: Event) {
          if (seen.has(event.id)) return;
          seen.add(event.id);
          try {
            const data = JSON.parse(event.content) as {
              bidderName?: string;
              willingAmt: number;
              submitAmt: number;
            };
            if (!data.willingAmt || !data.submitAmt) return;
            bids.push({
              id: event.id,
              pieceId,
              bidderName: data.bidderName,
              willingAmt: data.willingAmt,
              submitAmt: data.submitAmt,
              createdAt: event.created_at,
              pubkey: event.pubkey,
            });
          } catch (err) {
            console.error("Failed to parse bid:", err);
          }
        },
        oneose() {
          clearTimeout(timeout);
          if (sub) sub.close();
          resolve(sortBids(bids));
        },
      }
    );
  });
}

// Sign the bid event once and return it — callers can retry publishing
// the same signed event without creating duplicate relay entries.
export function createSignedBid(
  pieceId: string,
  willingAmt: number,
  submitAmt: number,
  bidderName?: string,
): Event {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const eventTemplate = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      // Use a stable d-tag derived from the bid's unique identity (willingAmt + pieceId).
      // This makes it a replaceable event — if the same bid is published twice,
      // the relay deduplicates by (pubkey, kind, d-tag). Since we generate a fresh
      // keypair per bid, the pubkey is already unique, but the stable d-tag prevents
      // different retry attempts from creating duplicate entries.
      ["d", `bid-${pieceId}-${willingAmt}`],
      ["t", "glassabbey-bid"],
      ["t", pieceBidTag(pieceId)],
    ],
    content: JSON.stringify({ willingAmt, submitAmt, bidderName }),
    pubkey: pk,
  };
  return finalizeEvent(eventTemplate, sk);
}

// Publish a pre-signed bid event to relays.
// Accepts an already-signed event so retries re-publish the same event
// rather than creating new ones.
export async function publishSignedBid(signedEvent: Event): Promise<void> {
  const pool = getPool();
  const pubs = pool.publish(DEFAULT_RELAYS, signedEvent);
  await Promise.race([
    Promise.any(pubs),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
}

// Convenience function for single-shot publish (backward compat).
export async function publishBid(
  pieceId: string,
  willingAmt: number,
  submitAmt: number,
  bidderName?: string,
): Promise<string> {
  const signed = createSignedBid(pieceId, willingAmt, submitAmt, bidderName);
  await publishSignedBid(signed);
  return signed.pubkey;
}

function sortBids(bids: Bid[]): Bid[] {
  return [...bids].sort((a, b) => b.willingAmt - a.willingAmt);
}
import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools";
import type { Event } from "nostr-tools";
import type { SubCloser } from "nostr-tools/abstract-pool";
import { getPool, DEFAULT_RELAYS } from "./pool";

export interface Bid {
  id: string;
  pieceId: string;
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
              willingAmt: number;
              submitAmt: number;
            };
            if (!data.willingAmt || !data.submitAmt) return;
            bids.push({
              id: event.id,
              pieceId,
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

export async function publishBid(
  pieceId: string,
  willingAmt: number,
  submitAmt: number
): Promise<string> {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  const eventTemplate = {
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `bid-${pieceId}-${Date.now()}`],
      ["t", "glassabbey-bid"],
      ["t", pieceBidTag(pieceId)],
    ],
    content: JSON.stringify({ willingAmt, submitAmt }),
    pubkey: pk,
  };

  const signed = finalizeEvent(eventTemplate, sk);
  const pool = getPool();
  const pubs = pool.publish(DEFAULT_RELAYS, signed);

  await Promise.race([
    Promise.all(pubs),
    new Promise((r) => setTimeout(r, 5000)),
  ]);

  return pk;
}

function sortBids(bids: Bid[]): Bid[] {
  return [...bids].sort((a, b) => b.willingAmt - a.willingAmt);
}
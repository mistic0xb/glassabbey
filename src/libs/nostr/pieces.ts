import type { Event } from "nostr-tools";
import type { SubCloser } from "nostr-tools/abstract-pool";
import { DEFAULT_RELAYS, getPool } from "./pool";
import type { Piece } from "../../types/types";

// d-tag for the pieces list event of a given collection
const piecesDTag = (collectionId: string) => `${collectionId}-pieces`;

export async function fetchPiecesByCollection(
    creatorPubkey: string,
    collectionId: string
): Promise<Piece[]> {
    const pool = getPool();

    return new Promise((resolve) => {
        let sub: SubCloser;

        const timeout = setTimeout(() => {
            if (sub) sub.close();
            resolve([]);
        }, 5000);

        sub = pool.subscribeMany(
            DEFAULT_RELAYS,
            {
                kinds: [30078],
                authors: [creatorPubkey],
                "#d": [piecesDTag(collectionId)],
                "#t": ["glassabbey-pieces"],
                limit: 1,
            },
            {
                onevent(event: Event) {
                    clearTimeout(timeout);
                    if (sub) sub.close();

                    try {
                        const pieces = JSON.parse(event.content) as Piece[];
                        resolve(Array.isArray(pieces) ? pieces : []);
                    } catch (err) {
                        console.error("Failed to parse pieces:", err);
                        resolve([]);
                    }
                },
                oneose() {
                    clearTimeout(timeout);
                    if (sub) sub.close();
                    resolve([]); // no event found = empty collection
                },
            }
        );
    });
}

// Replaces the entire pieces list for a collection (same d-tag = relay replaces)
export async function publishPieces(
    collectionId: string,
    pieces: Piece[]
): Promise<void> {
    if (!window.nostr) throw new Error("Nostr extension not found");

    const pool = getPool();

    const signed = await window.nostr.signEvent({
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["d", piecesDTag(collectionId)],
            ["t", "glassabbey-pieces"],
        ],
        content: JSON.stringify(pieces),
    }) as Event;

    const pubs = pool.publish(DEFAULT_RELAYS, signed);
    await Promise.race([Promise.all(pubs), new Promise((r) => setTimeout(r, 5000))]);
}

// fetch existing pieces, append new one, republish
export async function addPiece(
    creatorPubkey: string,
    collectionId: string,
    newPiece: Omit<Piece, "id" | "collectionId">
): Promise<Piece[]> {
    const existing = await fetchPiecesByCollection(creatorPubkey, collectionId);

    const piece: Piece = {
        id: crypto.randomUUID(),
        collectionId,
        ...newPiece,
    };

    const updated = [...existing, piece];
    await publishPieces(collectionId, updated);
    return updated;
}
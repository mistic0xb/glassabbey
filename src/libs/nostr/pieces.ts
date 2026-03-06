import type { Event } from "nostr-tools";
import type { SubCloser } from "nostr-tools/abstract-pool";
import { DEFAULT_RELAYS, getPool } from "./pool";
import type { Piece } from "../../types/types";

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
                        // Inject creatorPubkey into each piece at fetch time
                        const withPubkey = Array.isArray(pieces)
                            ? pieces.map((p) => ({ ...p, creatorPubkey }))
                            : [];
                        resolve(withPubkey);
                    } catch (err) {
                        console.error("Failed to parse pieces:", err);
                        resolve([]);
                    }
                },
                oneose() {
                    clearTimeout(timeout);
                    if (sub) sub.close();
                    resolve([]);
                },
            }
        );
    });
}

// Fetch a single piece by its ID, scanning all collections
// Returns the piece with creatorPubkey if found
export async function fetchPieceById(pieceId: string): Promise<Piece | null> {
    const pool = getPool();
    return new Promise((resolve) => {
        let sub: SubCloser;
        const timeout = setTimeout(() => {
            if (sub) sub.close();
            resolve(null);
        }, 7000);
        sub = pool.subscribeMany(
            DEFAULT_RELAYS,
            {
                kinds: [30078],
                "#t": ["glassabbey-pieces"],
                limit: 200,
            },
            {
                onevent(event: Event) {
                    try {
                        const pieces = JSON.parse(event.content) as Piece[];
                        if (!Array.isArray(pieces)) return;
                        const match = pieces.find((p) => p.id === pieceId);
                        if (match) {
                            clearTimeout(timeout);
                            if (sub) sub.close();
                            resolve({ ...match, creatorPubkey: event.pubkey });
                        }
                    } catch (err) {
                        console.error("Failed to parse pieces:", err);
                    }
                },
                oneose() {
                    clearTimeout(timeout);
                    if (sub) sub.close();
                    resolve(null);
                },
            }
        );
    });
}

export async function publishPieces(
    collectionId: string,
    pieces: Piece[]
): Promise<void> {
    if (!window.nostr) throw new Error("Nostr extension not found");
    const pool = getPool();
    // Strip creatorPubkey before publishing — it's derived at fetch time
    const toPublish = pieces.map(({ creatorPubkey: _, ...rest }) => rest);
    const signed = await window.nostr.signEvent({
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ["d", piecesDTag(collectionId)],
            ["t", "glassabbey-pieces"],
        ],
        content: JSON.stringify(toPublish),
    }) as Event;
    const pubs = pool.publish(DEFAULT_RELAYS, signed);
    await Promise.race([Promise.all(pubs), new Promise((r) => setTimeout(r, 5000))]);
}

export async function addPiece(
    creatorPubkey: string,
    collectionId: string,
    newPiece: Omit<Piece, "id" | "collectionId" | "creatorPubkey">
): Promise<Piece[]> {
    const existing = await fetchPiecesByCollection(creatorPubkey, collectionId);
    const piece: Piece = {
        id: crypto.randomUUID(),
        collectionId,
        creatorPubkey,
        ...newPiece,
    };
    const updated = [...existing, piece];
    await publishPieces(collectionId, updated);
    return updated;
}
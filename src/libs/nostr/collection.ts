import { v4 as uuidv4 } from "uuid";
import type { Event } from "nostr-tools";
import type { SubCloser } from "nostr-tools/abstract-pool";
import { getPool, DEFAULT_RELAYS } from "./pool";
import type { Collection } from "../../types/types";

export async function fetchCollectionsByCreator(
  creatorPubkey: string
): Promise<Collection[]> {
  const pool = getPool();

  return new Promise((resolve) => {
    const collections: Collection[] = [];
    const seen = new Set<string>();
    let sub: SubCloser;

    const timeout = setTimeout(() => {
      if (sub) sub.close();
      resolve(collections);
    }, 5000);

    sub = pool.subscribeMany(
      DEFAULT_RELAYS,
      {
        kinds: [30078],
        authors: [creatorPubkey],
        "#t": ["glassabbey-collection"],
        limit: 100
      },
      {
        onevent(event: Event) {
          const d = event.tags.find((t) => t[0] === "d")?.[1];
          if (!d || seen.has(d)) return;
          seen.add(d)

          try {
            if (!event.content?.trim()) return;
            const data = JSON.parse(event.content) as Omit<Collection, "id">;

            if (!data.name || !data.lightningAddress) return;
            if (data.isDeleted) return;
            collections.push({ id: d, ...data });
          } catch (err) {
            console.error("Failed to parse collection:", err);
          }
        },
        oneose() {
          clearTimeout(timeout);
          if (sub) sub.close();
          resolve(collections);
        },
      }
    );
  });
}

export async function fetchAllCollections(limit = 200): Promise<Collection[]> {
  const pool = getPool();
  return new Promise((resolve) => {
    const collections: Collection[] = [];
    const seen = new Set<string>();
    let sub: SubCloser;

    const timeout = setTimeout(() => {
      if (sub) sub.close();
      resolve(collections);
    }, 7000);

    sub = pool.subscribeMany(
      DEFAULT_RELAYS,
      {
        kinds: [30078],
        "#t": ["glassabbey-collection"],
        limit,
      },
      {
        onevent(event: Event) {
          const d = event.tags.find((t) => t[0] === "d")?.[1];
          if (!d || seen.has(d)) return;
          seen.add(d);
          try {
            const data = JSON.parse(event.content) as Omit<Collection, "id">;
            if (!data.name || !data.lightningAddress) return;
            if (data.isDeleted) return;
            collections.push({ id: d, ...data, pubkey: event.pubkey });
          } catch (err) {
            console.error("Failed to parse collection:", err);
          }
        },
        oneose() {
          clearTimeout(timeout);
          if (sub) sub.close();
          resolve(collections);
        },
      }
    );
  });
}

export async function publishCollection(
  name: string,
  lightningAddress: string,
  location?: string,
  bannerUrl?: string,
  existingId?: string,
): Promise<string> {
  if (!window.nostr) throw new Error("Nostr extension not found");

  const pool = getPool();
  const id = existingId ?? uuidv4();

  const content: Omit<Collection, "id"> = {
    name,
    lightningAddress,
    ...(location ? { location } : {}),
    ...(bannerUrl ? { bannerUrl } : {}),
  };

  const signed = await window.nostr.signEvent({
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", id],
      ["t", "glassabbey-collection"],
    ],
    content: JSON.stringify(content),
  }) as Event;

  const pubs = pool.publish(DEFAULT_RELAYS, signed);
  await Promise.race([Promise.all(pubs), new Promise((r) => setTimeout(r, 5000))]);

  return id;
}

export async function deleteCollection(
  collection: Collection
): Promise<void> {
  if (!window.nostr) throw new Error("Nostr extension not found");
  const pool = getPool();

  const content: Omit<Collection, "id"> = {
    name: collection.name,
    lightningAddress: collection.lightningAddress,
    ...(collection.location ? { location: collection.location } : {}),
    ...(collection.bannerUrl ? { bannerUrl: collection.bannerUrl } : {}),
    isDeleted: true,
  };

  const signed = await window.nostr.signEvent({
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", collection.id],
      ["t", "glassabbey-collection"],
    ],
    content: JSON.stringify(content),
  }) as Event;

  const pubs = pool.publish(DEFAULT_RELAYS, signed);
  await Promise.race([Promise.all(pubs), new Promise((r) => setTimeout(r, 5000))]);
}
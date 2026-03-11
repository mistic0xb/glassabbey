import type { Piece } from "../types/types";

export interface DraftCollection {
  id: string;
  name: string;
  lightningAddress: string;
  location?: string;
  bannerUrl?: string;
  pieces: Piece[];  // ← add this
  createdAt: number;
  isDraft: true;
}

const key = (pubkey: string) => `glassabbey:drafts:${pubkey.slice(0, 8)}`;

export function getDraftCollections(pubkey: string): DraftCollection[] {
  try {
    const raw = localStorage.getItem(key(pubkey));
    return raw ? (JSON.parse(raw) as DraftCollection[]) : [];
  } catch { return []; }
}

export function saveDraftCollection(
  pubkey: string,
  data: Omit<DraftCollection, "isDraft" | "createdAt">
): DraftCollection {
  const drafts = getDraftCollections(pubkey);
  const draft: DraftCollection = { ...data, isDraft: true, createdAt: Date.now() };
  const idx = drafts.findIndex((d) => d.id === draft.id);
  if (idx !== -1) drafts[idx] = draft; else drafts.push(draft);
  localStorage.setItem(key(pubkey), JSON.stringify(drafts));
  return draft;
}

export function deleteDraftCollection(pubkey: string, id: string): void {
  const updated = getDraftCollections(pubkey).filter((d) => d.id !== id);
  localStorage.setItem(key(pubkey), JSON.stringify(updated));
}

export function getDraftById(pubkey: string, id: string): DraftCollection | null {
  return getDraftCollections(pubkey).find((d) => d.id === id) ?? null;
}
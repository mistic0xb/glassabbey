const STORAGE_KEY = "glassabbey_nwc";

interface NWCStore {
  // lightningAddress -> array of NWC strings (most recent first)
  [lightningAddress: string]: string[];
}

function readStore(): NWCStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as NWCStore;
  } catch {
    return {};
  }
}

function writeStore(store: NWCStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    console.error("Failed to write NWC store to localStorage");
  }
}

// Save a NWC string for a lightning address.
// Deduplicates — won't add the same string twice.
export function saveNWC(lightningAddress: string, nwcString: string): void {
  const store = readStore();
  const key = lightningAddress.toLowerCase().trim();
  const existing = store[key] ?? [];
  if (existing.includes(nwcString)) return; // already saved
  store[key] = [nwcString, ...existing]; // most recent first
  writeStore(store);
}

// Get all NWC strings for a lightning address (most recent first).
export function getNWCStrings(lightningAddress: string): string[] {
  const store = readStore();
  return store[lightningAddress.toLowerCase().trim()] ?? [];
}

// Get the most recent NWC string for a lightning address, or null.
export function getLatestNWC(lightningAddress: string): string | null {
  return getNWCStrings(lightningAddress)[0] ?? null;
}

// Remove a specific NWC string for a lightning address.
export function removeNWC(lightningAddress: string, nwcString: string): void {
  const store = readStore();
  const key = lightningAddress.toLowerCase().trim();
  store[key] = (store[key] ?? []).filter((s) => s !== nwcString);
  if (store[key].length === 0) delete store[key];
  writeStore(store);
}

// Remove all NWC strings for a lightning address.
export function clearNWC(lightningAddress: string): void {
  const store = readStore();
  delete store[lightningAddress.toLowerCase().trim()];
  writeStore(store);
}

// Check if any NWC string is stored for a lightning address.
export function hasNWC(lightningAddress: string): boolean {
  return getNWCStrings(lightningAddress).length > 0;
}
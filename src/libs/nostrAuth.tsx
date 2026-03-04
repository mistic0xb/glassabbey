// Extend window type for NIP-07 extensions (nos2x, Alby, keys.band, etc.)
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: object) => Promise<object>;
    };
  }
}

export const hasNostrExtension = (): boolean => !!window.nostr;

export const getPublicKey = async (): Promise<string | null> => {
  try {
    if (!window.nostr) return null;
    return await window.nostr.getPublicKey();
  } catch (e) {
    console.error("getPublicKey failed:", e);
    return null;
  }
};
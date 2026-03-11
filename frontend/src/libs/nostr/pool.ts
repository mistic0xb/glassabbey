import { SimplePool } from "nostr-tools";

let poolInstance: SimplePool | null = null;

export function getPool(): SimplePool {
  if (!poolInstance) {
    poolInstance = new SimplePool();
  }
  return poolInstance;
}

export const DEFAULT_RELAYS = [
    "wss://relay.angor.io/",
    "wss://relay2.angor.io",
    "wss://relay.damus.io",
];
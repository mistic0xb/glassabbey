import { makeZapRequest, validateZapRequest } from "nostr-tools/nip57";
import { generateSecretKey, finalizeEvent } from "nostr-tools";
import type { EventTemplate } from "nostr-tools";
import { getPool, DEFAULT_RELAYS } from "./pool";

export interface ZapResult {
  invoice: string;
  zapRequestId: string;
  paymentHash: string | null; // null if extraction fails — NWC polling degrades gracefully
}

// ─── Bolt11 payment_hash extraction ──────────────────────────────────────────
// bolt11 is bech32-encoded. The payment_hash is tagged field type 1, 52 5-bit words = 32 bytes.
// We decode manually to avoid adding a dependency.

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Decode(str: string): number[] | null {
  str = str.toLowerCase().replace(/^lightning:/i, "");
  const sep = str.lastIndexOf("1");
  if (sep < 1 || sep + 7 > str.length) return null;
  const data: number[] = [];
  // skip checksum (last 6 chars)
  for (let i = sep + 1; i < str.length - 6; i++) {
    const v = BECH32_CHARSET.indexOf(str[i]);
    if (v < 0) return null;
    data.push(v);
  }
  return data;
}

function fiveBitToBytes(data: number[]): number[] {
  const result: number[] = [];
  let acc = 0, bits = 0;
  for (const val of data) {
    acc = (acc << 5) | val;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }
  return result;
}

export function extractPaymentHash(bolt11: string): string | null {
  try {
    const data = bech32Decode(bolt11);
    if (!data) return null;
    // Timestamp occupies the first 7 five-bit words (35 bits)
    let pos = 7;
    while (pos + 3 <= data.length) {
      const type = data[pos];
      const len = (data[pos + 1] << 5) | data[pos + 2];
      pos += 3;
      if (type === 1 && len === 52) {
        // payment_hash: 52 * 5 = 260 bits → first 32 bytes after conversion
        const bytes = fiveBitToBytes(data.slice(pos, pos + len)).slice(0, 32);
        if (bytes.length !== 32) return null;
        return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      pos += len;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Invoice generation ───────────────────────────────────────────────────────

export async function generatePieceInvoice(params: {
  lightningAddress: string;
  amount: number;
  pieceId: string;
  recipientPubkey: string;
  bidderName: string;
}): Promise<ZapResult> {
  const { lightningAddress, amount, pieceId, recipientPubkey, bidderName } = params;
  const [username, domain] = lightningAddress.split("@");
  if (!username || !domain) throw new Error("Invalid lightning address");

  const lnurlUrl = `https://${domain}/.well-known/lnurlp/${username}`;
  const lnurlResponse = await fetch(lnurlUrl);
  if (!lnurlResponse.ok) throw new Error("Lightning address not found");
  const lnurlData = await lnurlResponse.json();
  if (!lnurlData.allowsNostr || !lnurlData.nostrPubkey)
    throw new Error("This lightning address does not support zaps");

  const senderPrivkey = generateSecretKey();
  const zapRequestTemplate: EventTemplate = makeZapRequest({
    pubkey: recipientPubkey,
    amount: amount * 1000,
    relays: DEFAULT_RELAYS,
    comment: `bid-${pieceId}`,
  });
  zapRequestTemplate.tags.push(["piece", pieceId]);
  zapRequestTemplate.tags.push(["bidderName", bidderName]);
  zapRequestTemplate.content = `bid-${pieceId}`;

  const signed = finalizeEvent(zapRequestTemplate, senderPrivkey);
  const validationError = validateZapRequest(JSON.stringify(signed));
  if (validationError) throw new Error(`Invalid zap request: ${validationError}`);

  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set("amount", (amount * 1000).toString());
  callbackUrl.searchParams.set("nostr", JSON.stringify(signed));

  const invoiceResponse = await fetch(callbackUrl.toString());
  if (!invoiceResponse.ok) throw new Error("Failed to get invoice");
  const invoiceData = await invoiceResponse.json();
  if (invoiceData.status === "ERROR")
    throw new Error(invoiceData.reason || "Invoice generation failed");
  if (!invoiceData.pr) throw new Error("No invoice returned");

  const invoice: string = invoiceData.pr;
  const paymentHash = extractPaymentHash(invoice);

  return { invoice, zapRequestId: signed.id, paymentHash };
}

// Zap receipt monitor (kept as fallback)

export function monitorZapPayment(
  recipientPubkey: string,
  zapRequestId: string,
  onConfirmed: () => void,
  since?: number,
): () => void {
  const pool = getPool();
  const seenIds = new Set<string>();

  const sub = pool.subscribeMany(
    DEFAULT_RELAYS,
    {
      kinds: [9735],
      "#p": [recipientPubkey],
      since: since ?? Math.floor(Date.now() / 1000),
    },
    {
      onevent(event) {
        if (seenIds.has(event.id)) return;
        seenIds.add(event.id);
        try {
          const descTag = event.tags.find((t) => t[0] === "description");
          if (!descTag?.[1]) return;
          const zapRequest = JSON.parse(descTag[1]);
          if (zapRequestId && zapRequest.id !== zapRequestId) return;
          onConfirmed();
          if (zapRequestId) sub.close();
        } catch (err) {
          console.error("Failed to parse zap receipt:", err);
        }
      },
    },
  );

  const timeout = setTimeout(() => sub.close(), 600_000);
  return () => {
    clearTimeout(timeout);
    sub.close();
  };
}
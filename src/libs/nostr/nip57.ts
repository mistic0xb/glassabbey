import { makeZapRequest, validateZapRequest } from "nostr-tools/nip57";
import { generateSecretKey, finalizeEvent } from "nostr-tools";
import type { EventTemplate } from "nostr-tools";
import { getPool, DEFAULT_RELAYS } from "./pool";

export interface ZapResult {
  invoice: string;
  zapRequestId: string;
}

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
  if (invoiceData.status === "ERROR") throw new Error(invoiceData.reason || "Invoice generation failed");
  if (!invoiceData.pr) throw new Error("No invoice returned");

  return { invoice: invoiceData.pr, zapRequestId: signed.id };
}

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

          // If scoped to a specific invoice, only fire for that one
          if (zapRequestId && zapRequest.id !== zapRequestId) return;

          onConfirmed();
          // Only close sub if watching a specific invoice — keep alive for "watch all"
          if (zapRequestId) sub.close();
        } catch (err) {
          console.error("Failed to parse zap receipt:", err);
        }
      },
    }
  );

  const timeout = setTimeout(() => sub.close(), 600000);
  return () => {
    clearTimeout(timeout);
    sub.close();
  };
}
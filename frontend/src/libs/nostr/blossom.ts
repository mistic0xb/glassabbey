import { generateSecretKey, finalizeEvent } from "nostr-tools";

const MEDIA_SERVER = "https://mibo.eu.nostria.app";

export async function uploadToBlossom(
  file: File,
  serverBaseUrl = MEDIA_SERVER
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const secretKey = generateSecretKey();
  const authEvent = finalizeEvent(
    {
      kind: 24242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "upload"],
        ["x", hash],
        ["expiration", (Math.floor(Date.now() / 1000) + 600).toString()],
      ],
      content: "Upload File",
    },
    secretKey
  );

  const apiUrl = serverBaseUrl.replace(/\/$/, "") + "/upload";
  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}`,
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": file.size.toString(),
      "X-SHA-256": hash,
      "X-Content-Type": file.type || "application/octet-stream",
      "X-Content-Length": file.size.toString(),
    },
    body: file,
  });

  if (!res.ok) {
    const reason = res.headers.get("x-reason") ?? res.status.toString();
    const body = await res.text();
    throw new Error(`Upload failed: ${reason} (${res.status})\n${body}`);
  }

  const json = await res.json();
  if (!json?.url) throw new Error("No URL returned from server");
  return json.url;
}
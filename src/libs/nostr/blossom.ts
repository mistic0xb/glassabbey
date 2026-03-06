export async function uploadToBlossom(
  file: File,
  serverBaseUrl = "https://blossom.band"
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  const apiUrl = serverBaseUrl.replace(/\/$/, "") + "/upload";

  const res = await fetch(apiUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "Content-Length": file.size.toString(),
      "X-SHA-256": hash,
    },
    body: file,
  });

  if (!res.ok) {
    const reason = res.headers.get("X-Reason") ?? res.status.toString();
    throw new Error(`Upload failed: ${reason}`);
  }

  const json = await res.json();
  const url = json?.url;
  if (!url) throw new Error("No URL returned from server");
  return url;
}
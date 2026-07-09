// Client helper for the Digital BOL flow (api/submit-bol.js).

// SHA-256 hash of a signature canvas's data URL, computed entirely in the
// browser via the native Web Crypto API (no library) — the raw signature
// image never leaves this function, only the hash returned here does.
export async function hashDataUrl(dataUrl) {
  const bytes = new TextEncoder().encode(dataUrl);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function submitBol(accessToken, payload) {
  const res = await fetch("/api/submit-bol", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to submit BOL");
  return data;
}

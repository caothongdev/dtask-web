// API key generation + hashing. Raw keys are returned exactly once at
// creation; only SHA-256 digests are ever persisted or compared.
export function genKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hashApiKey(raw: string): string {
  const h = new Bun.CryptoHasher("sha256");
  h.update(raw);
  return h.digest("hex");
}

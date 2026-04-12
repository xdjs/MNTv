// Shared Apple Music Developer Token generation.
// Import as: import { getAppleDeveloperToken } from "../_shared/apple-token.ts";
//
// Generates an ES256-signed JWT using the Apple Music private key (.p8 file).
// Max JWT lifetime is 180 days per Apple's requirements. Cached in-memory with
// 1-day buffer so we regenerate well before expiry. Each Deno isolate caches
// independently — cold starts re-generate (fast local CPU operation, no network).
//
// Required secrets:
//   APPLE_MUSIC_KEY_ID     — 10-char Key ID from Apple Developer portal
//   APPLE_MUSIC_TEAM_ID    — 10-char Team ID
//   APPLE_MUSIC_PRIVATE_KEY — Contents of the .p8 file (PEM format)
//
// Key rotation: if APPLE_MUSIC_PRIVATE_KEY is rotated (e.g. due to compromise),
// warm Deno isolates will continue serving the old cached JWT until they cold-
// start. To force an immediate rotation across all isolates, redeploy the
// edge function after setting the new secret — that replaces all workers.

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const MAX_LIFETIME_SEC = 180 * 24 * 60 * 60;  // 180 days (Apple's max)
const BUFFER_SEC = 24 * 60 * 60;              // 1-day buffer

/** Get an Apple Developer Token (ES256 JWT). Cached in-memory, regenerated well before expiry. */
export async function getAppleDeveloperToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const keyId = Deno.env.get("APPLE_MUSIC_KEY_ID");
  const teamId = Deno.env.get("APPLE_MUSIC_TEAM_ID");
  const privateKeyPem = Deno.env.get("APPLE_MUSIC_PRIVATE_KEY");

  if (!keyId || !teamId || !privateKeyPem) {
    throw new Error("Missing Apple Music credentials (APPLE_MUSIC_KEY_ID, APPLE_MUSIC_TEAM_ID, APPLE_MUSIC_PRIVATE_KEY)");
  }

  const cryptoKey = await importPrivateKey(privateKeyPem);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: teamId, iat: now, exp: now + MAX_LIFETIME_SEC };

  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  // Web Crypto outputs ECDSA signatures in IEEE P1363 format (raw r||s),
  // which is exactly what JWT ES256 requires.
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  const token = `${signingInput}.${signatureB64}`;

  cachedToken = token;
  tokenExpiresAt = Date.now() + (MAX_LIFETIME_SEC - BUFFER_SEC) * 1000;
  return token;
}

/** Clear cached token (for testing or forced refresh). */
export function clearAppleDeveloperToken(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

// ── Helpers ────────────────────────────────────────────────────────────

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers/footers and whitespace, decode base64 to DER bytes.
  // Global regex so multi-line or duplicated markers are handled correctly.
  // Apple provides PKCS8-format keys (-----BEGIN PRIVATE KEY-----); we reject
  // EC-specific PEM formats early with a clear error so users know to re-export.
  if (pem.includes("-----BEGIN EC PRIVATE KEY-----")) {
    throw new Error("Apple Music private key must be in PKCS8 format, not EC format");
  }
  const pemBody = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");
  const binary = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    "pkcs8",
    binary,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

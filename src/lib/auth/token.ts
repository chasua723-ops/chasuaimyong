/**
 * Signed auth-cookie token.
 *
 * The cookie used to be the literal string 'ok', which anyone could forge to
 * skip the PIN gate (and spend the owner's Anthropic credits). Instead we store
 * an HMAC-SHA256 of a fixed message keyed by the PIN, which middleware can
 * verify with no database round-trip.
 *
 * Uses Web Crypto (globalThis.crypto.subtle) because Next.js middleware runs on
 * the Edge runtime, where node:crypto is unavailable.
 */

const AUTH_MESSAGE = 'imyong-auth-v1';

async function hmacHex(pin: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function signAuthToken(pin: string): Promise<string> {
  return hmacHex(pin, AUTH_MESSAGE);
}

export async function verifyAuthToken(token: string, pin: string): Promise<boolean> {
  if (!token || !pin) return false;
  const expected = await signAuthToken(pin);
  return token === expected;
}

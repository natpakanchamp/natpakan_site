/**
 * Minimal RS256 JWT sign/verify on WebCrypto (crypto.subtle) only.
 *
 * jose's key-type check rejects workerd's CryptoKey objects in this build
 * ("Key for the RS256 algorithm must be one of type CryptoKey ... Received an
 * instance of CryptoKey"), so the Worker signs and verifies directly with
 * crypto.subtle, which every runtime here (workerd, Node 22, browsers) has.
 */
const ALG = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } as const;
const encoder = new TextEncoder();

export type JwtPayload = Record<string, unknown>;

export function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(segment: string): Record<string, unknown> {
  const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JWT segment is not an object');
  return value as Record<string, unknown>;
}

export async function importPkcs8Pem(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return crypto.subtle.importKey('pkcs8', base64UrlDecode(body.replace(/\+/g, '-').replace(/\//g, '_')), ALG, false, ['sign']);
}

export async function importRsaJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e }, ALG, false, ['verify']);
}

export async function signRs256(payload: JwtPayload, key: CryptoKey, kid?: string): Promise<string> {
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...(kid ? { kid } : {}) }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(ALG, key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  /** Seconds of clock skew tolerated for exp/nbf/iat. */
  clockToleranceS?: number;
  now?: () => number;
}

export type KeyResolver = (kid: string | undefined) => Promise<CryptoKey | null>;

/** Verifies signature (RS256 only), issuer, audience and time claims. Throws on any failure. */
export async function verifyRs256(token: string, getKey: KeyResolver, options: VerifyOptions): Promise<JwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !p)) throw new Error('Malformed JWT');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodeJson(headerB64);
  if (header.alg !== 'RS256') throw new Error('Unexpected JWT alg');

  const key = await getKey(typeof header.kid === 'string' ? header.kid : undefined);
  if (!key) throw new Error('Unknown JWT key');

  const valid = await crypto.subtle.verify(ALG, key, base64UrlDecode(signatureB64), encoder.encode(`${headerB64}.${payloadB64}`));
  if (!valid) throw new Error('Bad JWT signature');

  const payload = decodeJson(payloadB64);
  const nowS = Math.floor((options.now ?? Date.now)() / 1000);
  const skew = options.clockToleranceS ?? 60;
  if (payload.iss !== options.issuer) throw new Error('Bad JWT issuer');
  const aud = payload.aud;
  if (!(aud === options.audience || (Array.isArray(aud) && aud.includes(options.audience)))) throw new Error('Bad JWT audience');
  if (typeof payload.exp !== 'number' || payload.exp + skew <= nowS) throw new Error('JWT expired');
  if (typeof payload.nbf === 'number' && payload.nbf - skew > nowS) throw new Error('JWT not yet valid');
  return payload;
}

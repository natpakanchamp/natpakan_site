import { getGoogleAccessToken, parseServiceAccount, type ServiceAccount } from './google-auth';

const FIREBASE_PROJECT = 'natpakan-site';
const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

export const FIRESTORE_DOC_ROOT = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOC_ROOT}`;

let serviceAccount: ServiceAccount | null = null;
let warnedUnauthenticated = false;

/**
 * Called once per request by src/middleware.ts with the Cloudflare env.
 * With FIREBASE_SERVICE_ACCOUNT set, every call is authenticated and
 * firestore.rules can deny all public access.
 */
export function configureFirestore(env: Record<string, unknown>): void {
  serviceAccount = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
}

async function headers(): Promise<Record<string, string>> {
  const base = { 'Content-Type': 'application/json' };
  if (!serviceAccount) {
    if (!warnedUnauthenticated) {
      console.warn('[firestore] FIREBASE_SERVICE_ACCOUNT not set; calling Firestore unauthenticated');
      warnedUnauthenticated = true;
    }
    return base;
  }
  return { ...base, Authorization: `Bearer ${await getGoogleAccessToken(serviceAccount, DATASTORE_SCOPE)}` };
}

async function logIfFailed(res: Response, op: string): Promise<void> {
  if (!res.ok) console.error(`[firestore] ${op} failed (${res.status})`);
}

export async function fsGet(collection: string, docId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}`, { headers: await headers() });
  if (res.status !== 404) await logIfFailed(res, `get ${collection}`);
  if (!res.ok) return null;
  const data = await res.json() as { fields?: Record<string, unknown> };
  return data.fields || null;
}

export async function fsSet(collection: string, docId: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    headers: await headers(),
    body: JSON.stringify({ fields }),
  });
  await logIfFailed(res, `set ${collection}`);
}

export async function fsIncrement(collection: string, docId: string, field: string): Promise<void> {
  const res = await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: await headers(),
    body: JSON.stringify({
      writes: [{
        transform: {
          document: `${FIRESTORE_DOC_ROOT}/${collection}/${docId}`,
          fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }],
        },
      }],
    }),
  });
  await logIfFailed(res, `increment ${collection}`);
}

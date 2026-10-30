const FIREBASE_PROJECT = 'natpakan-site';

export const FIRESTORE_DOC_ROOT = `projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const BASE = `https://firestore.googleapis.com/v1/${FIRESTORE_DOC_ROOT}`;

export async function fsGet(collection: string, docId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}`);
  if (!res.ok) return null;
  const data = await res.json() as { fields?: Record<string, unknown> };
  return data.fields || null;
}

export async function fsSet(collection: string, docId: string, fields: Record<string, unknown>): Promise<void> {
  await fetch(`${BASE}/${collection}/${encodeURIComponent(docId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

export async function fsIncrement(collection: string, docId: string, field: string): Promise<void> {
  await fetch(`${BASE}:commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: [{
        transform: {
          document: `${FIRESTORE_DOC_ROOT}/${collection}/${docId}`,
          fieldTransforms: [{ fieldPath: field, increment: { integerValue: '1' } }],
        },
      }],
    }),
  });
}

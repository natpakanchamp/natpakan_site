import type { APIRoute } from 'astro';

export const prerender = false;

const FIREBASE_PROJECT = 'natpakan-site';
const GEMINI_MODEL = 'gemini-2.5-flash';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;

async function fsGet(collection: string, docId: string) {
  const res = await fetch(`${BASE}/${collection}/${docId}`);
  if (!res.ok) return null;
  const data = await res.json() as { fields?: Record<string, unknown> };
  return data.fields || null;
}

async function fsSet(collection: string, docId: string, fields: Record<string, unknown>) {
  await fetch(`${BASE}/${collection}/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

async function callGemini(apiKey: string, systemText: string, turns: unknown[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemText }] },
      contents: turns,
      generationConfig: { maxOutputTokens: 4096, temperature: 1.0, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.find((p) => p.text && !p.thought)?.text?.trim() || '';
}

function systemPrompt({ title, isNotebook }: { title: string; isNotebook: boolean }) {
  if (isNotebook) {
    return `คุณเป็นผู้ช่วยอธิบายเนื้อหาวิทยาศาสตร์และคณิตศาสตร์ภาษาไทย ตอบกระชับและชัดเจน ใช้ภาษาไทยเป็นหลัก อธิบายด้วยตัวอย่างง่ายๆ เมื่อเป็นไปได้ บทความปัจจุบันคือ "${title}"`;
  }
  return `คุณเป็นผู้ช่วยสรุปและตอบคำถามเกี่ยวกับบล็อกโพสต์ภาษาไทย ตอบกระชับและชัดเจน บทความปัจจุบันคือ "${title}"`;
}

function buildTurns(mode: string, context: Record<string, string>, messages: { role: string; content: string }[]) {
  if (mode === 'summary') {
    return [{ role: 'user', parts: [{ text: `สรุปเนื้อหาบทความนี้ให้กระชับและเข้าใจง่าย:\n\n${context.articleText}` }] }];
  }
  if (mode === 'explain') {
    const heading = context.sectionHeading ? `ในส่วน "${context.sectionHeading}"\n\n` : '';
    const surrounding = context.surroundingText ? `บริบทโดยรอบ:\n${context.surroundingText}\n\n` : '';
    return [{ role: 'user', parts: [{ text: `${heading}${surrounding}ช่วยอธิบายส่วนนี้ให้ละเอียดขึ้น:\n"${context.selectedText}"` }] }];
  }
  const ctxMsg = { role: 'user', parts: [{ text: `บริบทบทความ:\n${context.articleText.slice(0, 2000)}` }] };
  const ctxAck = { role: 'model', parts: [{ text: 'รับทราบ ฉันพร้อมตอบคำถามเกี่ยวกับบทความนี้แล้ว' }] };
  const history = (messages || []).map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  return [ctxMsg, ctxAck, ...history];
}

export const OPTIONS: APIRoute = () => new Response(null, { status: 204, headers: CORS });

export const POST: APIRoute = async ({ request, locals }) => {
  const apiKey = (locals.runtime as { env: { GEMINI_API_KEY?: string } })?.env?.GEMINI_API_KEY;
  if (!apiKey) return json(500, { error: 'GEMINI_API_KEY not configured' });

  let payload: { mode?: string; post?: { slug?: string; title: string; isNotebook: boolean }; context?: Record<string, string>; messages?: { role: string; content: string }[] };
  try { payload = await request.json(); } catch { return json(400, { error: 'Invalid JSON' }); }

  const { mode, post, context: ctx, messages } = payload;
  if (!mode || !post || !ctx) return json(400, { error: 'Missing required fields: mode, post, context' });
  if (!['summary', 'explain', 'chat'].includes(mode)) return json(400, { error: 'Invalid mode' });

  try {
    if (mode === 'summary' && post.slug) {
      const cached = await fsGet('aiSummaries', post.slug) as Record<string, { stringValue?: string; integerValue?: string }> | null;
      if (cached) {
        const ts = Number(cached.generatedAt?.integerValue || 0);
        if (Date.now() - ts < CACHE_TTL_MS) return json(200, { reply: cached.summary?.stringValue, cached: true });
      }
    }

    const reply = await callGemini(apiKey, systemPrompt(post), buildTurns(mode, ctx, messages || []));

    if (mode === 'summary' && post.slug && reply) {
      await fsSet('aiSummaries', post.slug, {
        summary: { stringValue: reply },
        generatedAt: { integerValue: String(Date.now()) },
        title: { stringValue: post.title },
      });
    }

    return json(200, { reply });
  } catch (err) {
    console.error('[chat]', (err as Error).message);
    return json(500, { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
};

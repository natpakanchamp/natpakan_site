'use strict';

const FIREBASE_PROJECT = 'natpakan-site';
const GEMINI_MODEL = 'gemini-2.0-flash';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

// ── Firestore REST (public read/write rules same as pageViews collection) ──

async function fsGet(collection, docId) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${collection}/${docId}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.fields || null;
}

async function fsSet(collection, docId, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/${collection}/${docId}`;
  await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

// ── Gemini REST ──

async function callGemini(systemText, turns) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const body = {
    system_instruction: { parts: [{ text: systemText }] },
    contents: turns,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

// ── Prompt builders ──

function systemPrompt({ title, isNotebook }) {
  if (isNotebook) {
    return (
      `คุณเป็นผู้ช่วยอธิบายเนื้อหาวิทยาศาสตร์และคณิตศาสตร์ภาษาไทย ` +
      `ตอบกระชับและชัดเจน ใช้ภาษาไทยเป็นหลัก อธิบายด้วยตัวอย่างง่ายๆ เมื่อเป็นไปได้ ` +
      `บทความปัจจุบันคือ "${title}"`
    );
  }
  return (
    `คุณเป็นผู้ช่วยสรุปและตอบคำถามเกี่ยวกับบล็อกโพสต์ภาษาไทย ` +
    `ตอบกระชับและชัดเจน บทความปัจจุบันคือ "${title}"`
  );
}

function buildTurns(mode, context, messages) {
  if (mode === 'summary') {
    return [{ role: 'user', parts: [{ text: `สรุปเนื้อหาบทความนี้ให้กระชับและเข้าใจง่าย:\n\n${context.articleText}` }] }];
  }

  if (mode === 'explain') {
    const heading = context.sectionHeading ? `ในส่วน "${context.sectionHeading}"\n\n` : '';
    const surrounding = context.surroundingText ? `บริบทโดยรอบ:\n${context.surroundingText}\n\n` : '';
    return [{
      role: 'user',
      parts: [{ text: `${heading}${surrounding}ช่วยอธิบายส่วนนี้ให้ละเอียดขึ้น:\n"${context.selectedText}"` }],
    }];
  }

  // chat: multi-turn with article context injected as first user message
  const ctxMsg = { role: 'user', parts: [{ text: `บริบทบทความ:\n${context.articleText.slice(0, 2000)}` }] };
  const ctxAck = { role: 'model', parts: [{ text: 'รับทราบ ฉันพร้อมตอบคำถามเกี่ยวกับบทความนี้แล้ว' }] };
  const history = (messages || []).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
  return [ctxMsg, ctxAck, ...history];
}

// ── Handler ──

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const { mode, post, context, messages } = payload;

  if (!mode || !post || !context) {
    return json(400, { error: 'Missing required fields: mode, post, context' });
  }

  if (!['summary', 'explain', 'chat'].includes(mode)) {
    return json(400, { error: 'Invalid mode' });
  }

  try {
    // Summary: check Firestore cache
    if (mode === 'summary' && post.slug) {
      const cached = await fsGet('aiSummaries', post.slug);
      if (cached) {
        const ts = Number(cached.generatedAt?.integerValue || 0);
        if (Date.now() - ts < CACHE_TTL_MS) {
          return json(200, { reply: cached.summary?.stringValue, cached: true });
        }
      }
    }

    const sys = systemPrompt(post);
    const turns = buildTurns(mode, context, messages);
    const reply = await callGemini(sys, turns);

    // Cache summary
    if (mode === 'summary' && post.slug && reply) {
      await fsSet('aiSummaries', post.slug, {
        summary: { stringValue: reply },
        generatedAt: { integerValue: String(Date.now()) },
        title: { stringValue: post.title },
      });
    }

    return json(200, { reply });
  } catch (err) {
    console.error('[chat function]', err.message);
    return json(500, { error: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
  }
};

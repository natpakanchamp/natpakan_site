#!/usr/bin/env node
/**
 * Copy images/videos from public/assets to the R2 media bucket and point the
 * posts at the R2 URLs.
 *
 *   node --env-file=.dev.vars scripts/migrate-assets-to-r2.mjs          # dry run: list what would change
 *   node --env-file=.dev.vars scripts/migrate-assets-to-r2.mjs --apply  # upload + rewrite posts
 *
 * Safe by design:
 * - Uploads keep the same relative path (public/assets/x.jpg → <bucket>/assets/x.jpg).
 * - Only src/content/posts/*.md references are rewritten; CSS/JS/HTML keep using local files.
 * - Nothing is deleted. Once the deployed site looks right, remove the files from git yourself.
 *   (Shrinking .git itself would need a history rewrite — a separate, deliberate step.)
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AwsClient } from 'aws4fetch';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS_DIR = path.join(ROOT, 'public', 'assets');
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
};
const REQUIRED_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'MEDIA_PUBLIC_BASE_URL'];

const apply = process.argv.includes('--apply');

function requireEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env: ${missing.join(', ')} (see .env.example)`);
    process.exit(1);
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  }));
  return files.flat();
}

function encodeKey(key) {
  return key.split('/').map(encodeURIComponent).join('/');
}

async function upload(client, file, key) {
  const { R2_ACCOUNT_ID, R2_BUCKET } = process.env;
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${encodeKey(key)}`;
  const res = await client.fetch(url, {
    method: 'PUT',
    body: await readFile(file),
    headers: { 'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] },
  });
  if (!res.ok) throw new Error(`Upload failed for ${key}: ${res.status} ${await res.text()}`);
}

async function main() {
  requireEnv();
  const base = process.env.MEDIA_PUBLIC_BASE_URL.replace(/\/+$/, '');

  const media = (await walk(ASSETS_DIR)).filter((f) => CONTENT_TYPES[path.extname(f).toLowerCase()]);
  const keys = media.map((f) => path.relative(path.join(ROOT, 'public'), f).split(path.sep).join('/'));
  const totalBytes = (await Promise.all(media.map((f) => stat(f)))).reduce((n, s) => n + s.size, 0);
  console.log(`${media.length} media files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);

  const posts = (await readdir(POSTS_DIR)).filter((n) => n.endsWith('.md'));
  const rewrites = [];
  for (const name of posts) {
    const file = path.join(POSTS_DIR, name);
    const original = await readFile(file, 'utf8');
    let updated = original;
    for (const key of keys) {
      // Only exact /assets/... references in src/href attributes or markdown links.
      updated = updated.split(`"/${key}"`).join(`"${base}/${encodeKey(key)}"`);
      updated = updated.split(`(/${key})`).join(`(${base}/${encodeKey(key)})`);
    }
    if (updated !== original) rewrites.push({ name, file, updated });
  }
  console.log(`${rewrites.length} posts reference migrated media:`);
  for (const r of rewrites) console.log(`  - ${r.name}`);

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to upload and rewrite.');
    return;
  }

  const client = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    service: 's3',
    region: 'auto',
  });
  for (const [i, file] of media.entries()) {
    await upload(client, file, keys[i]);
    console.log(`  ↑ ${i + 1}/${media.length} ${keys[i]}`);
  }
  // Rewrite only after every upload succeeded, so posts never point at missing files.
  for (const r of rewrites) await writeFile(r.file, r.updated);
  console.log(`\nDone. Uploaded ${media.length} files and rewrote ${rewrites.length} posts. Local files were kept.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

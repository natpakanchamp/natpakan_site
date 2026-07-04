import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import sharp from 'sharp';

const ASSETS_DIR = 'public/assets';

const FORMAT_BY_EXT = {
  '.jpg': { format: 'jpeg', options: { quality: 90, mozjpeg: true } },
  '.jpeg': { format: 'jpeg', options: { quality: 90, mozjpeg: true } },
  '.png': { format: 'png', options: {} },
  '.webp': { format: 'webp', options: { quality: 90 } },
  '.avif': { format: 'avif', options: { quality: 90 } },
};

async function findImages(dir) {
  const entries = await readdir(dir, { recursive: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const ext = extname(entry).toLowerCase();
    if (!FORMAT_BY_EXT[ext]) continue;
    if ((await stat(fullPath)).isFile()) files.push(fullPath);
  }
  return files;
}

async function stripImage(filePath) {
  const ext = extname(filePath).toLowerCase();
  const { format, options } = FORMAT_BY_EXT[ext];

  const input = await readFile(filePath);
  // .rotate() bakes in the EXIF orientation before metadata (including any
  // HDR gain map / Apple HDR APP2 segment) is dropped by the re-encode.
  const output = await sharp(input).rotate().toFormat(format, options).toBuffer();

  await writeFile(filePath, output);
  return { before: input.length, after: output.length };
}

const files = await findImages(ASSETS_DIR);
console.log(`Found ${files.length} image(s) under ${ASSETS_DIR}`);

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
  try {
    const { before, after } = await stripImage(file);
    totalBefore += before;
    totalAfter += after;
    console.log(`✓ ${file} (${(before / 1024).toFixed(0)}kb → ${(after / 1024).toFixed(0)}kb)`);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
  }
}

console.log(
  `\nDone. Total ${(totalBefore / 1024 / 1024).toFixed(2)}MB → ${(totalAfter / 1024 / 1024).toFixed(2)}MB`
);

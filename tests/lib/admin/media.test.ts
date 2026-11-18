import { describe, expect, test } from 'vitest';
import { buildObjectKey, mediaSnippet, presignUpload, validateUpload } from '@/lib/admin/media';

const r2 = {
  accountId: 'acc123',
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
  bucket: 'site-media',
  publicBaseUrl: 'https://media.example.com',
};

describe('validateUpload', () => {
  test('accepts a jpeg under the image limit', () => {
    expect(validateUpload({ filename: 'a.jpg', contentType: 'image/jpeg', size: 5_000_000 })).toEqual({ ok: true, kind: 'image' });
  });

  test('accepts an mp4 video', () => {
    expect(validateUpload({ filename: 'clip.mp4', contentType: 'video/mp4', size: 200_000_000 })).toEqual({ ok: true, kind: 'video' });
  });

  test('rejects types that could run script, like svg and html', () => {
    expect(validateUpload({ filename: 'x.svg', contentType: 'image/svg+xml', size: 10 }).ok).toBe(false);
    expect(validateUpload({ filename: 'x.html', contentType: 'text/html', size: 10 }).ok).toBe(false);
  });

  test('rejects an image over 25MB and a video over 500MB', () => {
    expect(validateUpload({ filename: 'a.png', contentType: 'image/png', size: 26 * 1024 * 1024 }).ok).toBe(false);
    expect(validateUpload({ filename: 'a.mp4', contentType: 'video/mp4', size: 501 * 1024 * 1024 }).ok).toBe(false);
  });

  test('rejects empty or non-integer sizes', () => {
    expect(validateUpload({ filename: 'a.png', contentType: 'image/png', size: 0 }).ok).toBe(false);
    expect(validateUpload({ filename: 'a.png', contentType: 'image/png', size: 1.5 }).ok).toBe(false);
  });
});

describe('buildObjectKey', () => {
  test('puts files under posts/YYYY/MM with a random prefix and a safe name', () => {
    const key = buildObjectKey('รูป ค่าย CP (1).JPG', 'image/jpeg', new Date('2026-11-18T00:00:00Z'), 'abcd1234');
    expect(key).toBe('posts/2026/11/abcd1234-cp-1.jpg');
  });

  test('falls back to "file" and derives the extension from the content type', () => {
    const key = buildObjectKey('วิดีโอ', 'video/mp4', new Date('2026-01-05T00:00:00Z'), 'zz');
    expect(key).toBe('posts/2026/01/zz-file.mp4');
  });
});

describe('presignUpload', () => {
  test('returns a signed PUT URL for the R2 S3 endpoint and the public URL', async () => {
    const result = await presignUpload(r2, 'posts/2026/11/abc-a.jpg', 'image/jpeg');
    const url = new URL(result.uploadUrl);

    expect(url.origin).toBe('https://acc123.r2.cloudflarestorage.com');
    expect(url.pathname).toBe('/site-media/posts/2026/11/abc-a.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-type');
    expect(result.uploadUrl).not.toContain('SECRET');
    expect(result.publicUrl).toBe('https://media.example.com/posts/2026/11/abc-a.jpg');
  });
});

describe('mediaSnippet', () => {
  test('image snippet matches the existing post markup and escapes alt text', () => {
    expect(mediaSnippet('image', 'https://m/a.webp', 'ค่าย "CP" <1>')).toBe(
      '<img src="https://m/a.webp" alt="ค่าย &quot;CP&quot; &lt;1&gt;" loading="lazy">',
    );
  });

  test('video snippet matches the autoplay loop style used in older posts', () => {
    expect(mediaSnippet('video', 'https://m/a.mp4', '')).toBe(
      '<video style="display: block; margin: 0 auto; width: 100%; height: auto;" autoplay loop muted playsinline>\n' +
        '  <source src="https://m/a.mp4" type="video/mp4">\n' +
        '</video>',
    );
  });

  test('video snippet uses the uploaded content type', () => {
    expect(mediaSnippet('video', 'https://m/a.webm', '', 'video/webm')).toContain('type="video/webm"');
  });
});

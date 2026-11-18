import { describe, expect, test } from 'vitest';
import {
  isValidPostFileName,
  parsePost,
  postFileName,
  postInputSchema,
  serializePost,
  slugify,
} from '@/lib/admin/post-format';

const baseInput = {
  title: 'CP Scholarship Bootcamp 2026',
  date: '2026-11-17',
  time: '16:00',
  slug: 'cp-scholarship-bootcamp-2026',
  categories: ['activities'],
  draft: false,
  body: 'สวัสดีครับ\n\n<img src="https://media.example.com/a.webp" alt="">',
};

describe('slugify', () => {
  test('lowercases and hyphenates latin titles', () => {
    expect(slugify('CP Scholarship  Bootcamp 2026!')).toBe('cp-scholarship-bootcamp-2026');
  });

  test('strips diacritics', () => {
    expect(slugify('Café Déjà Vu')).toBe('cafe-deja-vu');
  });

  test('returns empty string for Thai-only titles so the caller must ask for a slug', () => {
    expect(slugify('ค่ายฤดูหนาว')).toBe('');
  });

  test('caps length at 80 characters without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(79) + ' bcd');
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('postInputSchema', () => {
  test('accepts a valid post', () => {
    expect(postInputSchema.safeParse(baseInput).success).toBe(true);
  });

  test('rejects an unknown category', () => {
    expect(postInputSchema.safeParse({ ...baseInput, categories: ['hacks'] }).success).toBe(false);
  });

  test('rejects a slug with path characters', () => {
    expect(postInputSchema.safeParse({ ...baseInput, slug: '../etc' }).success).toBe(false);
  });

  test('rejects an impossible date format', () => {
    expect(postInputSchema.safeParse({ ...baseInput, date: '17/11/2026' }).success).toBe(false);
  });

  test('requires at least one category', () => {
    expect(postInputSchema.safeParse({ ...baseInput, categories: [] }).success).toBe(false);
  });
});

describe('postFileName / isValidPostFileName', () => {
  test('builds the dated file name used by the URL router', () => {
    expect(postFileName('2026-11-17', 'cp-scholarship-bootcamp-2026')).toBe(
      '2026-11-17-cp-scholarship-bootcamp-2026.md',
    );
  });

  test('accepts existing legacy names, including spaces and capitals', () => {
    expect(isValidPostFileName('2025-10-28-CP-scholarship-Bootcamp-2025.md')).toBe(true);
    expect(isValidPostFileName('2024-09-07-the-dormgeist copy 2.md')).toBe(true);
  });

  test('rejects traversal, nested paths and non-markdown files', () => {
    expect(isValidPostFileName('../secrets.md')).toBe(false);
    expect(isValidPostFileName('a/b.md')).toBe(false);
    expect(isValidPostFileName('post.txt')).toBe(false);
    expect(isValidPostFileName('.md')).toBe(false);
  });
});

describe('serializePost / parsePost', () => {
  test('round-trips the editable fields', () => {
    const md = serializePost(postInputSchema.parse(baseInput));
    const parsed = parsePost(md);
    expect(parsed.fields).toMatchObject({
      title: baseInput.title,
      date: '2026-11-17',
      time: '16:00',
      categories: ['activities'],
      draft: false,
    });
    expect(parsed.body).toBe(baseInput.body);
  });

  test('writes the frontmatter conventions used by existing posts', () => {
    const md = serializePost(postInputSchema.parse(baseInput));
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('date: 2026-11-17 16:00:00 +0700');
    expect(md).toContain('page_css: /assets/css/style.css');
  });

  test('keeps frontmatter keys the editor does not know about (e.g. graph)', () => {
    const original = [
      '---',
      'title: "Old"',
      'date: 2026-06-23 10:00:00 +0700',
      'categories:',
      '  - notes',
      'graph:',
      '  nodes:',
      '    - id: a',
      '      label: A',
      '  edges: []',
      '---',
      '',
      'body',
    ].join('\n');
    const { frontmatter } = parsePost(original);
    const md = serializePost(postInputSchema.parse({ ...baseInput, categories: ['notes'] }), frontmatter);
    const reparsed = parsePost(md);
    expect(reparsed.frontmatter.graph).toEqual({ nodes: [{ id: 'a', label: 'A' }], edges: [] });
    expect(reparsed.fields.title).toBe(baseInput.title);
  });

  test('parses legacy posts with two-space title indentation and no draft flag', () => {
    const legacy = '---\ntitle:  "CP Scholarship Bootcamp 2025"\ndate: 2025-10-28 16:00:00 +0700\ncategories: \n    - activities\n---\n\nhello';
    const parsed = parsePost(legacy);
    expect(parsed.fields).toMatchObject({
      title: 'CP Scholarship Bootcamp 2025',
      date: '2025-10-28',
      time: '16:00',
      draft: false,
    });
    expect(parsed.body).toBe('hello');
  });

  test('removes the draft key entirely when publishing', () => {
    const md = serializePost(postInputSchema.parse({ ...baseInput, draft: false }), { draft: true });
    expect(md).not.toMatch(/^draft:/m);
  });

  test('throws a clear error when the file has no frontmatter', () => {
    expect(() => parsePost('just text')).toThrow(/frontmatter/i);
  });
});

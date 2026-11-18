import { z } from 'zod';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { MAX_SLUG_LENGTH, SLUG_PATTERN } from './slug';

export { slugify } from './slug';

/** Categories already used by posts; the URL router maps `notes` to /notes/, everything else to /activities/. */
export const CATEGORIES = ['activities', 'competitions', 'notes', 'projects'] as const;

const MAX_BODY_LENGTH = 300_000;
const TIMEZONE_OFFSET = '+0700';
const DEFAULT_PAGE_CSS = '/assets/css/style.css';
const DEFAULT_PAGE_JS = '/assets/js/main.js';

export const postInputSchema = z.object({
  title: z.string().trim().min(1, 'ต้องมีชื่อโพสต์').max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'เวลาต้องเป็นรูปแบบ HH:MM').default('12:00'),
  slug: z.string().max(MAX_SLUG_LENGTH).regex(SLUG_PATTERN, 'slug ใช้ได้แค่ a-z, 0-9 และ -'),
  // Bounded so an oversized array is rejected before zod walks it (GHSA-mrhx-c7xc-m3w5).
  categories: z.array(z.enum(CATEGORIES)).min(1, 'เลือกอย่างน้อย 1 หมวด').max(CATEGORIES.length),
  excerpt: z.string().trim().max(300).optional(),
  draft: z.boolean().default(false),
  body: z.string().max(MAX_BODY_LENGTH),
});

export type PostInput = z.infer<typeof postInputSchema>;
export type Frontmatter = Record<string, unknown>;

export interface ParsedPost {
  frontmatter: Frontmatter;
  fields: Omit<PostInput, 'slug' | 'body'>;
  body: string;
}

export function postFileName(date: string, slug: string): string {
  return `${date}-${slug}.md`;
}

/** A bare file name inside src/content/posts — no directories, no traversal. */
export function isValidPostFileName(name: string): boolean {
  return /^[\w][\w .-]*\.md$/.test(name) && !name.includes('..');
}

function formatDate(date: string, time: string): string {
  return `${date} ${time}:00 ${TIMEZONE_OFFSET}`;
}

/**
 * Build the markdown file. Keys in `existing` that the editor does not manage
 * (graph, author, permalink, …) are carried over untouched.
 */
export function serializePost(input: PostInput, existing: Frontmatter = {}): string {
  const { draft: _oldDraft, excerpt: _oldExcerpt, ...preserved } = existing;
  const frontmatter: Frontmatter = {
    page_css: DEFAULT_PAGE_CSS,
    page_js: DEFAULT_PAGE_JS,
    ...preserved,
    title: input.title,
    date: formatDate(input.date, input.time),
    categories: input.categories,
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    ...(input.draft ? { draft: true } : {}),
  };

  const ordered = orderKeys(frontmatter, ['title', 'date', 'page_css', 'page_js', 'categories', 'excerpt', 'draft']);
  const yaml = stringifyYaml(ordered, { lineWidth: 0 });
  return `---\n${yaml}---\n\n${input.body}`;
}

function orderKeys(obj: Frontmatter, first: string[]): Frontmatter {
  const head = first.filter((k) => k in obj).map((k) => [k, obj[k]] as const);
  const tail = Object.entries(obj).filter(([k]) => !first.includes(k));
  return Object.fromEntries([...head, ...tail]);
}

function splitDate(value: unknown): { date: string; time: string } {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  return { date: match?.[1] ?? '', time: match?.[2] ?? '12:00' };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return typeof value === 'string' && value ? [value] : [];
}

export function parsePost(markdown: string): ParsedPost {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('Post has no frontmatter block');

  const parsed: unknown = parseYaml(match[1]) ?? {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Frontmatter is not a mapping');
  const frontmatter = parsed as Frontmatter;
  const { date, time } = splitDate(frontmatter.date);

  return {
    frontmatter,
    fields: {
      title: String(frontmatter.title ?? '').trim(),
      date,
      time,
      categories: toStringArray(frontmatter.categories) as PostInput['categories'],
      excerpt: typeof frontmatter.excerpt === 'string' ? frontmatter.excerpt : undefined,
      draft: frontmatter.draft === true,
    },
    body: match[2].replace(/^\r?\n/, ''),
  };
}

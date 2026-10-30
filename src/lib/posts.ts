import { getCollection, type CollectionEntry } from 'astro:content';

/** "2026-06-23-deep-learning-notes" → "deep-learning-notes" (the last URL segment). */
export function titleSlugOf(post: CollectionEntry<'posts'>): string {
  return post.slug.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

export function isNotesPost(post: CollectionEntry<'posts'>): boolean {
  return post.data.categories?.includes('notes') ?? false;
}

export async function findPostByTitleSlug(slug: string): Promise<CollectionEntry<'posts'> | undefined> {
  const posts = await getCollection('posts');
  return posts.find((p) => titleSlugOf(p) === slug);
}

/** Markdown body reduced to readable text for the model prompt. */
export function plainText(markdown: string, maxLength: number): string {
  const text = markdown
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= maxLength ? text : text.slice(0, maxLength) + '…';
}

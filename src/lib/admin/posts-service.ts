import { GithubConflictError, type GithubClient } from './github';
import { parsePost, postFileName, serializePost, slugify, type ParsedPost, type PostInput } from './post-format';

export class PostNotFoundError extends Error {}

export interface SavedPost {
  name: string;
  sha: string;
  commitUrl: string;
}

export interface LoadedPost extends ParsedPost {
  name: string;
  sha: string;
  slug: string;
}

/** The URL slug Astro derives from a file name: "2024-09-07-The Dormgeist copy 2.md" → "the-dormgeist-copy-2". */
export function slugFromName(name: string): string {
  return slugify(name.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}-/, ''));
}

export async function loadPost(gh: GithubClient, name: string): Promise<LoadedPost> {
  const file = await gh.getPost(name);
  if (!file) throw new PostNotFoundError(name);
  return { ...parsePost(file.content), name, sha: file.sha, slug: slugFromName(name) };
}

/** Fails with GithubConflictError if a post with the same date + slug already exists. */
export async function createPost(gh: GithubClient, input: PostInput): Promise<SavedPost> {
  const name = postFileName(input.date, input.slug);
  const result = await gh.savePost(name, serializePost(input), { message: `content: add "${input.title}" (admin)` });
  return { name, ...result };
}

/**
 * Update in place, or — when the date or slug changed — write the new file
 * first and only then delete the old one, so a failure never loses the post.
 */
export async function updatePost(gh: GithubClient, name: string, sha: string, input: PostInput): Promise<SavedPost> {
  const current = await loadPost(gh, name);
  const content = serializePost(input, current.frontmatter);
  const newName = postFileName(input.date, input.slug);
  // Legacy names like "CP-scholarship-Bootcamp-2025.md" already map to the same URL; don't churn them.
  const sameUrl = current.slug === input.slug && name.startsWith(`${input.date}-`);

  if (newName === name || sameUrl) {
    const result = await gh.savePost(name, content, { sha, message: `content: update "${input.title}" (admin)` });
    return { name, ...result };
  }

  if (current.sha !== sha) {
    // Same signal GitHub gives for an in-place edit of a stale copy.
    throw new GithubConflictError('Post changed since it was opened', 409);
  }
  const created = await gh.savePost(newName, content, { message: `content: rename "${input.title}" (admin)` });
  await gh.deletePost(name, sha, `content: remove old file for "${input.title}" (admin)`);
  return { name: newName, ...created };
}

export async function removePost(gh: GithubClient, name: string, sha: string): Promise<{ commitUrl: string }> {
  return gh.deletePost(name, sha, `content: delete ${name} (admin)`);
}

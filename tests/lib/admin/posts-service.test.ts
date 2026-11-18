import { describe, expect, test, vi } from 'vitest';
import { GithubConflictError, type GithubClient } from '@/lib/admin/github';
import { postInputSchema } from '@/lib/admin/post-format';
import { PostNotFoundError, createPost, loadPost, removePost, slugFromName, updatePost } from '@/lib/admin/posts-service';

const legacyName = '2025-10-28-CP-scholarship-Bootcamp-2025.md';
const legacyContent = '---\ntitle:  "CP Scholarship Bootcamp 2025"\ndate: 2025-10-28 16:00:00 +0700\nauthor: Natpakan\ncategories: \n    - activities\n---\n\nold body';

function fakeGithub(files: Record<string, { content: string; sha: string }> = {}): GithubClient {
  return {
    listPosts: vi.fn(),
    getPost: vi.fn(async (name: string) => files[name] ?? null),
    savePost: vi.fn(async () => ({ sha: 'new-sha', commitUrl: 'https://github.com/c' })),
    deletePost: vi.fn(async () => ({ commitUrl: 'https://github.com/d' })),
  };
}

const input = (overrides: Record<string, unknown> = {}) =>
  postInputSchema.parse({
    title: 'CP Scholarship Bootcamp 2025',
    date: '2025-10-28',
    time: '16:00',
    slug: 'cp-scholarship-bootcamp-2025',
    categories: ['activities'],
    body: 'new body',
    ...overrides,
  });

describe('slugFromName', () => {
  test('mirrors the URL slug Astro generates for legacy names', () => {
    expect(slugFromName(legacyName)).toBe('cp-scholarship-bootcamp-2025');
    expect(slugFromName('2024-09-07-the-dormgeist copy 2.md')).toBe('the-dormgeist-copy-2');
  });
});

describe('loadPost', () => {
  test('throws PostNotFoundError for a missing file', async () => {
    await expect(loadPost(fakeGithub(), 'x.md')).rejects.toBeInstanceOf(PostNotFoundError);
  });
});

describe('createPost', () => {
  test('creates a dated file without a sha so GitHub refuses to overwrite', async () => {
    const gh = fakeGithub();
    const saved = await createPost(gh, input({ date: '2026-11-17', slug: 'new-post' }));
    expect(saved.name).toBe('2026-11-17-new-post.md');
    expect(gh.savePost).toHaveBeenCalledWith('2026-11-17-new-post.md', expect.stringContaining('new body'), {
      message: 'content: add "CP Scholarship Bootcamp 2025" (admin)',
    });
  });
});

describe('updatePost', () => {
  test('edits a legacy-named post in place when the URL is unchanged', async () => {
    const gh = fakeGithub({ [legacyName]: { content: legacyContent, sha: 's1' } });
    const saved = await updatePost(gh, legacyName, 's1', input());
    expect(saved.name).toBe(legacyName);
    expect(gh.deletePost).not.toHaveBeenCalled();
    const written = vi.mocked(gh.savePost).mock.calls[0][1];
    expect(written).toContain('author: Natpakan');
    expect(written).toContain('new body');
  });

  test('renames by writing the new file before deleting the old one', async () => {
    const gh = fakeGithub({ [legacyName]: { content: legacyContent, sha: 's1' } });
    const saved = await updatePost(gh, legacyName, 's1', input({ slug: 'cp-bootcamp' }));
    expect(saved.name).toBe('2025-10-28-cp-bootcamp.md');
    const saveOrder = vi.mocked(gh.savePost).mock.invocationCallOrder[0];
    const deleteOrder = vi.mocked(gh.deletePost).mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(deleteOrder);
    expect(gh.deletePost).toHaveBeenCalledWith(legacyName, 's1', expect.any(String));
  });

  test('refuses to rename a stale copy', async () => {
    const gh = fakeGithub({ [legacyName]: { content: legacyContent, sha: 'newer' } });
    await expect(updatePost(gh, legacyName, 'stale', input({ slug: 'other' }))).rejects.toBeInstanceOf(GithubConflictError);
    expect(gh.savePost).not.toHaveBeenCalled();
  });
});

describe('removePost', () => {
  test('deletes with the provided sha', async () => {
    const gh = fakeGithub();
    await removePost(gh, 'a.md', 's');
    expect(gh.deletePost).toHaveBeenCalledWith('a.md', 's', 'content: delete a.md (admin)');
  });
});

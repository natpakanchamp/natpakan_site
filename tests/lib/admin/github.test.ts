import { describe, expect, test, vi } from 'vitest';
import { GithubConflictError, GithubError, createGithubClient, decodeBase64Utf8, encodeBase64Utf8 } from '@/lib/admin/github';

const config = { token: 'tok', repo: 'owner/repo', branch: 'main' };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('base64 utf-8 helpers', () => {
  test('round-trips Thai text', () => {
    const text = 'วันที่หนึ่ง 🎉';
    expect(decodeBase64Utf8(encodeBase64Utf8(text))).toBe(text);
  });

  test('decodes GitHub base64 that contains newlines', () => {
    const encoded = encodeBase64Utf8('hello world').replace(/(.{4})/g, '$1\n');
    expect(decodeBase64Utf8(encoded)).toBe('hello world');
  });
});

describe('createGithubClient', () => {
  test('listPosts returns only markdown files, newest name first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, [
      { type: 'file', name: '2024-01-01-a.md', sha: '1' },
      { type: 'file', name: '.DS_Store', sha: '2' },
      { type: 'dir', name: 'drafts', sha: '3' },
      { type: 'file', name: '2026-01-01-b.md', sha: '4' },
    ]));
    const client = createGithubClient(config, fetchMock);

    expect(await client.listPosts()).toEqual([
      { name: '2026-01-01-b.md', sha: '4' },
      { name: '2024-01-01-a.md', sha: '1' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/owner/repo/contents/src/content/posts?ref=main');
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  test('getPost decodes content and URL-encodes names with spaces', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { content: encodeBase64Utf8('สวัสดี'), sha: 'abc' }));
    const client = createGithubClient(config, fetchMock);

    expect(await client.getPost('2024-09-07-the-dormgeist copy 2.md')).toEqual({ content: 'สวัสดี', sha: 'abc' });
    expect(fetchMock.mock.calls[0][0]).toContain('/contents/src/content/posts/2024-09-07-the-dormgeist%20copy%202.md?ref=main');
  });

  test('getPost returns null for a missing file', async () => {
    const client = createGithubClient(config, vi.fn().mockResolvedValue(jsonResponse(404, { message: 'Not Found' })));
    expect(await client.getPost('nope.md')).toBeNull();
  });

  test('savePost sends base64 content, branch and sha', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {
      content: { sha: 'newsha' },
      commit: { sha: 'c1', html_url: 'https://github.com/owner/repo/commit/c1' },
    }));
    const client = createGithubClient(config, fetchMock);

    const result = await client.savePost('2026-01-01-b.md', 'ข้อความ', { sha: 'old', message: 'content: update b' });

    expect(result).toEqual({ sha: 'newsha', commitUrl: 'https://github.com/owner/repo/commit/c1' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      message: 'content: update b',
      content: encodeBase64Utf8('ข้อความ'),
      branch: 'main',
      sha: 'old',
    });
  });

  test.each([409, 422])('savePost maps %i to GithubConflictError', async (status) => {
    const client = createGithubClient(config, vi.fn().mockResolvedValue(jsonResponse(status, { message: 'sha mismatch' })));
    await expect(client.savePost('a.md', 'x', { message: 'm' })).rejects.toBeInstanceOf(GithubConflictError);
  });

  test('other failures raise GithubError with the status but without the token', async () => {
    const client = createGithubClient(config, vi.fn().mockResolvedValue(jsonResponse(500, { message: 'boom' })));
    const error = await client.listPosts().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GithubError);
    expect((error as GithubError).status).toBe(500);
    expect(String(error)).not.toContain('tok');
  });

  test('deletePost sends DELETE with sha', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { commit: { html_url: 'u' } }));
    const client = createGithubClient(config, fetchMock);
    await client.deletePost('a.md', 's1', 'content: delete a');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ message: 'content: delete a', sha: 's1', branch: 'main' });
  });
});

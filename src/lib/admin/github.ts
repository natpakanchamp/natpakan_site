import type { GithubConfig } from './env';

/** Posts are committed to the repo; Cloudflare Pages rebuilds the static site on push. */
const POSTS_DIR = 'src/content/posts';
const API = 'https://api.github.com';

export class GithubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** The file changed (or already exists) since the editor loaded it. */
export class GithubConflictError extends GithubError {}

export interface PostRef {
  name: string;
  sha: string;
}

export interface SaveResult {
  sha: string;
  commitUrl: string;
}

export interface GithubClient {
  listPosts(): Promise<PostRef[]>;
  getPost(name: string): Promise<{ content: string; sha: string } | null>;
  savePost(name: string, content: string, options: { sha?: string; message: string }): Promise<SaveResult>;
  deletePost(name: string, sha: string, message: string): Promise<{ commitUrl: string }>;
}

export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64Utf8(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createGithubClient(config: GithubConfig, fetchImpl: typeof fetch = fetch): GithubClient {
  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'site-admin',
    'Content-Type': 'application/json',
  };
  const contentsUrl = (name?: string): string =>
    `${API}/repos/${config.repo}/contents/${POSTS_DIR}${name ? `/${encodeURIComponent(name)}` : ''}`;

  async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetchImpl(url, { ...init, headers });
    if (res.ok) return (await res.json()) as T;
    const detail = await res.json().then((b: { message?: string }) => b.message ?? '').catch(() => '');
    const message = `GitHub ${init.method ?? 'GET'} failed (${res.status})${detail ? `: ${detail}` : ''}`;
    if (res.status === 409 || res.status === 422) throw new GithubConflictError(message, res.status);
    throw new GithubError(message, res.status);
  }

  return {
    async listPosts() {
      const items = await call<{ type: string; name: string; sha: string }[]>(`${contentsUrl()}?ref=${config.branch}`);
      return items
        .filter((i) => i.type === 'file' && i.name.endsWith('.md'))
        .map(({ name, sha }) => ({ name, sha }))
        .sort((a, b) => b.name.localeCompare(a.name));
    },

    async getPost(name) {
      try {
        const file = await call<{ content: string; sha: string }>(`${contentsUrl(name)}?ref=${config.branch}`);
        return { content: decodeBase64Utf8(file.content), sha: file.sha };
      } catch (error) {
        if (error instanceof GithubError && error.status === 404) return null;
        throw error;
      }
    },

    async savePost(name, content, { sha, message }) {
      const body = { message, content: encodeBase64Utf8(content), branch: config.branch, ...(sha ? { sha } : {}) };
      const res = await call<{ content: { sha: string }; commit: { html_url: string } }>(contentsUrl(name), {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      return { sha: res.content.sha, commitUrl: res.commit.html_url };
    },

    async deletePost(name, sha, message) {
      const res = await call<{ commit: { html_url: string } }>(contentsUrl(name), {
        method: 'DELETE',
        body: JSON.stringify({ message, sha, branch: config.branch }),
      });
      return { commitUrl: res.commit.html_url };
    },
  };
}

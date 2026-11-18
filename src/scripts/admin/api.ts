/** Thin fetch wrapper for /api/admin/*; throws ApiError with a message safe to show. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface PostRef {
  name: string;
  sha: string;
}

export interface PostFields {
  title: string;
  date: string;
  time: string;
  categories: string[];
  excerpt?: string;
  draft: boolean;
}

export interface LoadedPost {
  name: string;
  sha: string;
  slug: string;
  fields: PostFields;
  body: string;
}

export interface SavedPost {
  name: string;
  sha: string;
  commitUrl: string;
}

export interface SeasonSetting {
  enabled: boolean;
  start: string;
  end: string;
}

export interface PresignedUpload {
  uploadUrl: string;
  publicUrl: string;
  contentType: string;
  snippet: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; issues?: string[] } & T;
  if (!res.ok) {
    const detail = body.issues?.length ? `: ${body.issues.join(', ')}` : '';
    throw new ApiError(`${body.error ?? `เกิดข้อผิดพลาด (${res.status})`}${detail}`, res.status);
  }
  return body;
}

// Site uses trailingSlash: 'always'; the post is addressed by its file stem (no .md) so the path has no extension.
const postPath = (name: string) => `/api/admin/posts/${encodeURIComponent(name.replace(/\.md$/, ''))}/`;

export const api = {
  listPosts: () => request<{ posts: PostRef[] }>('/api/admin/posts/').then((r) => r.posts),
  getPost: (name: string) => request<LoadedPost>(postPath(name)),
  createPost: (input: unknown) => request<SavedPost>('/api/admin/posts/', { method: 'POST', body: JSON.stringify(input) }),
  updatePost: (name: string, input: unknown) => request<SavedPost>(postPath(name), { method: 'PUT', body: JSON.stringify(input) }),
  deletePost: (name: string, sha: string) => request<{ commitUrl: string }>(postPath(name), { method: 'DELETE', body: JSON.stringify({ sha }) }),
  getSeasons: () => request<{ seasons: Record<string, SeasonSetting>; sha?: string }>('/api/admin/seasons/'),
  saveSeasons: (seasons: Record<string, SeasonSetting>, sha?: string) =>
    request<{ sha: string; commitUrl: string }>('/api/admin/seasons/', { method: 'PUT', body: JSON.stringify({ seasons, sha }) }),
  presign: (file: { filename: string; contentType: string; size: number; alt: string }) =>
    request<PresignedUpload>('/api/admin/upload/', { method: 'POST', body: JSON.stringify(file) }),
};

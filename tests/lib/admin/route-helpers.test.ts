import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { GithubConflictError, GithubError } from '@/lib/admin/github';
import { PostNotFoundError } from '@/lib/admin/posts-service';
import { domainErrorResponse, readJson } from '@/lib/admin/route-helpers';

const schema = z.object({ title: z.string().min(1) });
const post = (body: string) => new Request('https://s.test/', { method: 'POST', body });

describe('readJson', () => {
  test('returns parsed data for a valid body', async () => {
    expect(await readJson(post('{"title":"a"}'), schema)).toEqual({ title: 'a' });
  });

  test('returns 400 for malformed JSON', async () => {
    const res = (await readJson(post('{'), schema)) as Response;
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
  });

  test('returns 400 listing field issues for an invalid body', async () => {
    const res = (await readJson(post('{"title":""}'), schema)) as Response;
    expect(res.status).toBe(400);
    expect((await res.json()).issues[0]).toMatch(/^title:/);
  });
});

describe('domainErrorResponse', () => {
  test('maps PostNotFoundError to 404', () => {
    expect(domainErrorResponse(new PostNotFoundError('x')).status).toBe(404);
  });

  test('maps conflicts to 409', () => {
    expect(domainErrorResponse(new GithubConflictError('c', 409)).status).toBe(409);
  });

  test('rethrows unknown errors for withAdmin to log', () => {
    expect(() => domainErrorResponse(new GithubError('boom', 500))).toThrow('boom');
  });
});

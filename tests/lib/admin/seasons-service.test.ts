import { describe, expect, test, vi } from 'vitest';
import type { GithubClient } from '@/lib/admin/github';
import { loadSeasons, saveSeasons, seasonsInputSchema } from '@/lib/admin/seasons-service';

function fakeGithub(file: { content: string; sha: string } | null): GithubClient {
  return {
    getDataFile: vi.fn(async () => file),
    saveDataFile: vi.fn(async () => ({ sha: 'new', commitUrl: 'https://github.com/c' })),
    listPosts: vi.fn(),
    getPost: vi.fn(),
    savePost: vi.fn(),
    deletePost: vi.fn(),
  };
}

const valid = {
  christmas: { enabled: true, start: '12-05', end: '01-02' },
  snow: { enabled: false, start: '11-15', end: '12-30' },
};

describe('seasonsInputSchema', () => {
  test('accepts a valid config', () => {
    expect(seasonsInputSchema.safeParse(valid).success).toBe(true);
  });

  test.each([
    ['impossible date', { ...valid, christmas: { enabled: true, start: '02-30', end: '03-01' } }],
    ['wrong format', { ...valid, christmas: { enabled: true, start: '12/05', end: '01-02' } }],
    ['unknown season id', { ...valid, halloween: { enabled: true, start: '10-01', end: '10-31' } }],
    ['missing a known season', {}],
    ['non-boolean enabled', { ...valid, christmas: { enabled: 'yes', start: '12-05', end: '01-02' } }],
    ['missing one season', { christmas: valid.christmas }],
  ])('rejects %s', (_name, input) => {
    expect(seasonsInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('loadSeasons', () => {
  test('reads the committed file with its sha', async () => {
    const gh = fakeGithub({ content: JSON.stringify(valid), sha: 's1' });
    expect(await loadSeasons(gh)).toEqual({ seasons: valid, sha: 's1' });
  });

  test('falls back to the bundled defaults when the file does not exist yet', async () => {
    const result = await loadSeasons(fakeGithub(null));
    expect(result.sha).toBeUndefined();
    expect(result.seasons.christmas).toMatchObject({ start: expect.any(String), end: expect.any(String) });
  });

  test('ignores invalid stored content and reports defaults instead of crashing', async () => {
    const result = await loadSeasons(fakeGithub({ content: '{not json', sha: 's1' }));
    expect(result.sha).toBe('s1');
    expect(result.seasons.christmas).toBeDefined();
  });
});

describe('saveSeasons', () => {
  test('commits pretty JSON with a trailing newline and the previous sha', async () => {
    const gh = fakeGithub(null);
    await saveSeasons(gh, valid, 's1');
    expect(gh.saveDataFile).toHaveBeenCalledWith('seasons', `${JSON.stringify(valid, null, 2)}\n`, {
      sha: 's1',
      message: 'content: update seasonal dates (admin)',
    });
  });
});

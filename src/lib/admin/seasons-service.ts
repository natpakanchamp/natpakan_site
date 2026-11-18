import { z } from 'zod';
import { SEASONS, SEASON_IDS, parseMonthDay, type SeasonConfig, type SeasonId } from '../seasons';
import type { GithubClient, SaveResult } from './github';

const monthDay = z.string().refine((v) => {
  try {
    parseMonthDay(v);
    return true;
  } catch {
    return false;
  }
}, 'วันที่ต้องเป็น MM-DD ที่มีอยู่จริง');

const seasonSchema = z.object({ enabled: z.boolean(), start: monthDay, end: monthDay }).strict();

/** Exactly the seasons that exist in code — no more, no fewer. */
export const seasonsInputSchema = z
  .object(Object.fromEntries(SEASON_IDS.map((id) => [id, seasonSchema])) as Record<SeasonId, typeof seasonSchema>)
  .strict();

export type SeasonsInput = Record<SeasonId, SeasonConfig>;

function defaults(): SeasonsInput {
  return Object.fromEntries(SEASON_IDS.map((id) => [id, SEASONS[id]])) as SeasonsInput;
}

/** Current config from the repo (so an edit made seconds ago is seen before the rebuild finishes). */
export async function loadSeasons(gh: GithubClient): Promise<{ seasons: SeasonsInput; sha?: string }> {
  const file = await gh.getDataFile('seasons');
  if (!file) return { seasons: defaults() };
  try {
    const parsed = seasonsInputSchema.safeParse(JSON.parse(file.content));
    return { seasons: parsed.success ? (parsed.data as SeasonsInput) : defaults(), sha: file.sha };
  } catch {
    return { seasons: defaults(), sha: file.sha };
  }
}

export async function saveSeasons(gh: GithubClient, seasons: SeasonsInput, sha?: string): Promise<SaveResult> {
  return gh.saveDataFile('seasons', `${JSON.stringify(seasons, null, 2)}\n`, {
    sha,
    message: 'content: update seasonal dates (admin)',
  });
}

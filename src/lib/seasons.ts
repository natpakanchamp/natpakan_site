/**
 * Seasonal decorations: what shows, and on which calendar dates, every year.
 *
 * Dates live in src/data/seasons.json and are edited from /admin/seasons/
 * (each save commits the file; Pages rebuilds). Ranges are MM-DD, inclusive,
 * and may cross New Year (12-01 → 01-06). They are checked in the visitor's
 * browser in SITE_TIME_ZONE, so decorations switch on and off by themselves
 * every year without a rebuild. Preview any season with `?season=<id>`.
 *
 * To add a season: add its id + label to SEASON_LABELS, a default entry to
 * seasons.json, its component to src/components/seasonal/, and render it
 * inside <Seasonal id="..."> in SeasonalDecor.astro.
 */
import storedConfig from '@/data/seasons.json';

export const SITE_TIME_ZONE = 'Asia/Bangkok';

/** Seasons that have a decoration in code. Only these ids can be configured. */
export const SEASON_LABELS = {
  christmas: 'ต้นคริสต์มาส',
  snow: 'หิมะตก (ทุกหน้า)',
} as const;
export type SeasonId = keyof typeof SEASON_LABELS;
export const SEASON_IDS = Object.keys(SEASON_LABELS) as SeasonId[];

export interface SeasonConfig {
  enabled: boolean;
  /** First day shown, MM-DD. */
  start: string;
  /** Last day shown, MM-DD (inclusive). */
  end: string;
}

const DISABLED: SeasonConfig = { enabled: false, start: '01-01', end: '01-01' };

/** Config as committed in seasons.json; a season missing from the file stays off. */
export const SEASONS: Record<string, SeasonConfig> = Object.fromEntries(
  SEASON_IDS.map((id) => [id, (storedConfig as Partial<Record<string, SeasonConfig>>)[id] ?? DISABLED]),
);

export interface MonthDay {
  month: number;
  day: number;
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseMonthDay(value: string): MonthDay {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  const month = match ? Number(match[1]) : 0;
  const day = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) {
    throw new Error(`Invalid season date "${value}" (expected MM-DD)`);
  }
  return { month, day };
}

const ordinal = ({ month, day }: MonthDay) => month * 100 + day;

/** Inclusive; when start > end the range wraps across New Year. */
export function isInRange(today: MonthDay, range: { start: MonthDay; end: MonthDay }): boolean {
  const t = ordinal(today), s = ordinal(range.start), e = ordinal(range.end);
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
}

export function monthDayIn(date: Date, timeZone: string): MonthDay {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, month: 'numeric', day: 'numeric' }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { month: get('month'), day: get('day') };
}

/**
 * @param preview value of the `?season=` query parameter, if any
 */
export function isSeasonActive(
  id: string,
  now: Date = new Date(),
  preview?: string | null,
  seasons: Record<string, SeasonConfig> = SEASONS,
): boolean {
  const season = seasons[id];
  if (!season) return false;
  if (preview) return preview === id;
  if (!season.enabled) return false;
  return isInRange(monthDayIn(now, SITE_TIME_ZONE), { start: parseMonthDay(season.start), end: parseMonthDay(season.end) });
}

/** Browser helper: reads `?season=` and checks today's date. */
export function isSeasonActiveHere(id: string): boolean {
  let preview: string | null = null;
  try {
    preview = new URLSearchParams(window.location.search).get('season');
  } catch {
    preview = null;
  }
  return isSeasonActive(id, new Date(), preview);
}

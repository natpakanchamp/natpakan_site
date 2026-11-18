import { describe, expect, test } from 'vitest';
import { SEASONS, isInRange, isSeasonActive, monthDayIn, parseMonthDay } from '@/lib/seasons';

const md = (s: string) => parseMonthDay(s);

describe('parseMonthDay', () => {
  test('reads MM-DD', () => {
    expect(parseMonthDay('12-01')).toEqual({ month: 12, day: 1 });
  });

  test.each(['12/01', '13-01', '00-10', '02-30', '1-1', ''])('rejects %j', (bad) => {
    expect(() => parseMonthDay(bad)).toThrow();
  });
});

describe('isInRange', () => {
  test('inclusive on both ends within one year', () => {
    const r = { start: md('03-10'), end: md('03-20') };
    expect(isInRange(md('03-10'), r)).toBe(true);
    expect(isInRange(md('03-20'), r)).toBe(true);
    expect(isInRange(md('03-09'), r)).toBe(false);
    expect(isInRange(md('03-21'), r)).toBe(false);
  });

  test('wraps across new year (Dec → Jan)', () => {
    const r = { start: md('12-01'), end: md('01-06') };
    expect(isInRange(md('12-01'), r)).toBe(true);
    expect(isInRange(md('12-31'), r)).toBe(true);
    expect(isInRange(md('01-01'), r)).toBe(true);
    expect(isInRange(md('01-06'), r)).toBe(true);
    expect(isInRange(md('01-07'), r)).toBe(false);
    expect(isInRange(md('11-30'), r)).toBe(false);
    expect(isInRange(md('06-15'), r)).toBe(false);
  });
});

describe('monthDayIn', () => {
  test('uses the site time zone, not UTC', () => {
    // 2026-11-30 18:00 UTC is already 2026-12-01 01:00 in Bangkok
    expect(monthDayIn(new Date('2026-11-30T18:00:00Z'), 'Asia/Bangkok')).toEqual({ month: 12, day: 1 });
    expect(monthDayIn(new Date('2026-11-30T18:00:00Z'), 'UTC')).toEqual({ month: 11, day: 30 });
  });
});

describe('isSeasonActive', () => {
  const xmas = { christmas: { enabled: true, start: '12-01', end: '01-06' } };

  test('christmas is on in December and early January, off otherwise', () => {
    expect(isSeasonActive('christmas', new Date('2026-12-15T05:00:00Z'), null, xmas)).toBe(true);
    expect(isSeasonActive('christmas', new Date('2027-01-03T05:00:00Z'), null, xmas)).toBe(true);
    expect(isSeasonActive('christmas', new Date('2026-11-18T05:00:00Z'), null, xmas)).toBe(false);
  });

  test('a preview override forces a season on', () => {
    expect(isSeasonActive('christmas', new Date('2026-07-01T05:00:00Z'), 'christmas')).toBe(true);
    expect(isSeasonActive('christmas', new Date('2026-07-01T05:00:00Z'), 'other')).toBe(false);
  });

  test('unknown seasons are never active', () => {
    expect(isSeasonActive('nope', new Date())).toBe(false);
  });

  test('a disabled season never shows, but can still be previewed', () => {
    const seasons = { christmas: { enabled: false, start: '12-01', end: '01-06' } };
    expect(isSeasonActive('christmas', new Date('2026-12-15T05:00:00Z'), null, seasons)).toBe(false);
    expect(isSeasonActive('christmas', new Date('2026-12-15T05:00:00Z'), 'christmas', seasons)).toBe(true);
  });

  test('every configured range parses', () => {
    for (const season of Object.values(SEASONS)) {
      expect(() => parseMonthDay(season.start)).not.toThrow();
      expect(() => parseMonthDay(season.end)).not.toThrow();
    }
  });
});

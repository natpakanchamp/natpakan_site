/**
 * "M E R R Y   C H R I S T M A S   <year>" under the tree (the message block from
 * christmas_tree.py): typed out letter by letter after the star lights, coloured in
 * pairs cycling red → gold → green, each letter gently pulsing. The year follows the
 * calendar (site time zone), so it is right every season without an edit.
 */
import { SITE_TIME_ZONE } from '@/lib/seasons';
import { GOLD, GREEN_BOX, RED, T_STAR } from './model';

/**
 * The year whose Christmas we're celebrating: the current year from July on; in the first
 * half of the year (e.g. a season that runs into early January) it's still last Christmas.
 */
export function christmasYear(now: Date = new Date(), timeZone: string = SITE_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return month >= 7 ? year : year - 1;
}

export const messageFor = (year: number) => `MERRY CHRISTMAS ${year}`.split('').join(' ');

/** Fixed when the page loads. */
export const MESSAGE = messageFor(christmasYear());
/** Typing starts a beat after the star appears. */
export const T_MSG = T_STAR + 1.0;
const LETTERS_PER_S = 10;
const PALETTE = [RED, GOLD, GREEN_BOX];

export interface MessageGrid {
  cols: number;
  /** Row the text sits on. */
  row: number;
  /** Cells per character of the (already space-separated) text; >1 spreads the letters out. Default 1. */
  pitch?: number;
  /** Clear the cells around the text (e.g. snowfield dots) so it reads cleanly. */
  clear: (cell: number) => void;
  put: (cell: number, ch: string, r: number, g: number, b: number) => void;
}

/** @param t wall time — the message keeps colour-cycling after the build has finished */
export function drawMessage(grid: MessageGrid, t: number, text: string = MESSAGE): void {
  if (t <= T_MSG) return;
  const { cols, row } = grid;
  const pitch = grid.pitch ?? 1;
  const colOf = (i: number) => Math.round(i * pitch);
  const x0 = Math.floor((cols - colOf(text.length - 1) - 1) / 2);
  const shown = Math.min(text.length, Math.floor((t - T_MSG) * LETTERS_PER_S));

  // clear a band behind the text, as the original does
  const end = shown > 0 ? x0 + colOf(shown - 1) + 1 : x0;
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = Math.max(x0 - 3, 0); c < Math.min(end + 3, cols); c++) grid.clear(r * cols + c);
  }

  for (let i = 0; i < shown; i++) {
    const ch = text[i];
    if (ch === ' ') continue;
    const tint = PALETTE[(Math.floor(i / 2) + Math.floor(t * 1.5)) % PALETTE.length];
    const lum = 0.85 + 0.25 * Math.sin(t * 5 + i * 0.6);
    grid.put(row * cols + x0 + colOf(i), ch, tint[0] * lum, tint[1] * lum, tint[2] * lum);
  }
}

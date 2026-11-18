import { describe, expect, test } from 'vitest';
import { BUILD_END_S, Kind, T_STAR, buildModel } from '@/scripts/seasonal/christmas-tree/model';
import { MESSAGE, T_MSG, christmasYear, drawMessage, messageFor } from '@/scripts/seasonal/christmas-tree/message';

const model = buildModel();
const TREE_KINDS = new Set<number>([Kind.Needle, Kind.Snow, Kind.Inner, Kind.Trunk]);
const GROWTH_END_S = 2.4;

function points(kinds: Set<number>) {
  const out: { y: number; t0: number; hot: number; kind: number }[] = [];
  for (let i = 0; i < model.n; i++) {
    if (kinds.has(model.kind[i])) out.push({ y: model.pos[i * 3 + 1], t0: model.t0[i], hot: model.hot[i], kind: model.kind[i] });
  }
  return out;
}

describe('christmas tree build timeline', () => {
  test('nothing on the tree appears before the white light reaches it', () => {
    for (const p of points(TREE_KINDS)) {
      if (!Number.isNaN(p.hot)) expect(p.t0).toBeGreaterThanOrEqual(p.hot - 1e-6);
    }
  });

  test('the trunk rises from the floor: lower trunk points appear no later than higher ones', () => {
    const trunk = points(new Set([Kind.Trunk])).sort((a, b) => a.y - b.y);
    for (let i = 1; i < trunk.length; i++) expect(trunk[i].t0).toBeGreaterThanOrEqual(trunk[i - 1].t0 - 1e-6);
    expect(trunk[0].t0).toBeLessThan(trunk[trunk.length - 1].t0); // it really grows, not all at once
  });

  test('the core climbs with the waves instead of appearing all at once', () => {
    const inner = points(new Set([Kind.Inner]));
    const low = inner.filter((p) => p.y < -0.4).map((p) => p.t0);
    const high = inner.filter((p) => p.y > 0.6).map((p) => p.t0);
    expect(Math.max(...low)).toBeLessThan(Math.min(...high));
  });

  test('growth finishes by 2.4 s, well before the star and the end of the build', () => {
    const last = Math.max(...points(TREE_KINDS).map((p) => p.t0));
    expect(last).toBeLessThanOrEqual(GROWTH_END_S + 1e-6);
    expect(T_STAR).toBeLessThan(BUILD_END_S);
  });

  test('only a share of the tree flashes white (sparse build sparks)', () => {
    const needles = points(new Set([Kind.Needle]));
    const lit = needles.filter((p) => !Number.isNaN(p.hot)).length / needles.length;
    expect(lit).toBeGreaterThan(0.4);
    expect(lit).toBeLessThan(0.7);
  });

  test('no dark holes wait for the baubles: contact shadows only start once a bauble pops in', () => {
    const balls = new Set<number>();
    for (let i = 0; i < model.n; i++) if (model.kind[i] === Kind.Ball) balls.add(Math.round(model.t0[i] * 1e4));
    let shaded = 0;
    for (let i = 0; i < model.n; i++) {
      if (model.shade[i] >= 1) continue;
      shaded++;
      expect(model.shadeAt[i]).toBeGreaterThan(GROWTH_END_S); // never during growth
      expect(balls.has(Math.round(model.shadeAt[i] * 1e4))).toBe(true); // tied to a real bauble's pop-in
    }
    expect(shaded).toBeGreaterThan(100); // the shadows still exist
  });

  test('foliage base brightness is no longer pre-darkened around baubles', () => {
    for (let i = 0; i < model.n; i++) {
      if (model.kind[i] === Kind.Inner) expect(model.base[i]).toBeCloseTo(0.75, 5);
    }
  });

  test('baubles flash white the moment they pop in', () => {
    let balls = 0;
    for (let i = 0; i < model.n; i++) {
      if (model.kind[i] !== Kind.Ball) continue;
      balls++;
      expect(model.hot[i]).toBe(model.t0[i]);
    }
    expect(balls).toBeGreaterThan(0);
  });
});

describe('MERRY CHRISTMAS 2026 message', () => {
  const COLS = 70;
  const render = (t: number, text = messageFor(2026)) => {
    const cells = new Map<number, string>();
    drawMessage({ cols: COLS, row: 5, clear: (c) => cells.delete(c), put: (c, ch) => cells.set(c, ch) }, t, text);
    return [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([, ch]) => ch).join('');
  };

  test('spells the spaced-out greeting with the year', () => {
    expect(messageFor(2026)).toBe('M E R R Y   C H R I S T M A S   2 0 2 6');
    expect(messageFor(2031)).toBe('M E R R Y   C H R I S T M A S   2 0 3 1');
  });

  test('the year follows the calendar, in the site time zone', () => {
    expect(christmasYear(new Date('2026-12-15T05:00:00Z'))).toBe(2026);
    expect(christmasYear(new Date('2027-11-20T05:00:00Z'))).toBe(2027);
    // a season running into early January still celebrates last Christmas
    expect(christmasYear(new Date('2027-01-04T05:00:00Z'))).toBe(2026);
    // 31 Dec 2026 18:00 UTC is already 1 Jan 2027 in Bangkok → still Christmas 2026
    expect(christmasYear(new Date('2026-12-31T18:00:00Z'))).toBe(2026);
  });

  test('the live message uses the current Christmas year', () => {
    expect(MESSAGE).toBe(messageFor(christmasYear()));
  });

  test('is typed out after the star, letter by letter', () => {
    expect(T_MSG).toBeGreaterThan(T_STAR);
    expect(render(T_MSG)).toBe('');
    expect(render(T_MSG + 0.55)).toBe('MER');
    expect(render(T_MSG + 10)).toBe('MERRYCHRISTMAS2026');
  });

  test('is fully written before the reduced-motion still frame (t = 17)', () => {
    expect(T_MSG + MESSAGE.length / 10).toBeLessThan(17);
  });
});

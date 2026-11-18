import { describe, expect, test } from 'vitest';
import { BUILD_END_S, Kind, T_STAR, buildModel } from '@/scripts/seasonal/christmas-tree/model';

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
});

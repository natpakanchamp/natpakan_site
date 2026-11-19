/**
 * Point-cloud model of the tree and presents, ported from christmas_tree.py
 * (build()). Everything is stored as flat typed arrays (structure of arrays)
 * so the per-frame loop in render.ts stays allocation-free.
 */
export const TAU = Math.PI * 2;

// world
export const GROUND = -1.0;
export const Y0 = -0.72;
export const Y1 = 1.05;
const R_BASE = 0.92;

// timeline (seconds)
const T_GROW: [number, number] = [0.0, 2.4];
const T_GARLAND: [number, number] = [2.6, 5.6]; // long enough to follow the white head as it winds up
const T_BALLS: [number, number] = [4.4, 6.8];
const T_LIGHTS: [number, number] = [6.4, 8.8];
const T_GIFTS: [number, number] = [7.8, 9.8];
export const T_STAR = 10.0;
/** Shortly after the star lights, the build is done and the tree only turns (see index.ts). */
export const BUILD_END_S = 11.8;

/**
 * Build-front sparkle: only this share of points flash white as their layer grows (the rest
 * fade in green), and within a layer the flash spreads from the trunk out to the branch tips.
 */
const SPARK_NEEDLE = 0.55;
const SPARK_INNER = 0.4;
const SPARK_TRUNK = 0.45;
/**
 * The tree grows in TIERS overlapping waves, bottom to top. In each tier the core lights first,
 * then a ring of light runs out along the branches to the tips (GROW_OUT_S). The next tier
 * starts before the previous ring reaches the tips, so the waves cascade into each other.
 */
const TIERS = 12;
const CORE_LEAD_S = 0.08; // core flashes this much before the ring sets off
const GROW_OUT_S = 0.5; // trunk → tip
/** Height where the garland begins: level with the tips of the lowest, drooping branches. */
const GARLAND_START_Y = Y0 - 0.16;
/** The trunk rises from the floor to the first whorl with the light before the first wave. */
const TRUNK_RISE_S = 0.2;
/** A present's white flash sweeps from its base up to the bow over this long. */
const GIFT_SWEEP_S = 0.35;
/** Separate RNG for sparks so the tree's geometry (driven by the main RNG) is unchanged. */
let sparkRandom: () => number = Math.random;
const sparkle = (share: number, at: number) => (sparkRandom() < share ? at : NaN);

type Rgb = readonly [number, number, number];
export const WHITE: Rgb = [0.95, 0.97, 1.0];
export const RED: Rgb = [0.93, 0.2, 0.2];
export const GOLD: Rgb = [1.0, 0.77, 0.35];
const BAUBLE_GOLD: Rgb = [1.0, 0.7, 0.2];
export const GREEN_BOX: Rgb = [0.25, 0.78, 0.36];
const BLUE_BOX: Rgb = [0.28, 0.42, 0.98];
const WARM: Rgb = [1.0, 0.8, 0.45];
/** Paler than the gold baubles so the garland reads as its own line around the tree. */
const TINSEL_GOLD: Rgb = [1.0, 0.86, 0.5];

export const Kind = { Needle: 0, Snow: 1, Inner: 2, Trunk: 3, Tinsel: 4, Ball: 5, Light: 6, Gift: 7, Ribbon: 8 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];

export interface Model {
  n: number;
  pos: Float32Array; nrm: Float32Array; col: Float32Array; centre: Float32Array;
  kind: Uint8Array; pop: Uint8Array;
  t0: Float32Array; base: Float32Array; phase: Float32Array;
  /** Time the point's layer turns white-hot; NaN = never. */
  hot: Float32Array;
  /** Contact-shadow brightness factor (1 = unshaded), applied once `shadeAt` has passed. */
  shade: Float32Array;
  /** When the ornament casting that shadow pops in (Infinity = never), so no dark hole waits for it. */
  shadeAt: Float32Array;
}

// ---------------------------------------------------------------- deterministic RNG
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeRng(seed: number) {
  const random = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(TAU * random());
  const uniform = (lo: number, hi: number) => lo + (hi - lo) * random();
  return { random, normal, uniform };
}

// ---------------------------------------------------------------- helpers
export const envelope = (y: number) => R_BASE * Math.pow(1 - Math.min(Math.max((y - Y0) / (Y1 - Y0), 0), 1), 1.05);
const LAYER_COUNT = 24;
const LAYER_START = Y0 + 0.02;
const LAYER_STEP = (Y1 - 0.06 - LAYER_START) / (LAYER_COUNT - 1);
/** Gap between tier starts; shorter than a tier's own spread, so consecutive tiers overlap. */
const TIER_STAGGER_S = (T_GROW[1] - T_GROW[0] - TRUNK_RISE_S - CORE_LEAD_S - GROW_OUT_S) / (TIERS - 1);
/** When the tier containing whorl `i` starts growing. */
const tierStart = (i: number) => T_GROW[0] + TRUNK_RISE_S + Math.floor((i * TIERS) / LAYER_COUNT) * TIER_STAGGER_S;
/**
 * When the light reaches height y on the trunk/core: rising from the floor, then following
 * the waves up the tree. Nothing on the core shows before the light gets there.
 */
const lightReaches = (y: number) => {
  if (y < LAYER_START) return T_GROW[0] + TRUNK_RISE_S * Math.min(Math.max((y - GROUND) / (LAYER_START - GROUND), 0), 1);
  const whorl = Math.min((y - LAYER_START) / LAYER_STEP, LAYER_COUNT - 1); // fractional, so the core rises smoothly
  return T_GROW[0] + TRUNK_RISE_S + ((whorl * TIERS) / LAYER_COUNT) * TIER_STAGGER_S;
};

function fibSphere(n: number): number[][] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 0.5;
    const y = 1 - (2 * i) / n;
    const r = Math.sqrt(1 - y * y);
    const phi = i * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(phi) * r, y, Math.sin(phi) * r];
  });
}

function rotY([x, y, z]: number[], a: number): number[] {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

// ---------------------------------------------------------------- contact shadows
/** Foliage brightness right against an ornament (0..1). */
const SHADOW_FLOOR = 0.4;
/** Shadow radius beyond the ornament surface, as a multiple of its radius (above / below its centre). */
const SHADOW_REACH = 1.1;
const SHADOW_REACH_BELOW = 1.6;

// ---------------------------------------------------------------- point collector
class Builder {
  private data: number[][] = Array.from({ length: 20 }, () => []);

  add(p: number[], nrm: number[], col: Rgb | number[], kind: Kind, t0: number,
      opts: { base?: number; phase?: number; centre?: number[]; pop?: boolean; hot?: number } = {}) {
    const len = Math.hypot(nrm[0], nrm[1], nrm[2]) + 1e-9;
    const c = opts.centre ?? p;
    const row = [p[0], p[1], p[2], nrm[0] / len, nrm[1] / len, nrm[2] / len, col[0], col[1], col[2],
      c[0], c[1], c[2], kind, opts.pop ? 1 : 0, t0, opts.base ?? 1, opts.phase ?? 0, opts.hot ?? NaN, 1, Infinity];
    for (let i = 0; i < row.length; i++) this.data[i].push(row[i]);
  }

  /**
   * Contact shadows: foliage close to an ornament is darkened (more so just below it, where the
   * ornament blocks the light from above), so baubles read as hanging in the branches.
   * The shadow is stored, not baked in: it appears only when its bauble pops in (render.ts).
   */
  shadeFoliageNear(spheres: { c: number[]; r: number; t0: number }[]) {
    const d = this.data;
    for (let i = 0; i < d[0].length; i++) {
      const kind = d[12][i];
      if (kind !== Kind.Needle && kind !== Kind.Inner && kind !== Kind.Snow) continue;
      let shade = 1;
      let at = Infinity;
      for (const { c, r, t0 } of spheres) {
        const dy = d[1][i] - c[1];
        const reach = r * (dy < 0 ? SHADOW_REACH_BELOW : SHADOW_REACH);
        const gap = Math.hypot(d[0][i] - c[0], dy, d[2][i] - c[2]) - r;
        if (gap >= reach) continue;
        const x = Math.max(gap, 0) / reach;
        const s = SHADOW_FLOOR + (1 - SHADOW_FLOOR) * x * x * (3 - 2 * x);
        if (s < shade) {
          shade = s;
          at = t0; // the darkest shadow belongs to this bauble: show it when that bauble appears
        }
      }
      d[18][i] = shade;
      d[19][i] = at;
    }
  }

  finish(): Model {
    const d = this.data;
    const n = d[0].length;
    const vec = (a: number) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { out[i * 3] = d[a][i]; out[i * 3 + 1] = d[a + 1][i]; out[i * 3 + 2] = d[a + 2][i]; }
      return out;
    };
    return {
      n, pos: vec(0), nrm: vec(3), col: vec(6), centre: vec(9),
      kind: Uint8Array.from(d[12]), pop: Uint8Array.from(d[13]),
      t0: Float32Array.from(d[14]), base: Float32Array.from(d[15]), phase: Float32Array.from(d[16]), hot: Float32Array.from(d[17]),
      shade: Float32Array.from(d[18]), shadeAt: Float32Array.from(d[19]),
    };
  }
}

// ---------------------------------------------------------------- parts
function addNeedles(q: Builder, rng: ReturnType<typeof makeRng>, tips: number[][]) {
  for (let i = 0; i < LAYER_COUNT; i++) {
    const y = LAYER_START + i * LAYER_STEP;
    const u = (y - Y0) / (Y1 - Y0);
    const R = envelope(y) + 0.05;
    const nb = Math.floor(6 + 12 * (1 - u));
    for (let b = 0; b < nb; b++) {
      const a = (TAU * (b + 0.5 * rng.random())) / nb + i * 0.77;
      const L = R * rng.uniform(0.85, 1.08);
      const n = Math.floor(25 + 270 * L);
      const d = [Math.cos(a), 0, Math.sin(a)];
      const side = [-Math.sin(a), 0, Math.cos(a)];
      for (let k = 0; k < n; k++) {
        const s = Math.pow(rng.random(), 0.65);
        const spread = (0.025 + 0.09 * s) * rng.normal();
        const sl = s * L;
        const p = [d[0] * sl + side[0] * spread, y + 0.06 * sl - 0.2 * sl * sl + 0.012 * rng.normal(), d[2] * sl + side[2] * spread];
        const nrm = [d[0] * 0.75 + 0.3 * rng.normal(), 0.55 + 0.3 * rng.normal(), d[2] * 0.75 + 0.3 * rng.normal()];
        const ny = nrm[1] / (Math.hypot(nrm[0], nrm[1], nrm[2]) + 1e-9);
        const ao = (0.3 + 0.7 * Math.pow(s, 1.3)) * rng.uniform(0.75, 1.1);
        const snow = s > 0.5 && rng.random() < 0.06 * s && ny > 0.5;
        const g = rng.random();
        const green = [0.1 + 0.12 * g, 0.48 + 0.38 * g, 0.18 + 0.14 * g];
        // flash exactly as the needle grows in, so a ring of light runs from the trunk out to the tips
        const grownAt = tierStart(i) + CORE_LEAD_S + GROW_OUT_S * s;
        q.add(p, nrm, snow ? WHITE : green, snow ? Kind.Snow : Kind.Needle, grownAt,
          { base: snow ? 1 : ao, hot: sparkle(SPARK_NEEDLE, grownAt) });
      }
      const tl = 0.93 * L;
      tips.push([d[0] * tl, y + 0.06 * tl - 0.2 * tl * tl, d[2] * tl]);
    }
  }

}

function addInnerAndTrunk(q: Builder, rng: ReturnType<typeof makeRng>) {
  for (let k = 0; k < 6000; k++) {
    const y = Y0 + (Y1 - 0.1 - Y0) * rng.random();
    const phi = rng.random() * TAU;
    const r = 0.6 * envelope(y);
    q.add([Math.cos(phi) * r, y, Math.sin(phi) * r], [Math.cos(phi), 0.3, Math.sin(phi)], [0.1, 0.42, 0.16], Kind.Inner,
      lightReaches(y), { base: 0.75, hot: sparkle(SPARK_INNER, lightReaches(y)) });
  }
  for (let k = 0; k < 1500; k++) {
    const y = GROUND + rng.random() * (Y0 + 0.1 - GROUND);
    const phi = rng.random() * TAU;
    const bark = 0.75 + 0.25 * Math.sign(Math.sin(phi * 30 + y * 5));
    q.add([Math.cos(phi) * 0.08, y, Math.sin(phi) * 0.08], [Math.cos(phi), 0, Math.sin(phi)],
      [0.42 * bark, 0.26 * bark, 0.13 * bark], Kind.Trunk, lightReaches(y), { hot: sparkle(SPARK_TRUNK, lightReaches(y)) });
  }
}

function addGarland(q: Builder, rng: ReturnType<typeof makeRng>) {
  const N = 2600;
  const JITTER = 0.013;
  // Fewer turns = a steeper climb per pass, so the front of each loop reads as a diagonal, not a flat band.
  const TURNS = 2.2;
  for (let strand = 0; strand < 4; strand++) {
    for (let k = 0; k < N; k++) {
      const u = k / (N - 1);
      // starts down among the drooping lowest branches, so the garland wraps from the very base
      const yg = GARLAND_START_Y + (Y1 - 0.26 - GARLAND_START_Y) * u;
      const ag = TAU * TURNS * u + 0.9;
      const rg = envelope(yg) + 0.1; // a little proud of the needles so branches don't hide it
      const p = [Math.cos(ag) * rg + JITTER * rng.normal(), yg - 0.07 * Math.abs(Math.sin(ag * 2.5)) + JITTER * rng.normal(),
        Math.sin(ag) * rg + JITTER * rng.normal()];
      const nrm = [Math.cos(ag) + 0.6 * rng.normal(), 0.3 + 0.6 * rng.normal(), Math.sin(ag) + 0.6 * rng.normal()];
      const t0 = T_GARLAND[0] + u * (T_GARLAND[1] - T_GARLAND[0]);
      // hot = t0: each bit of garland lights up white the moment it is wound on (see render.ts)
      q.add(p, nrm, TINSEL_GOLD, Kind.Tinsel, t0, { phase: rng.random() * TAU, hot: t0 });
    }
  }
}

function addBaubles(q: Builder, rng: ReturnType<typeof makeRng>): { c: number[]; r: number; t0: number }[] {
  const sphere = fibSphere(160);
  const placed: { c: number[]; r: number; t0: number }[] = [];
  for (let k = 0; k < 34; k++) {
    const u = (k + rng.random()) / 34;
    const y = Y0 + 0.08 + u * (Y1 - Y0 - 0.38);
    const a = k * 2.39996 + rng.random() * 0.4;
    const c = [Math.cos(a) * envelope(y), y - 0.03, Math.sin(a) * envelope(y)];
    const rad = 0.058 + 0.032 * (1 - u);
    const t0 = T_BALLS[0] + rng.random() * (T_BALLS[1] - T_BALLS[0]);
    placed.push({ c, r: rad, t0 });
    for (const s of sphere) {
      q.add([c[0] + s[0] * rad, c[1] + s[1] * rad, c[2] + s[2] * rad], s, k % 2 === 0 ? RED : BAUBLE_GOLD, Kind.Ball, t0,
        { centre: c, pop: true, hot: t0 }); // pops in white-hot, then settles to red / gold
    }
  }
  return placed;
}

function addLights(q: Builder, rng: ReturnType<typeof makeRng>, tips: number[][]) {
  const order = tips.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const bulb = fibSphere(16);
  for (const idx of order.slice(0, 170)) {
    const c = tips[idx];
    const t0 = T_LIGHTS[0] + rng.random() * (T_LIGHTS[1] - T_LIGHTS[0]);
    const col = rng.random() < 0.8 ? WARM : [1.0, 0.95, 0.85];
    const phase = rng.random() * TAU;
    for (const s of bulb) {
      q.add([c[0] + s[0] * 0.03, c[1] + s[1] * 0.03, c[2] + s[2] * 0.03], s, col, Kind.Light, t0, { centre: c, phase, pop: true });
    }
  }
}

//               angle, dist, w,    h,    d,    rot, body,      ribbon
const GIFTS: [number, number, number, number, number, number, Rgb, Rgb][] = [
  [0.3, 1.12, 0.3, 0.24, 0.28, 0.4, RED, GOLD], [1.5, 1.18, 0.26, 0.3, 0.26, 0.9, BLUE_BOX, WHITE],
  [2.6, 1.1, 0.34, 0.18, 0.26, 1.0, GOLD, RED], [3.7, 1.18, 0.24, 0.26, 0.24, 0.6, WHITE, GREEN_BOX],
  [4.7, 1.12, 0.3, 0.22, 0.3, 0.1, GREEN_BOX, RED], [5.6, 1.22, 0.22, 0.2, 0.22, 0.7, BLUE_BOX, GOLD],
];

function boxPoint(face: number, fa: number, fb: number, w: number, h: number, d: number): [number[], number[]] {
  switch (face) {
    case 0: return [[fa * w, h, fb * d], [0, 1, 0]];
    case 1: return [[w / 2, (fa + 0.5) * h, fb * d], [1, 0, 0]];
    case 2: return [[-w / 2, (fa + 0.5) * h, fb * d], [-1, 0, 0]];
    case 3: return [[fa * w, (fb + 0.5) * h, d / 2], [0, 0, 1]];
    default: return [[fa * w, (fb + 0.5) * h, -d / 2], [0, 0, -1]];
  }
}

function addPresents(q: Builder, rng: ReturnType<typeof makeRng>) {
  const loop = fibSphere(80);
  const RW = 0.028;
  GIFTS.forEach(([a, dist, w, h, d, rot, body, rib], g) => {
    const areas = [w * d, h * d, h * d, h * w, h * w];
    const total = areas.reduce((s, v) => s + v, 0);
    const centre = [Math.cos(a) * dist, GROUND, Math.sin(a) * dist];
    const t0 = T_GIFTS[0] + (g * (T_GIFTS[1] - T_GIFTS[0])) / GIFTS.length;
    const place = (p: number[], nrm: number[], ribbon: boolean) => {
      const rp = rotY(p, rot);
      q.add([rp[0] + centre[0], rp[1] + centre[1], rp[2] + centre[2]], rotY(nrm, rot), ribbon ? rib : body,
        ribbon ? Kind.Ribbon : Kind.Gift, t0,
        // white flash sweeping up from the base (local y 0) to the top of the bow
        { base: ribbon ? 1 : 0.9, centre, pop: true, hot: t0 + GIFT_SWEEP_S * Math.min(Math.max(p[1] / (h + 0.06), 0), 1) });
    };
    const m = Math.floor(5000 * total);
    for (let k = 0; k < m; k++) {
      let r = rng.random() * total;
      let face = 0;
      while (face < 4 && r >= areas[face]) r -= areas[face++];
      const [p, nrm] = boxPoint(face, rng.random() - 0.5, rng.random() - 0.5, w, h, d);
      const onRib = face === 0 ? Math.abs(p[0]) < RW || Math.abs(p[2]) < RW : face <= 2 ? Math.abs(p[2]) < RW : Math.abs(p[0]) < RW;
      place(p, nrm, onRib);
    }
    // the bow: two flattened loops and a knot on top
    const bow: number[][] = [];
    for (const sx of [-1, 1]) for (const s of loop) bow.push([s[0] * 0.055 + sx * 0.05, s[1] * 0.035 + h + 0.03, s[2] * 0.025]);
    for (const s of loop.slice(0, 30)) bow.push([s[0] * 0.022, s[1] * 0.022 + h + 0.02, s[2] * 0.022]);
    for (const p of bow) place(p, [p[0], p[1] - h, p[2]], true);
  });
}

export function buildModel(): Model {
  const rng = makeRng(7);
  sparkRandom = makeRng(99).random;
  const q = new Builder();
  const tips: number[][] = [];
  addNeedles(q, rng, tips);
  addInnerAndTrunk(q, rng);
  addGarland(q, rng);
  const baubles = addBaubles(q, rng);
  q.shadeFoliageNear(baubles);
  addLights(q, rng, tips);
  addPresents(q, rng);
  return q.finish();
}

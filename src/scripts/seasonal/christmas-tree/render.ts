/**
 * Projects the point cloud into an ASCII grid (char + colour per cell) and
 * paints it to a canvas. Ported from scene()/star() in christmas_tree.py,
 * minus the sky, snow, ground, message and HUD.
 */
import { GOLD, Kind, T_STAR, TAU, Y1, type Model } from './model';

// grid + camera (re-framed so the tree and presents fill a compact card)
export const COLS = 70;
export const ROWS = 38;
export const CELL_W = 10;
export const CELL_H = 17;
const ASPECT = CELL_H / CELL_W;
const CAM_D = 5.2;
const CAM_Y = 0.1;
// ROWS * FOV is the on-screen scale; the extra rows (vs. the tree's footprint) are headroom for the star.
const SCALE_ROWS = 54.4;
const FOV = SCALE_ROWS / ROWS;
const HORIZON = 20.32 / ROWS;
/** World height of the star's centre: lifted clear of the tip so its shape reads on its own. */
const STAR_Y = Y1 + 0.44;
const ROT_SPEED = 17.76; // degrees per second
const HOT_TIME = 0.45;
const COOL_TIME = 0.12;
const HOT: readonly number[] = [1.35, 1.35, 1.3];
const LEVELS = 16;
/** Ambient light on baubles; lower = deeper shadow on their far side. */
const BALL_AMBIENT = 0.18;

const unit3 = (v: number[]) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((x) => x / l);
};
const LIGHT_DIR = unit3([-0.45, 0.55, -0.7]);
const HALF_VEC = unit3([LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2] - 1]);

const RAMPS = [
  ' .,:-~=+*^vx%&#WM@', // needle
  ' .:+*oO@', // snow
  ' .,:-~=+*^vx%&#WM@', // inner
  ' .:|!I#H', // trunk
  ' -~~==**', // tinsel (no '.' level: the garland should always read as a line)
  ' .:oO00@', // ball
  ' .oO@@', // light
  ' .:=+x%#@', // gift
  ' .:xX#@', // ribbon
];
/** LUT[kind][level] -> glyph ('' = empty cell). */
const LUT = RAMPS.map((r) =>
  Array.from({ length: LEVELS }, (_, i) => {
    const ch = r[Math.floor((i * (r.length - 1)) / (LEVELS - 1) + 0.5)];
    return ch === ' ' ? '' : ch;
  }),
);

export interface Frame {
  chars: string[];
  /** r, g, b per cell (0..~1.5; >1 means "glows"). */
  colors: Float32Array;
}

export function createFrame(): Frame {
  return { chars: new Array(COLS * ROWS).fill(''), colors: new Float32Array(COLS * ROWS * 3) };
}

const clamp = (x: number, lo = 0, hi = 1) => Math.min(Math.max(x, lo), hi);
const smooth = (x: number) => {
  const c = clamp(x);
  return c * c * (3 - 2 * c);
};
const easeOutBack = (x: number) => {
  const c = clamp(x) - 1;
  return 1 + 2.70158 * c ** 3 + 1.70158 * c ** 2;
};

// scratch buffers reused every frame
const zbuf = new Float32Array(COLS * ROWS);
const winner = new Int32Array(COLS * ROWS);
const scratch = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, age: 0 };

function setCell(f: Frame, idx: number, ch: string, r: number, g: number, b: number) {
  f.chars[idx] = ch;
  f.colors[idx * 3] = r;
  f.colors[idx * 3 + 1] = g;
  f.colors[idx * 3 + 2] = b;
}

function projectInto(m: Model, i: number, tb: number, cos: number, sin: number): number {
  const s = scratch;
  const age = tb - m.t0[i];
  const k = m.pop[i] ? easeOutBack(age / 0.35) : 1;
  const cx = m.centre[i * 3], cy = m.centre[i * 3 + 1], cz = m.centre[i * 3 + 2];
  const px = cx + (m.pos[i * 3] - cx) * k;
  const py = cy + (m.pos[i * 3 + 1] - cy) * k;
  const pz = cz + (m.pos[i * 3 + 2] - cz) * k;
  s.x = px * cos + pz * sin;
  s.y = py;
  s.z = -px * sin + pz * cos;
  s.age = age;
  const z = s.z + CAM_D;
  const tx = COLS / 2 + (s.x / z) * ROWS * FOV * ASPECT;
  const ty = ROWS * HORIZON - ((s.y - CAM_Y) / z) * ROWS * FOV;
  const ix = Math.floor(tx), iy = Math.floor(ty);
  if (ix < 0 || ix >= COLS || iy < 0 || iy >= ROWS) return -1;
  s.z = z;
  return iy * COLS + ix;
}

function shade(m: Model, i: number, f: Frame, cell: number, t: number, tb: number, cos: number, sin: number, z: number) {
  const nx0 = m.nrm[i * 3], ny = m.nrm[i * 3 + 1], nz0 = m.nrm[i * 3 + 2];
  const nx = nx0 * cos + nz0 * sin, nz = -nx0 * sin + nz0 * cos;
  const kind = m.kind[i];
  const age = tb - m.t0[i];
  const ph = m.phase[i];
  const diff = clamp(nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]);
  let lum = m.base[i] * (0.4 + 0.8 * diff);
  if (kind === Kind.Ball) {
    // low ambient so the side facing away from the light falls into real shadow; keep the highlight
    lum = m.base[i] * (BALL_AMBIENT + 1.0 * diff) + 1.1 * clamp(nx * HALF_VEC[0] + ny * HALF_VEC[1] + nz * HALF_VEC[2]) ** 24;
  }
  const sparkle = Math.sin(t * 9 + ph * 7) > 0.93;
  if (kind === Kind.Tinsel) lum = 0.7 + 0.4 * diff + (sparkle ? 0.8 : 0);
  if (kind === Kind.Light) lum = 0.75 + 0.35 * Math.sin(t * 3.1 + ph);

  // build front: a freshly grown layer flashes white-hot, then snaps to green
  const hot = m.hot[i];
  const grows = !Number.isNaN(hot);
  const hotAge = grows ? tb - hot : 1e9;
  const heat = hotAge < HOT_TIME ? 1 - (0.3 * hotAge) / HOT_TIME : clamp(0.7 * (1 - (hotAge - HOT_TIME) / COOL_TIME));
  const fadeIn = grows ? 1 : clamp(age / 0.35);
  lum *= fadeIn * clamp(1.5 - 0.1 * z, 0.6, 1.1);

  const level = Math.floor(clamp(lum) ** 0.8 * (LEVELS - 1));
  let glyph = LUT[kind][level];
  if (kind === Kind.Tinsel && sparkle) glyph = '*';
  if (heat > 0.25) glyph = '#';
  if (!glyph) return;
  const k = kind === Kind.Light ? 0.6 + 0.7 * lum : kind === Kind.Ball ? 0.2 + 0.9 * lum : 0.3 + 0.8 * lum;
  setCell(f, cell,  glyph,
    m.col[i * 3] * k * (1 - heat) + HOT[0] * heat,
    m.col[i * 3 + 1] * k * (1 - heat) + HOT[1] * heat,
    m.col[i * 3 + 2] * k * (1 - heat) + HOT[2] * heat);
}

function put(f: Frame, row: number, col: number, ch: string, tint: number[], lum: number) {
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
  setCell(f, row * COLS + col, ch, tint[0] * lum, tint[1] * lum, tint[2] * lum);
}

function inStar(px: number, py: number, poly: number[][]): boolean {
  let res = false;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    if (y1 > py !== y2 > py && px < ((x2 - x1) * (py - y1)) / (y2 - y1 + 1e-12) + x1) res = !res;
  }
  return res;
}

function drawStar(f: Frame, cx: number, cy: number, size: number, t: number, power: number, flash: number) {
  const tint = GOLD.map((g) => g + (1 - g) * flash);
  const pw = power * (1 + 1.6 * flash);
  for (let k = 0; k < 8; k++) {
    const ang = (k * TAU) / 8 + 0.1 * Math.sin(t * 0.7);
    if (Math.sin(ang) < -0.3) continue; // no rays down into the tree
    const length = size * (1.7 + 0.5 * Math.sin(t * 2.3 + k * 1.7)) * (1 + 1.5 * flash);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const ch = Math.abs(dy) < 0.38 ? '-' : Math.abs(dx) < 0.38 ? '|' : dx * dy > 0 ? '/' : '\\';
    for (let r = size * 0.8; r < length; r += 0.5) {
      const fade = 1 - r / length;
      put(f, Math.round(cy - r * dy), Math.round(cx + r * dx * ASPECT), fade < 0.25 ? '.' : ch, tint, pw * (0.35 + 0.65 * fade));
    }
  }
  const poly = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * TAU) / 10;
    const rad = (i % 2 === 0 ? 1 : 0.45) * size;
    return [Math.cos(a) * rad, Math.sin(a) * rad];
  });
  for (let row = Math.max(Math.floor(cy - size - 1), 0); row < Math.min(Math.floor(cy + size + 2), ROWS); row++) {
    for (let col = Math.max(Math.floor(cx - size * ASPECT - 1), 0); col < Math.min(Math.floor(cx + size * ASPECT + 2), COLS); col++) {
      const px = (col - cx) / ASPECT, py = row - cy;
      if (!inStar(px, py, poly)) continue;
      const dist = Math.hypot(px, py) / Math.max(size, 1e-3);
      const glyph = dist < 0.3 ? '@' : dist < 0.6 ? '#' : '*';
      put(f, row, col, glyph, tint, pw * (1.25 - 0.4 * dist));
    }
  }
}

/**
 * @param t  wall time (drives rotation, twinkle)
 * @param tb build time (drives the grow/decorate timeline; clamp it to stop the build)
 */
export function renderScene(m: Model, f: Frame, t: number, tb: number): void {
  f.chars.fill('');
  f.colors.fill(0);
  zbuf.fill(Infinity);
  winner.fill(-1);
  const theta = (ROT_SPEED * t * Math.PI) / 180;
  const cos = Math.cos(theta), sin = Math.sin(theta);

  for (let i = 0; i < m.n; i++) {
    if (tb < m.t0[i]) continue;
    const cell = projectInto(m, i, tb, cos, sin);
    if (cell < 0 || scratch.z >= zbuf[cell]) continue;
    zbuf[cell] = scratch.z;
    winner[cell] = i;
  }
  for (let cell = 0; cell < winner.length; cell++) {
    const i = winner[cell];
    if (i >= 0) shade(m, i, f, cell, t, tb, cos, sin, zbuf[cell]);
  }

  if (tb > T_STAR) {
    const on = smooth((tb - T_STAR) / 0.3);
    const flash = clamp(1 - (tb - T_STAR) / 1.0) ** 2;
    const z = CAM_D;
    const cx = COLS / 2;
    const cy = ROWS * HORIZON - ((STAR_Y - CAM_Y) / z) * ROWS * FOV;
    drawStar(f, Math.round(cx), Math.round(cy), (2 + 2.2 * on) * (1 + 0.05 * Math.sin(t * 3)), t, on, flash);
  }
}

/** Cells brighter than this (max channel) are copied to the bloom layer. */
const GLOW_THRESHOLD = 0.62;

/**
 * Paint a frame. `glow` receives only the over-bright cells; CSS blurs it into a bloom.
 * The tree always sits on black (the dark page, or its own black backdrop on the light
 * theme — see ChristmasTree.astro), so one full-strength palette serves both themes.
 */
export function paint(f: Frame, ctx: CanvasRenderingContext2D, glow: CanvasRenderingContext2D | null): void {
  const w = COLS * CELL_W, h = ROWS * CELL_H;
  ctx.clearRect(0, 0, w, h);
  glow?.clearRect(0, 0, w, h);
  for (let idx = 0; idx < f.chars.length; idx++) {
    const ch = f.chars[idx];
    if (!ch) continue;
    const r = Math.min(f.colors[idx * 3], 1), g = Math.min(f.colors[idx * 3 + 1], 1), b = Math.min(f.colors[idx * 3 + 2], 1);
    const style = `rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0})`;
    const x = (idx % COLS) * CELL_W + CELL_W / 2;
    const y = Math.floor(idx / COLS) * CELL_H + CELL_H / 2;
    ctx.fillStyle = style;
    ctx.fillText(ch, x, y);
    if (glow && Math.max(r, g, b) > GLOW_THRESHOLD) {
      glow.fillStyle = style;
      glow.fillText(ch, x, y);
    }
  }
}

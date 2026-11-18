/**
 * Falling ASCII snow over the whole viewport (port of snow.py, minus the
 * snowfield and HUD). Three depth layers fall at different speeds with wind
 * and sway. Cells covered by any `[data-snow-shield]` element (e.g. the
 * Christmas tree) are skipped, so the snow never draws over them.
 */
import { collectShields, isShielded } from '../snow-shield';
const TAU = Math.PI * 2;
const CELL_W = 10;
const CELL_H = 16;
const FRAME_MS = 1000 / 30;
/** Fraction of snow.py's density; the page has text underneath, so keep it lighter. */
const DENSITY = 0.5;
const WIND = 0.9; // columns per second drifting sideways
const FONT = `${CELL_H - 2}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

// (count per 1000 cells, fall speed rows/s, brightness, glyphs)
const LAYERS: [number, [number, number], number, string][] = [
  [55, [1.2, 2.2], 0.42, '..+'], // far: tiny dim dots, slow
  [50, [2.2, 3.6], 0.7, '+.+'], // middle
  [18, [3.8, 6.0], 1.05, '++*'], // near: big bright flakes, fast
];
const SNOW_DARK = [0.85, 0.9, 1.0];
/** On a light page white flakes vanish; use a cool slate instead, and fainter so text stays easy to read. */
const SNOW_LIGHT = [0.45, 0.55, 0.75];
const LIGHT_PAGE_ALPHA = 0.6;

interface Flake {
  x: number; y: number; v: number; ph: number; sway: number; bright: number; ch: string; twin: boolean;
}

function makeFlakes(cols: number, rows: number): Flake[] {
  const flakes: Flake[] = [];
  for (const [perK, [v0, v1], bright, glyphs] of LAYERS) {
    const n = Math.round((perK * rows * cols * DENSITY) / 1000);
    for (let i = 0; i < n; i++) {
      flakes.push({
        x: Math.random() * cols, y: Math.random() * (rows + 2), v: v0 + (v1 - v0) * Math.random(),
        ph: Math.random() * TAU, sway: 0.5 + 1.5 * Math.random(), bright,
        ch: glyphs[Math.floor(Math.random() * glyphs.length)], twin: Math.random() < 0.12,
      });
    }
  }
  return flakes;
}

export function initSnowfall(canvas: HTMLCanvasElement): void {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) return; // decorative motion only: show nothing

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let cols = 0, rows = 0, flakes: Flake[] = [];
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const nextCols = Math.ceil(w / CELL_W), nextRows = Math.ceil(h / CELL_H);
    if (nextCols !== cols || nextRows !== rows) {
      cols = nextCols;
      rows = nextRows;
      flakes = makeFlakes(cols, rows);
    }
  };

  const isLightPage = () => document.documentElement.getAttribute('data-theme') !== 'dark';

  const draw = (t: number) => {
    ctx.clearRect(0, 0, cols * CELL_W, rows * CELL_H);
    const shields = collectShields();
    const light = isLightPage();
    const tint = light ? SNOW_LIGHT : SNOW_DARK;
    const alphaScale = light ? LIGHT_PAGE_ALPHA : 1;
    const flick = 0.8;
    for (const f of flakes) {
      const row = Math.floor(((f.y + f.v * t) % (rows + 2)) - 1);
      if (row < 0 || row >= rows) continue;
      const col = Math.floor((((f.x + (WIND * t * f.v) / 4 + f.sway * Math.sin(t * 0.9 + f.ph)) % cols) + cols) % cols);
      const lum = Math.min(f.bright * (flick + 0.2 * Math.sin(t * 4 + f.ph * 5)), 1) * alphaScale;
      ctx.fillStyle = `rgba(${(tint[0] * 255) | 0},${(tint[1] * 255) | 0},${(tint[2] * 255) | 0},${lum.toFixed(2)})`;
      for (let dx = 0; dx < (f.twin ? 2 : 1); dx++) {
        const x = ((col + dx) % cols) * CELL_W, y = row * CELL_H;
        if (!isShielded({ x, y, w: CELL_W, h: CELL_H }, shields)) ctx.fillText(f.ch, x, y);
      }
    }
  };

  let elapsed = 0, last = 0, raf = 0;
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    const dt = now - last;
    if (dt < FRAME_MS) return;
    last = now;
    elapsed += Math.min(dt, 100) / 1000;
    draw(elapsed);
  };
  const start = () => {
    if (raf || document.hidden || reduceMotion.matches) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  resize();
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', (e) => {
    if (e.matches) {
      stop();
      ctx.clearRect(0, 0, cols * CELL_W, rows * CELL_H);
    } else start();
  });
  start();
}

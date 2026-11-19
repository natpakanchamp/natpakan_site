import { BUILD_END_S, buildModel } from './model';
import { registerSnowShield } from '../snow-shield';
import { CELL_H, CELL_W, COLS, ROWS, createFrame, paint, renderScene, type Frame } from './render';

const FRAME_MS = 1000 / 30;
/** The build timeline ends shortly after the star lights up; after that the tree only turns. */

/** Frame shown when the visitor prefers reduced motion. */
const STILL_T = 17;
const FONT = `${CELL_H - 0.5}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

/** Snow is blocked only where the tree actually drew glyphs (plus one cell of margin), not its whole box. */
function treeHitTest(frame: Frame) {
  return (box: { x: number; y: number; w: number; h: number }, rect: DOMRect): boolean => {
    const cw = rect.width / COLS, ch = rect.height / ROWS;
    const c0 = Math.floor((box.x - rect.left) / cw) - 1, c1 = Math.floor((box.x + box.w - rect.left) / cw) + 1;
    const r0 = Math.floor((box.y - rect.top) / ch) - 1, r1 = Math.floor((box.y + box.h - rect.top) / ch) + 1;
    for (let r = Math.max(r0, 0); r <= Math.min(r1, ROWS - 1); r++) {
      for (let c = Math.max(c0, 0); c <= Math.min(c1, COLS - 1); c++) if (frame.solid[r * COLS + c]) return true; // the snowfield doesn't block snow
    }
    return false;
  };
}

function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(COLS * CELL_W * dpr);
  canvas.height = Math.round(ROWS * CELL_H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  return ctx;
}

export function initChristmasTree(root: HTMLElement): void {
  const main = root.querySelector<HTMLCanvasElement>('canvas[data-layer="main"]');
  const glowCanvas = root.querySelector<HTMLCanvasElement>('canvas[data-layer="glow"]');
  if (!main) return;
  const ctx = setupCanvas(main);
  const glow = glowCanvas ? setupCanvas(glowCanvas) : null;
  if (!ctx) return;

  const model = buildModel();
  const frame = createFrame();
  registerSnowShield(root, treeHitTest(frame));
  const draw = (t: number) => {
    renderScene(model, frame, t, Math.min(t, BUILD_END_S));
    paint(frame, ctx, glow);
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    draw(STILL_T);
    root.dataset.ready = 'true';
    return;
  }

  let elapsed = 0;
  let last = 0;
  let raf = 0;
  let onScreen = true;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    if (!last) last = now;
    const dt = now - last;
    if (dt < FRAME_MS) return;
    last = now;
    elapsed += Math.min(dt, 100) / 1000; // don't jump after a long stall
    draw(elapsed);
  };
  const start = () => {
    if (raf || !onScreen || document.hidden || reduceMotion.matches) return;
    last = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };

  // Only animate while visible: pauses offscreen and in background tabs.
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) start();
    else stop();
  }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', (e) => {
    if (e.matches) {
      stop();
      draw(STILL_T);
    } else start();
  });

  draw(0);
  root.dataset.ready = 'true';
  start();
}

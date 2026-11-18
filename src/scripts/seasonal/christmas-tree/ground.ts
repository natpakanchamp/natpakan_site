/**
 * Snowfield behind the tree (draw_ground() from snow.py): dotted all over, with
 * soft drifts ('-', '=') that get stronger close to the camera, turning with the
 * tree. Drawn first so the tree covers it; never glows, never blocks site snow.
 */
export interface GroundCamera {
  cols: number;
  rows: number;
  /** Row of the horizon. */
  horizon: number;
  /** rows × FOV: projection scale in rows. */
  scaleRows: number;
  /** Cell height / width. */
  aspect: number;
  camD: number;
  camY: number;
  groundY: number;
}

const GROUND_COL = [0.6, 0.67, 0.86];
/** Columns at each side over which the field fades out, so it melts into the backdrop. */
const EDGE_FADE_COLS = 9;

const smooth = (x: number) => {
  const c = Math.min(Math.max(x, 0), 1);
  return c * c * (3 - 2 * c);
};
const fract = (x: number) => x - Math.floor(x);
const hash = (i: number, j: number, seed: number) => fract(Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453);

/** Smooth 2D value noise in [0, 1). */
function valueNoise(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = smooth(x - xi), zf = smooth(z - zi);
  const top = hash(xi, zi, seed) * (1 - xf) + hash(xi + 1, zi, seed) * xf;
  const bot = hash(xi, zi + 1, seed) * (1 - xf) + hash(xi + 1, zi + 1, seed) * xf;
  return top * (1 - zf) + bot * zf;
}

export interface Ground {
  cells: Int32Array;
  gx: Float32Array;
  gz: Float32Array;
  near: Float32Array;
  fade: Float32Array;
}

/** Per-cell camera-space position of the floor, computed once. */
export function buildGround(cam: GroundCamera): Ground {
  const cells: number[] = [], gx: number[] = [], gz: number[] = [], near: number[] = [], fade: number[] = [];
  for (let r = 0; r < cam.rows; r++) {
    const below = r + 0.5 - cam.horizon;
    if (below <= 0.8) continue;
    const z = ((cam.camY - cam.groundY) * cam.scaleRows) / below;
    for (let c = 0; c < cam.cols; c++) {
      cells.push(r * cam.cols + c);
      gz.push(z);
      gx.push(((c + 0.5 - cam.cols / 2) / (cam.scaleRows * cam.aspect)) * z);
      near.push(below / (cam.rows - cam.horizon));
      fade.push(smooth(Math.min(c + 0.5, cam.cols - c - 0.5) / EDGE_FADE_COLS));
    }
  }
  return { cells: Int32Array.from(cells), gx: Float32Array.from(gx), gz: Float32Array.from(gz), near: Float32Array.from(near), fade: Float32Array.from(fade) };
}

export function drawGround(
  g: Ground,
  camD: number,
  theta: number,
  put: (cell: number, ch: string, r: number, gr: number, b: number) => void,
): void {
  const cos = Math.cos(theta), sin = Math.sin(theta);
  for (let i = 0; i < g.cells.length; i++) {
    const gx = g.gx[i], gz = g.gz[i], near = g.near[i];
    const wx = gx * cos - (gz - camD) * sin; // turn the field with the tree
    const wz = gx * sin + (gz - camD) * cos;
    const drift = 0.6 * valueNoise(wx * 3.5, wz * 3.5) + 0.4 * valueNoise(wx * 9, wz * 9, 3);
    const detail = Math.min(2.5 / gz, 1); // far away the drifts blur out
    const h = 0.5 + (drift - 0.5) * detail;
    const v = 0.22 * near + 1.1 * (h - 0.5);
    const ch = v < 0.24 ? '.' : v < 0.4 ? '-' : '=';
    const lum = (0.2 + 0.3 * near + 0.3 * (h - 0.5) * detail) * g.fade[i];
    if (lum <= 0.02) continue;
    put(g.cells[i], ch, GROUND_COL[0] * lum, GROUND_COL[1] * lum, GROUND_COL[2] * lum);
  }
}

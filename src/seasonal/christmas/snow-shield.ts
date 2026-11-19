/**
 * Lets decorations keep the snowfall off themselves.
 *
 * Any element with [data-snow-shield] blocks snow over its bounding box. An
 * element can instead register a precise hit test (e.g. the Christmas tree
 * reports only the cells it actually drew), so snow still falls through the
 * empty space around it.
 */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

type HitTest = (box: Box, rect: DOMRect) => boolean;

const hitTests = new WeakMap<Element, HitTest>();

export function registerSnowShield(el: Element, test: HitTest): void {
  hitTests.set(el, test);
}

export interface Shield {
  rect: DOMRect;
  test?: HitTest;
}

/** Visible shields intersecting the viewport, measured once per frame. */
export function collectShields(): Shield[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-snow-shield]'))
    .filter((el) => el.offsetParent !== null)
    .map((el) => ({ rect: el.getBoundingClientRect(), test: hitTests.get(el) }))
    .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight);
}

export function isShielded(box: Box, shields: Shield[]): boolean {
  for (const { rect, test } of shields) {
    const overlaps = box.x + box.w > rect.left && box.x < rect.right && box.y + box.h > rect.top && box.y < rect.bottom;
    if (overlaps && (!test || test(box, rect))) return true;
  }
  return false;
}

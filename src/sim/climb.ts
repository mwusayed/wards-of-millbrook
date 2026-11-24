// v0.9.4: ledges and platforms. The player can climb a box that is no taller than STEP_UP above
// their feet, and stand on any walkable top. Boxes taller than WALK_TOP_MAX are always walls.
// Pure geometry, so it is tested headlessly (tests/sim.test.ts).
export const STEP_UP = 0.6;
export const WALK_TOP_MAX = 1.2;

export interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number; h: number }

/** Highest walkable top under (x, z) that is no higher than `limit`. Ground is 0. */
export function walkTop(boxes: readonly Footprint[], x: number, z: number, limit: number): number {
  let top = 0;
  for (const b of boxes) {
    if (b.h > WALK_TOP_MAX || b.h > limit) continue;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && b.h > top) top = b.h;
  }
  return top;
}

/** Whether a walker standing at height y ignores this box while moving (it is climbable). */
export function climbable(b: Footprint, y: number, stepUp = STEP_UP): boolean {
  return b.h <= WALK_TOP_MAX && y + stepUp >= b.h - 0.05;
}

/** v0.9.4 mantle: the highest walkable top within reach of (x, z) that is at least 0.3 m above y, or 0.
 *  A jump pressed here is given enough speed to land on it (see main.ts). */
export function mantleTop(boxes: readonly Footprint[], x: number, z: number, y: number, reach = 0.8): number {
  let best = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const t = walkTop(boxes, x + Math.cos(a) * reach, z + Math.sin(a) * reach, WALK_TOP_MAX);
    if (t > y + 0.3 && t > best) best = t;
  }
  return best;
}

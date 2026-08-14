/**
 * Tileable procedural normal maps for the ocean — zero assets.
 * Heights are sums of sines with INTEGER wave numbers, which makes them
 * seamless under wrapping; the normals are computed from the analytic
 * gradient, so the maps are both tileable and smooth.
 */

export type PixelFn = (x: number, y: number, size: number) => [number, number, number, number];

interface Octave {
  fx: number;
  fy: number;
  ph: number;
  amp: number;
}

function makeOctaves(seed: number, count: number): Octave[] {
  let s = seed >>> 0;
  const out: Octave[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * 16807) % 2147483647;
    const fx = 1 + (s % 6);
    s = (s * 16807) % 2147483647;
    const fy = 1 + (s % 6);
    s = (s * 16807) % 2147483647;
    const ph = ((s % 1000) / 1000) * Math.PI * 2;
    s = (s * 16807) % 2147483647;
    const amp = 0.4 + ((s % 100) / 100) * 0.6;
    out.push({ fx, fy, ph, amp });
  }
  return out;
}

/** Height + analytic gradient at texture-space (u, v) in [0, 1]. */
function sample(osc: Octave[], u: number, v: number): { h: number; du: number; dv: number } {
  let h = 0;
  let du = 0;
  let dv = 0;
  for (const o of osc) {
    const a = 2 * Math.PI * (o.fx * u + o.fy * v) + o.ph;
    h += Math.sin(a) * o.amp;
    du += Math.cos(a) * o.fx * o.amp;
    dv += Math.cos(a) * o.fy * o.amp;
  }
  return { h, du: du * 2 * Math.PI, dv: dv * 2 * Math.PI };
}

/**
 * Build a tileable normal-map pixel function.
 * Strength tunes how bumpy the surface reads (0.1 = gentle, 0.2 = rough).
 */
export function tileableNormal(seed: number, octaves: number, strength: number): PixelFn {
  const osc = makeOctaves(seed, octaves);
  return (x: number, y: number, sizePx: number): [number, number, number, number] => {
    const u = x / sizePx;
    const v = y / sizePx;
    const { du, dv } = sample(osc, u, v);
    const gx = -du * strength;
    const gy = -dv * strength;
    const len = Math.sqrt(gx * gx + gy * gy + 1);
    const nx = gx / len * 0.5 + 0.5;
    const ny = gy / len * 0.5 + 0.5;
    return [Math.round(nx * 255), Math.round(ny * 255), 255, 255];
  };
}

/** Same noise basis for testing the seam continuity. */
export function tileableHeight(x: number, y: number, size: number, seed: number, octaves: number): number {
  return sample(makeOctaves(seed, octaves), x / size, y / size).h;
}

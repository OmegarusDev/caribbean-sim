/**
 * Tileable procedural normal maps for the ocean — zero assets, built on
 * the two constraints the professionals use (GPU Gems Ch. 1, Finch):
 *   1. Wave frequencies stay above the 4-texel aliasing floor — below it
 *      waves degrade into sawtooth mush, the classic "blobby" look.
 *   2. Amplitude is a constant ratio of wavelength, so every octave
 *      contributes equal slope and the gradient stays bounded — normals
 *      never saturate and the surface reads as a directionally coherent
 *      ripple field rather than noise.
 * Integer wave numbers make the field seamless under wrapping; the
 * normal maps are computed from the analytic gradient.
 */

export type PixelFn = (x: number, y: number, size: number) => [number, number, number, number];

export interface OceanSpec {
  /** crest-line wave numbers across the wind — small numbers = long streaks */
  fxMax: number;
  /** ripple wave numbers along the wind — keep <= size / 6 (the alias floor) */
  fyMax: number;
  /** amplitude-to-wavelength ratio constant — bounds every octave's slope */
  kAmp: number;
}

interface Octave {
  fx: number;
  fy: number;
  ph: number;
  amp: number;
}

export function oceanOctaves(seed: number, count: number, spec: OceanSpec): Octave[] {
  let s = seed >>> 0;
  const out: Octave[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * 16807) % 2147483647;
    const fx = 1 + (s % spec.fxMax);
    s = (s * 16807) % 2147483647;
    const fy = 2 + (s % Math.max(1, spec.fyMax - 1));
    s = (s * 16807) % 2147483647;
    const ph = ((s % 1000) / 1000) * Math.PI * 2;
    s = (s * 16807) % 2147483647;
    const amp = spec.kAmp / Math.max(fx, fy);
    out.push({ fx, fy, ph, amp });
  }
  return out;
}

/** Height + analytic gradient at texture-space (u, v) in [0, 1]. */
export function sampleOctaves(osc: Octave[], u: number, v: number): { h: number; du: number; dv: number } {
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
 * Worst-case slope of the combined field, per unit strength — used by
 * tests to guarantee the normals never saturate (the no-blob contract).
 * |du|, |dv| <= count * 2PI * kAmp for any octave table.
 */
export function maxSlope(spec: OceanSpec, count: number): number {
  return count * 2 * Math.PI * spec.kAmp;
}

/** Build a tileable normal-map pixel function. Strength tunes the tilt. */
export function tileableNormal(spec: OceanSpec, seed: number, count: number, strength: number): PixelFn {
  const osc = oceanOctaves(seed, count, spec);
  return (x: number, y: number, sizePx: number): [number, number, number, number] => {
    const u = x / sizePx;
    const v = y / sizePx;
    const { du, dv } = sampleOctaves(osc, u, v);
    const gx = -du * strength;
    const gy = -dv * strength;
    const len = Math.sqrt(gx * gx + gy * gy + 1);
    const nx = gx / len * 0.5 + 0.5;
    const ny = gy / len * 0.5 + 0.5;
    return [Math.round(nx * 255), Math.round(ny * 255), 255, 255];
  };
}

/** Height of the same noise basis, for analytic testing. */
export function tileableHeight(x: number, y: number, size: number, spec: OceanSpec, seed: number, count: number): number {
  return sampleOctaves(oceanOctaves(seed, count, spec), x / size, y / size).h;
}

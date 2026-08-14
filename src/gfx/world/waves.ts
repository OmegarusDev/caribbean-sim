/**
 * The shared wave field — ONE model, several consumers.
 *
 * The GLSL water shader displaces vertices from it, the game layer samples
 * it (waveHeight) so ships ride the exact same surface, and both derive the
 * octave DIRECTIONS from the wind — a sea reads as "the sea" the instant its
 * swells align with the wind.
 *
 * Two time scales: a majestic slow swell (period ~30s — the horizon slowly
 * breathes) plus faster swells and a fine ripple. Scale discipline: the
 * dominant wavelengths must be much longer than the camera footprint or the
 * horizon rocks.
 */

export interface Wave {
  /** Angle offset from the wind direction, radians. */
  rel: number;
  amp: number;
  freq: number;
  speed: number;
}

export const OCEAN_WAVES: Wave[] = [
  { rel: 0.3, amp: 2.0, freq: 0.002, speed: 0.2 },
  { rel: -0.9, amp: 0.9, freq: 0.004, speed: 0.35 },
  { rel: 1.8, amp: 0.6, freq: 0.0065, speed: 0.5 },
  { rel: -2.4, amp: 0.35, freq: 0.011, speed: 0.7 },
  { rel: 0.6, amp: 0.22, freq: 0.02, speed: 1.0 },
  { rel: -1.2, amp: 0.14, freq: 0.038, speed: 1.4 },
];

/** Surface height at a world (x, z) at time t, for wind direction. */
export function waveHeight(x: number, z: number, t: number, windDir: number): number {
  let h = 0;
  for (const w of OCEAN_WAVES) {
    const dx = Math.cos(windDir + w.rel);
    const dy = Math.sin(windDir + w.rel);
    const d = x * dx + z * dy;
    h += Math.sin(d * w.freq + t * w.speed) * w.amp;
  }
  return h;
}

/** The wave field as GLSL octaves (wind-relative), for the water shader. */
export function waveOctavesGLSL(): string {
  let out = '';
  for (const w of OCEAN_WAVES) {
    out +=
      `  h += sin(dot(p, vec2(cos(wind + ${w.rel.toFixed(3)}), sin(wind + ${w.rel.toFixed(3)}))) * ${w.freq} + u_time * ${w.speed}) * ${w.amp};\n`;
  }
  return out;
}

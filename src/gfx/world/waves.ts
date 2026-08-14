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

/**
 * Earth's gravity in world units — the sea obeys it. Every wave's angular
 * frequency is DERIVED from its wavelength by the deep-water dispersion
 * relation omega = sqrt(g * k): long swells genuinely outrun the chop, and
 * the whole field stays phase-coherent, exactly as a real sea does.
 */
export const GRAVITY = 9.8;

/** Angular frequency of a wave of wave-number k: the dispersion relation. */
export const waveOmega = (k: number): number => Math.sqrt(GRAVITY * k);

export interface Wave {
  /** Angle offset from the wind direction, radians. */
  rel: number;
  amp: number;
  freq: number;
  /**
   * Gerstner choppiness, 0..1 (GPU Gems Ch. 1). The crest leans into the
   * direction of travel by Q * A — sharp peaks, broad troughs, instead of
   * the sine wave's rounded roll. Zero on the long swells: their gentle
   * arcs are what make the horizon breathe.
   */
  q: number;
}

export const OCEAN_WAVES: Wave[] = [
  { rel: 0.3, amp: 2.0, freq: 0.002, q: 0 },
  { rel: -0.9, amp: 0.9, freq: 0.004, q: 0 },
  { rel: 1.8, amp: 0.6, freq: 0.0065, q: 0.35 },
  { rel: -2.4, amp: 0.35, freq: 0.011, q: 0.5 },
  { rel: 0.6, amp: 0.22, freq: 0.02, q: 0.7 },
  { rel: -1.2, amp: 0.14, freq: 0.038, q: 0.8 },
];

/** Surface height at a world (x, z) at time t, for wind direction. */
export function waveHeight(x: number, z: number, t: number, windDir: number): number {
  let h = 0;
  for (const w of OCEAN_WAVES) {
    const dx = Math.cos(windDir + w.rel);
    const dy = Math.sin(windDir + w.rel);
    const d = x * dx + z * dy;
    h += Math.sin(d * w.freq + t * waveOmega(w.freq)) * w.amp;
  }
  return h;
}

/**
 * Format a number as a GLSL float literal — always with a decimal point.
 * (GLSL has no implicit int->float conversion: `u_time * 1` is a compile
 * error on the real GPU.)
 */
export const fmtGLSL = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/**
 * GLSL has no implicit int->float conversion (ANGLE rejects `u_time * 1`).
 * Every number emitted into a shader must carry a decimal point.
 */
/** The wave field as GLSL height octaves (wind-relative), for the water shader. */
export function waveOctavesGLSL(): string {
  let out = '';
  for (const w of OCEAN_WAVES) {
    out +=
      `  h += sin(dot(p, vec2(cos(wind + ${w.rel.toFixed(3)}), sin(wind + ${w.rel.toFixed(3)}))) * ${w.freq} + u_time * ${fmtGLSL(waveOmega(w.freq))}) * ${fmtGLSL(w.amp)};\n`;
  }
  return out;
}

/** Gerstner choppiness: crests lean into the direction of travel. */
export function waveChopGLSL(): string {
  let out = '';
  for (const w of OCEAN_WAVES) {
    if (w.q > 0) {
      out +=
        `  p += vec2(cos(wind + ${w.rel.toFixed(3)}), sin(wind + ${w.rel.toFixed(3)})) * cos(dot(p, vec2(cos(wind + ${w.rel.toFixed(3)}), sin(wind + ${w.rel.toFixed(3)}))) * ${w.freq} + u_time * ${fmtGLSL(waveOmega(w.freq))}) * ${fmtGLSL(w.amp)} * ${fmtGLSL(w.q)};\n`;
    }
  }
  return out;
}

/**
 * The long swells alone — the local mean the short chop rises above.
 * Foam forms on the crests of the fast waves, not on the swells' faces.
 */
export function waveSwellGLSL(): string {
  let out = '';
  for (const w of OCEAN_WAVES) {
    if (w.q === 0) {
      out +=
        `  s += sin(dot(p, vec2(cos(wind + ${w.rel.toFixed(3)}), sin(wind + ${w.rel.toFixed(3)}))) * ${w.freq} + u_time * ${fmtGLSL(waveOmega(w.freq))}) * ${fmtGLSL(w.amp)};\n`;
    }
  }
  return out;
}

/**
 * Procedural textures — zero-asset pixels, generated once per key and cached.
 * Canvas-drawn noise/detail feeds materials (sail parchment, wood grain,
 * water swell) without a single external image.
 */
import type { GlContext, GlHandle } from './context';

const cache = new Map<string, WebGLTexture>();

export interface TextureSpec {
  size: number;
  /** Fill each pixel: (x, y, size) → [r, g, b, a] in 0..255. */
  pixel(x: number, y: number, size: number): [number, number, number, number];
  /** Wrap mode; textures tile world-space detail. */
  repeat?: boolean;
}

export function getProceduralTexture(gl: GlContext, key: string, spec: TextureSpec): WebGLTexture | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = buildTexture(gl.gl, spec);
  if (tex) cache.set(key, tex);
  return tex;
}

export function clearTextureCache(): void {
  cache.clear();
}

function buildTexture(gl: GlHandle, spec: TextureSpec): WebGLTexture | null {
  const { size, pixel, repeat } = spec;
  const buf = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_S,
    repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE,
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_WRAP_T,
    repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

/** Hash-based value noise, for procedural pixel fills. */
export function hashNoise(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 9746341;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

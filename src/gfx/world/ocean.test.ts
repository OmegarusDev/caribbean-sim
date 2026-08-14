import { describe, expect, it } from 'vitest';
import { tileableNormal, tileableHeight } from './ocean';

describe('tileable ocean normal generator', () => {
  it('produces valid encoded normals across the map', () => {
    const gen = tileableNormal(7, 4, 0.16);
    for (let i = 0; i < 64 * 64; i += 97) {
      const x = i % 64;
      const y = (i / 64) | 0;
      const c = gen(x, y, 64);
      expect(c[0]).toBeGreaterThanOrEqual(0);
      expect(c[0]).toBeLessThanOrEqual(255);
      expect(c[1]).toBeGreaterThanOrEqual(0);
      expect(c[1]).toBeLessThanOrEqual(255);
      expect(c[2]).toBe(255);
      const nx = (c[0] / 255) * 2 - 1;
      const ny = (c[1] / 255) * 2 - 1;
      expect(nx * nx + ny * ny).toBeLessThanOrEqual(1.0001);
    }
  });

  it('wraps exactly: the coordinate u=1 samples identically to u=0', () => {
    const gen = tileableNormal(23, 5, 0.1);
    for (let y = 0; y < 64; y += 7) {
      const a = gen(0, y, 64);
      const wrapped = gen(64, y, 64);
      expect(a).toEqual(wrapped);
    }
  });

  it('matches the analytic gradient at the origin', () => {
    const seed = 7;
    const size = 64;
    const gen = tileableNormal(seed, 4, 0.16);
    const c = gen(0, 0, size);
    // analytic gradient of the same noise at u=0, v=0 — the generator
    // should agree within one 8-bit step or two
    const e = 1e-4;
    const du = (tileableHeight(e, 0, 1, seed, 4) - tileableHeight(-e, 0, 1, seed, 4)) / (2 * e);
    const dv = (tileableHeight(0, e, 1, seed, 4) - tileableHeight(0, -e, 1, seed, 4)) / (2 * e);
    const gx = -du * 0.16;
    const gy = -dv * 0.16;
    const len = Math.sqrt(gx * gx + gy * gy + 1);
    const nx = gx / len * 0.5 + 0.5;
    const ny = gy / len * 0.5 + 0.5;
    expect(Math.abs(c[0] - Math.round(nx * 255))).toBeLessThanOrEqual(2);
    expect(Math.abs(c[1] - Math.round(ny * 255))).toBeLessThanOrEqual(2);
  });
});

import { describe, expect, it } from 'vitest';
import { tileableNormal, tileableHeight, oceanOctaves, sampleOctaves, maxSlope, type OceanSpec } from './ocean';

const FINE: OceanSpec = { fxMax: 2, fyMax: 12, kAmp: 0.55 };
const COARSE: OceanSpec = { fxMax: 2, fyMax: 8, kAmp: 0.55 };

describe('tileable ocean normal generator', () => {
  it('produces valid encoded normals across the map', () => {
    const gen = tileableNormal(FINE, 7, 5, 0.012);
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

  it('never saturates: the slope bound holds at every pixel (the no-blob contract)', () => {
    const bound = maxSlope(FINE, 5) * 0.012;
    for (const [spec, seed, count, strength] of [
      [FINE, 7, 5, 0.012],
      [COARSE, 23, 4, 0.028],
    ] as const) {
      const gen = tileableNormal(spec, seed, count, strength);
      for (let i = 0; i < 64 * 64; i += 11) {
        const x = i % 64;
        const y = (i / 64) | 0;
        const c = gen(x, y, 64);
        const nx = (c[0] / 255) * 2 - 1;
        const ny = (c[1] / 255) * 2 - 1;
        expect(Math.abs(nx)).toBeLessThan(maxSlope(spec, count) * strength * 1.05);
        expect(Math.abs(ny)).toBeLessThan(maxSlope(spec, count) * strength * 1.05);
      }
    }
    expect(bound).toBeGreaterThan(0);
  });

  it('wraps exactly: the coordinate u=1 samples identically to u=0', () => {
    const gen = tileableNormal(COARSE, 23, 4, 0.028);
    for (let y = 0; y < 64; y += 7) {
      const a = gen(0, y, 64);
      const wrapped = gen(64, y, 64);
      expect(a).toEqual(wrapped);
    }
  });

  it('matches the analytic gradient at the origin', () => {
    const seed = 7;
    const strength = 0.012;
    const gen = tileableNormal(FINE, seed, 5, strength);
    const osc = oceanOctaves(seed, 5, FINE);
    const { du, dv } = sampleOctaves(osc, 0, 0);
    const gx = -du * strength;
    const gy = -dv * strength;
    const len = Math.sqrt(gx * gx + gy * gy + 1);
    const nx = gx / len * 0.5 + 0.5;
    const ny = gy / len * 0.5 + 0.5;
    const c = gen(0, 0, 64);
    expect(Math.abs(c[0] - Math.round(nx * 255))).toBeLessThanOrEqual(2);
    expect(Math.abs(c[1] - Math.round(ny * 255))).toBeLessThanOrEqual(2);
    expect(tileableHeight(0, 0, 64, FINE, seed, 5)).toBeCloseTo(sampleOctaves(osc, 0, 0).h, 6);
  });

  it('stays above the 4-texel alias floor', () => {
    // The shortest along-wind wavelength must cover at least 4 texels.
    expect(64 / FINE.fyMax).toBeGreaterThanOrEqual(4);
    expect(128 / COARSE.fyMax).toBeGreaterThanOrEqual(4);
  });
});

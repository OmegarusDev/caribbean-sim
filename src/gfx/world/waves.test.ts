import { describe, expect, it } from 'vitest';
import { OCEAN_WAVES, buildWaterVS, waveHeight } from './waves';

describe('shared wave field', () => {
  it('heights stay bounded — the sea is a gentle plane, not a storm', () => {
    const maxAmp = OCEAN_WAVES.reduce((a, w) => a + w.amp, 0);
    expect(maxAmp).toBeLessThan(2.5); // ±1.2 max heave
    for (let i = 0; i < 2000; i++) {
      const x = Math.sin(i * 12.9898) * 5000;
      const z = Math.cos(i * 78.233) * 5000;
      const t = (i % 400) / 10;
      const h = waveHeight(x, z, t);
      expect(Math.abs(h)).toBeLessThan(maxAmp + 0.001);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  it('wavelengths are long relative to the camera footprint (no horizon rocking)', () => {
    // The camera world footprint is ~1500 units at max dolly; the two
    // dominant swells must be several times longer than the view.
    const sorted = [...OCEAN_WAVES].sort((a, b) => a.freq - b.freq);
    const longestWavelength = (2 * Math.PI) / sorted[0]!.freq;
    expect(longestWavelength).toBeGreaterThan(1400);
  });

  it('the GLSL is generated from the same constants as the JS evaluator', () => {
    const glsl = buildWaterVS();
    for (const w of OCEAN_WAVES) {
      expect(glsl).toContain(`* ${w.amp};`);
      expect(glsl).toContain(`* ${w.freq}`);
      expect(glsl).toContain(`+ t * ${w.speed})`);
    }
  });
});

describe('water grid geometry', () => {
  it('positions are vec3 and indices stay in range', async () => {
    const { buildWaterGrid } = await import('./water');
    const { positions, indices } = buildWaterGrid(8, 400);
    expect(positions.length % 3).toBe(0);
    const verts = positions.length / 3;
    expect(verts).toBe(64); // 8x8
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(verts);
    }
    // grid covers the full span and sits at y=0
    const ys = positions.filter((_, i) => i % 3 === 1);
    expect(new Set(ys)).toEqual(new Set([0]));
  });
});

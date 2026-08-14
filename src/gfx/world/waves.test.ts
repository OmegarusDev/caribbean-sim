import { describe, expect, it } from 'vitest';
import { OCEAN_WAVES, waveHeight, waveChopGLSL, waveSwellGLSL } from './waves';

describe('shared wave field', () => {
  it('heights stay bounded — the sea is a gentle plane, not a storm', () => {
    const maxAmp = OCEAN_WAVES.reduce((a, w) => a + w.amp, 0);
    expect(maxAmp).toBeLessThan(5); // ±2.1 max heave — gentle at these scales
    for (let i = 0; i < 2000; i++) {
      const x = Math.sin(i * 12.9898) * 5000;
      const z = Math.cos(i * 78.233) * 5000;
      const t = (i % 400) / 10;
      const h = waveHeight(x, z, t, 0.6);
      expect(Math.abs(h)).toBeLessThan(maxAmp + 0.001);
      expect(Number.isFinite(h)).toBe(true);
    }
  });

  it('wavelengths are long relative to the camera footprint (no horizon rocking)', () => {
    // The camera world footprint is ~1500 units at max dolly; the two
    // dominant swells must be several times longer than the view.
    const sorted = [...OCEAN_WAVES].sort((a, b) => a.freq - b.freq);
    const longestWavelength = (2 * Math.PI) / sorted[0]!.freq;
    expect(longestWavelength).toBeGreaterThan(2800); // the majestic swell
  });

  it('the water shader uses the same constants as the JS evaluator', async () => {
    const { WATER_VS } = await import('../core/shaders');
    for (const w of OCEAN_WAVES) {
      // Tolerant presence checks: "2" matches the shader's "2.0", and so on.
      expect(WATER_VS).toContain(String(w.amp));
      expect(WATER_VS).toContain(`* ${w.freq}`);
      expect(WATER_VS).toContain(String(w.speed));
    }
    // the octave directions derive from the wind in both consumers
    expect(WATER_VS).toContain('cos(wind + 0.300)');
    expect(WATER_VS).toContain('sin(wind + 0.300)');
  });

  it('Gerstner choppiness: crests lean, never loops', () => {
    for (const w of OCEAN_WAVES) {
      expect(w.q).toBeGreaterThanOrEqual(0);
      expect(w.q).toBeLessThanOrEqual(1);
    }
    const chop = waveChopGLSL();
    for (const w of OCEAN_WAVES) {
      if (w.q > 0) {
        expect(chop).toContain(`* ${w.amp} * ${w.q};`);
        // the displacement rides the same wind-relative direction
        expect(chop).toContain(`cos(wind + ${w.rel.toFixed(3)})`);
      } else {
        expect(chop).not.toContain(`* ${w.amp} *`);
      }
    }
  });

  it('swell octaves are the slow pair the chop rises above', () => {
    const swell = waveSwellGLSL();
    for (const w of OCEAN_WAVES) {
      const present = swell.includes(`* ${w.amp};`);
      expect(present).toBe(w.q === 0);
    }
  });
});
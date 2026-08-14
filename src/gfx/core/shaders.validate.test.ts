/**
 * GLSL syntax gate — every shader in the codebase is parsed in CI.
 * The black-screen episodes were all unvalidated shader edits that "looked
 * valid" but failed at runtime. This test makes a syntax error impossible
 * to ship; the fixture case proves the parser has teeth.
 *
 * The shaders are parsed as their EVALUATED values (template strings and
 * generated wave octaves are resolved), so the exact GLSL that gets
 * compiled is what the parser checks.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@shaderfrog/glsl-parser';
import * as shaders from './shaders';

const SHADERS = [
  'SHIP_VS',
  'SHIP_FS',
  'RING_VS',
  'RING_FS',
  'WATER_VS',
  'WATER_FS',
  'SKY_VS',
  'SKY_FS',
  'PARTICLE_VS',
  'PARTICLE_FS',
] as const;

describe('GLSL validation', () => {
  for (const name of SHADERS) {
    it(`${name} parses without syntax errors`, () => {
      const glsl = (shaders as unknown as Record<string, string>)[name];
      expect(glsl).toBeTruthy();
      expect(() => parse(glsl!)).not.toThrow();
    });
  }

  it('the parser has teeth — a broken shader must throw', () => {
    expect(() => parse('void main() { gl_Position = vec4(0.0; }')).toThrow();
  });

  it('no integer literals in float contexts — ANGLE has no int->float coercion', () => {
    // The black screen this catches: generated shaders emitted `* 2;` and
    // `u_time * 1` (JS numbers render without a decimal point), which the
    // GPU compiler rejects: float * const int has no acceptable conversion.
    // A decimal point or exponent is mandatory on every numeric literal
    // that follows an arithmetic operator.
    const INT_IN_FLOAT = /[*/+-]\s*\d+(?![\d.])/g;
    for (const name of SHADERS) {
      const glsl = (shaders as unknown as Record<string, string>)[name];
      const hits = glsl!.match(INT_IN_FLOAT) ?? [];
      expect(hits, `${name} has integer literals in float contexts: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('the wave field is fully embedded in the compiled water vertex shader', async () => {
    // The height octaves, the Gerstner chop, and the swell pair all reach
    // the shader via the emitters — the gate must verify the complete text.
    const { waveOctavesGLSL, waveChopGLSL, waveSwellGLSL } = await import('../world/waves');
    const vs = shaders.WATER_VS;
    expect(vs).toContain(waveOctavesGLSL());
    expect(vs).toContain(waveChopGLSL());
    expect(vs).toContain(waveSwellGLSL());
  });
});

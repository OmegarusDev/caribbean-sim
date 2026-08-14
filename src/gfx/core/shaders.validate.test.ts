/**
 * GLSL syntax gate — every shader in the codebase is parsed in CI.
 * The black-screen episodes were all unvalidated shader edits that "looked
 * valid" but failed at runtime. This test makes a syntax error impossible
 * to ship; the fixture case proves the parser has teeth.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@shaderfrog/glsl-parser';
import { readFileSync } from 'fs';
import { join } from 'node:path';

function extract(src: string, name: string): string | null {
  const m = src.match(
    new RegExp('export const ' + name + ' = `((?:\\$\\{COMMON_HEAD\\}|[^`])*)`;', 's'),
  );
  if (!m) return null;
  return m[1].replace('${COMMON_HEAD}', '#version 300 es\nprecision highp float;\n');
}

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
  const src = readFileSync(join(import.meta.dirname, 'shaders.ts'), 'utf8');

  for (const name of SHADERS) {
    it(`${name} parses without syntax errors`, () => {
      const glsl = extract(src, name);
      expect(glsl).toBeTruthy();
      expect(() => parse(glsl!)).not.toThrow();
    });
  }

  it('the parser has teeth — a broken shader must throw', () => {
    expect(() => parse('void main() { gl_Position = vec4(0.0; }')).toThrow();
  });
});

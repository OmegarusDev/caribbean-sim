/**
 * The definitive GLSL gate: every shader pair is COMPILED AND LINKED on a
 * real WebGL2 device (headless Chromium + SwiftShader ANGLE) in CI.
 *
 * The syntax parser has now let four GPU-rejecting shaders through:
 * integer literals in float contexts, duplicate uniform declarations,
 * exponent-form misses, and assignment to a vertex input. ANGLE rejects
 * them all at compile time — so this gate compiles, not parses.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { SHIP_VS, SHIP_FS, RING_VS, RING_FS, WATER_VS, WATER_FS, SKY_VS, SKY_FS, PARTICLE_VS, PARTICLE_FS } from './shaders';

const PAIRS: Record<string, [string, string]> = {
  SHIP: [SHIP_VS, SHIP_FS],
  RING: [RING_VS, RING_FS],
  WATER: [WATER_VS, WATER_FS],
  SKY: [SKY_VS, SKY_FS],
  PARTICLE: [PARTICLE_VS, PARTICLE_FS],
};

let browser: Browser | null = null;
let page: Page | null = null;

beforeAll(async () => {
  browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  page = await browser.newPage();
}, 90000);

afterAll(async () => {
  await browser?.close();
});

describe('GPU shader gate (SwiftShader ANGLE)', () => {
  it('every shader pair compiles AND links on a real WebGL2 device', async () => {
    const results = (await page!.evaluate(
      (pairs: Record<string, [string, string]>) => {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2');
        if (!gl) return [{ name: 'context', ok: false, log: 'no webgl2 context' }];
        const out: Array<{ name: string; ok: boolean; log: string }> = [];
        for (const [name, [vsSrc, fsSrc]] of Object.entries(pairs)) {
          const vs = gl.createShader(gl.VERTEX_SHADER)!;
          gl.shaderSource(vs, vsSrc);
          gl.compileShader(vs);
          const vsOk = gl.getShaderParameter(vs, gl.COMPILE_STATUS) as boolean;
          const vsLog = vsOk ? '' : (gl.getShaderInfoLog(vs) ?? '');
          const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
          gl.shaderSource(fs, fsSrc);
          gl.compileShader(fs);
          const fsOk = gl.getShaderParameter(fs, gl.COMPILE_STATUS) as boolean;
          const fsLog = fsOk ? '' : (gl.getShaderInfoLog(fs) ?? '');
          let linkOk = true;
          let linkLog = '';
          if (vsOk && fsOk) {
            const prog = gl.createProgram()!;
            gl.attachShader(prog, vs);
            gl.attachShader(prog, fs);
            gl.linkProgram(prog);
            linkOk = gl.getProgramParameter(prog, gl.LINK_STATUS) as boolean;
            linkLog = linkOk ? '' : (gl.getProgramInfoLog(prog) ?? '');
            gl.deleteProgram(prog);
          }
          out.push({
            name,
            ok: vsOk && fsOk && linkOk,
            log: [vsLog, fsLog, linkLog].filter(Boolean).join(' | '),
          });
          gl.deleteShader(vs);
          gl.deleteShader(fs);
        }
        return out;
      },
      PAIRS,
    )) as Array<{ name: string; ok: boolean; log: string }>;

    for (const r of results) {
      expect(r.ok, `${r.name}: ${r.log}`).toBe(true);
    }
  }, 60000);
});

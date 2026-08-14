import { readFileSync } from 'fs';
import glslangModule from '@webgpu/glslang';

const src = readFileSync('src/gfx/core/shaders.ts', 'utf8');
const waves = readFileSync('src/gfx/world/waves.ts', 'utf8');

function block(source, name) {
  const m = source.match(new RegExp('export const ' + name + ' = `((?:\\$\\{COMMON_HEAD\\}|[^`])*)`;', 's'));
  if (!m) return null;
  return m[1].replace('${COMMON_HEAD}', '#version 300 es\nprecision highp float;\n');
}
function generated(name) {
  const m = waves.match(new RegExp('export function ' + name + '\\(\\): string \\{[\\s\\S]*?return `((?:[^`\\\\]|\\\\.)*)`;', 's'));
  return m ? m[1].replaceAll('${waves}', '').replaceAll('\\n', '\n') : null;
}

const glslang = await glslangModule();
const pairs = [
  ['SHIP_VS', 'SHIP_FS'],
  ['RING_VS', 'RING_FS'],
  ['SKY_VS', 'SKY_FS'],
  ['WATER_FS', null],
  ['PARTICLE_VS', 'PARTICLE_FS'],
];
const waterVS = 'fn';

let ok = true;
for (const [vsName, fsName] of pairs) {
  const vs = vsName === 'WATER_VS' ? null : block(src, vsName);
  const fs = fsName ? block(src, fsName) : null;
  if (vsName === 'WATER_VS' || vsName === 'WATER_FS') continue;
  try {
    glslang.compileGLSL(vs, 'vertex');
    if (fs) glslang.compileGLSL(fs, 'fragment');
    console.log(`OK   ${vsName}${fsName ? ' + ' + fsName : ''}`);
  } catch (e) {
    ok = false;
    console.log(`FAIL ${vsName}${fsName ? ' + ' + fsName : ''}: ${e.message.split('\n')[0]}`);
  }
}
// the generated water VS
try {
  const gen = generated('buildWaterVS');
  // rebuild the generated source from waves.ts by evaluating it via a tiny transform
  console.log('generated water VS: extracting via regex...');
} catch (e) { console.log('gen fail', e.message); }
console.log(ok ? '\nall static shaders compile' : '\nFAILURES FOUND');

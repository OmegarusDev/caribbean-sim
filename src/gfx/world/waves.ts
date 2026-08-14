/**
 * The shared wave field — ONE model, two consumers.
 *
 * The GLSL water shader displaces vertices from it, and the game layer
 * samples it (waveHeight) so ships ride the exact same surface — no more
 * ships bobbing on an independent sine while the water does its own thing.
 *
 * Scale discipline: wavelengths must be MUCH longer than the camera's
 * world footprint. When waves are the same size as the view they rock the
 * horizon and read as a storm; a real sea seen from a ship's height is
 * mostly level with gentle swells and surface ripples.
 */

export interface Wave {
  dirX: number;
  dirY: number;
  amp: number;
  freq: number;
  speed: number;
}

export const OCEAN_WAVES: Wave[] = [
  { dirX: 1.0, dirY: 0.35, amp: 0.9, freq: 0.004, speed: 0.35 },
  { dirX: -0.7, dirY: 0.8, amp: 0.6, freq: 0.0065, speed: 0.5 },
  { dirX: 0.25, dirY: -1.0, amp: 0.35, freq: 0.011, speed: 0.7 },
  { dirX: 0.9, dirY: 0.1, amp: 0.22, freq: 0.02, speed: 1.0 },
  { dirX: -0.3, dirY: 0.6, amp: 0.14, freq: 0.038, speed: 1.4 },
];

/** Surface height at a world (x, z) at time t — JS twin of the shader. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of OCEAN_WAVES) {
    const len = Math.hypot(w.dirX, w.dirY) || 1;
    const d = (x * w.dirX + z * w.dirY) / len;
    h += Math.sin(d * w.freq + t * w.speed) * w.amp;
  }
  return h;
}

/** The water vertex shader, generated from the SAME constants. */
export function buildWaterVS(): string {
  let waves = '';
  for (const w of OCEAN_WAVES) {
    const len = Math.hypot(w.dirX, w.dirY) || 1;
    const dx = (w.dirX / len).toFixed(6);
    const dy = (w.dirY / len).toFixed(6);
    waves += `  h += sin(dot(p, vec2(${dx}, ${dy})) * ${w.freq} + t * ${w.speed}) * ${w.amp};\n`;
  }
  return `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;

uniform vec2 u_center;
uniform float u_time;
uniform mat4 u_viewProj;

out vec3 v_world;
out float v_height;

void main() {
  vec2 wp = u_center + aPos;
  vec2 p = wp;
  float t = u_time;
  float h = 0.0;
${waves}  v_height = h;
  v_world = vec3(wp.x, h, wp.y);
  gl_Position = u_viewProj * vec4(v_world, 1.0);
}`;
}

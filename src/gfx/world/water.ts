/** Procedural ocean — camera-following wave grid, vertex-displaced. */
import type { GlContext } from '../core/context';
import type { GlProgram } from '../core/shader';
import { createProgram } from '../core/shader';
import { WATER_VS, WATER_FS } from '../core/shaders';
import { createMesh, type GlMesh } from '../core/mesh';
import { getProceduralTexture, hashNoise } from '../core/texture';
import type { Camera3d } from '../core/camera';
import type { Atmosphere } from './atmosphere';

const GRID = 64;
const HALF = 2400;

/** Grid geometry: vec3 positions + indices. Exported for tests. */
export function buildWaterGrid(grid = GRID, half = HALF): {
  positions: number[];
  indices: number[];
} {
  const positions: number[] = [];
  const indices: number[] = [];
  const cell = (half * 2) / (grid - 1);
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      positions.push(-half + c * cell, 0, -half + r * cell);
    }
  }
  for (let r = 0; r < grid - 1; r++) {
    for (let c = 0; c < grid - 1; c++) {
      const a = r * grid + c;
      const b = a + 1;
      const d = a + grid;
      indices.push(a, b, d, b, d + 1, d);
    }
  }
  return { positions, indices };
}

export class Water {
  private program: GlProgram;
  private mesh: GlMesh;
  private readonly uCenter = new Float32Array(2);

  constructor(private readonly gl: GlContext) {
    this.program = createProgram(gl.gl, WATER_VS, WATER_FS);
    const { positions, indices } = buildWaterGrid();
    this.mesh = createMesh(gl.gl, {
      positions,
      normals: [],
      colors: [],
      binds: [],
      kinds: [],
      indices,
    });
  }

  draw(cam: Camera3d, atm: Atmosphere, time: number): void {
    const gl = this.gl.gl;
    this.program.use();
    gl.uniformMatrix4fv(this.program.uniform('u_viewProj'), false, cam.getViewProj());
    this.uCenter[0] = Math.round(cam.targetX / HALF) * HALF;
    this.uCenter[1] = Math.round(cam.targetZ / HALF) * HALF;
    gl.uniform2fv(this.program.uniform('u_center'), this.uCenter);
    gl.uniform1f(this.program.uniform('u_time'), time);
    const eye = cam.eyeWorld();
    gl.uniform3f(this.program.uniform('u_eye'), eye[0], eye[1], eye[2]);
    gl.uniform3f(this.program.uniform('u_sunDir'), atm.sunDir[0], atm.sunDir[1], atm.sunDir[2]);
    gl.uniform3f(this.program.uniform('u_horizon'), atm.skyHorizon[0], atm.skyHorizon[1], atm.skyHorizon[2]);
    gl.uniform3f(this.program.uniform('u_deep'), atm.waterDeep[0], atm.waterDeep[1], atm.waterDeep[2]);
    gl.uniform3f(this.program.uniform('u_mid'), atm.waterMid[0], atm.waterMid[1], atm.waterMid[2]);
    const tex = getProceduralTexture(this.gl, 'noise:water', {
      size: 128,
      repeat: true,
      pixel: (x, y, _size) => {
        const n = hashNoise(x * 3.7, y * 3.7, 23);
        return [Math.round(255 * n), Math.round(255 * n), Math.round(255 * n), 255];
      },
    });
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.program.uniform('u_tex'), 0);
    }
    this.mesh.draw(gl, this.program);
  }

  dispose(): void {
    this.mesh.dispose(this.gl.gl);
    this.program.dispose();
  }
}

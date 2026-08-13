/** Procedural ocean — a camera-following wave grid, displaced in the vertex shader. */
import type { GlContext } from './gl/context';
import type { GlProgram } from './gl/shader';
import { createProgram } from './gl/shader';
import { WATER_FS, WATER_VS } from './gl/shaders';
import { createMesh, type GlMesh } from './gl/mesh';
import type { Camera3d } from './camera3d';

const GRID = 52;
const HALF = 2400;

export class Water {
  private program: GlProgram;
  private mesh: GlMesh;
  private readonly uCenter = new Float32Array(2);

  constructor(private readonly gl: GlContext) {
    this.program = createProgram(gl.gl, WATER_VS, WATER_FS);
    const positions: number[] = [];
    const indices: number[] = [];
    const cell = (HALF * 2) / (GRID - 1);
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        positions.push(-HALF + c * cell, -HALF + r * cell);
      }
    }
    for (let r = 0; r < GRID - 1; r++) {
      for (let c = 0; c < GRID - 1; c++) {
        const a = r * GRID + c;
        const b = a + 1;
        const d = a + GRID;
        indices.push(a, b, d, b, d + 1, d);
      }
    }
    this.mesh = createMesh(gl.gl, {
      positions,
      normals: [],
      colors: [],
      binds: [],
      kinds: [],
      indices,
    });
  }

  draw(cam: Camera3d, time: number, sunDir: Float32Array): void {
    const gl = this.gl.gl;
    this.program.use();
    gl.uniformMatrix4fv(this.program.uniform('u_viewProj'), false, cam.getViewProj());
    this.uCenter[0] = Math.round(cam.targetX / HALF) * HALF;
    this.uCenter[1] = Math.round(cam.targetZ / HALF) * HALF;
    gl.uniform2fv(this.program.uniform('u_center'), this.uCenter);
    gl.uniform1f(this.program.uniform('u_time'), time);
    const eye = cam.eyeWorld();
    gl.uniform3f(this.program.uniform('u_eye'), eye[0], eye[1], eye[2]);
    gl.uniform3f(this.program.uniform('u_sunDir'), sunDir[0], sunDir[1], sunDir[2]);
    gl.uniform3f(this.program.uniform('u_horizon'), 0.24, 0.38, 0.48);
    this.mesh.draw(gl, this.program);
  }

  dispose(): void {
    this.mesh.dispose(this.gl.gl);
    this.program.dispose();
  }
}

/** GL point sprites — renders the particle pool as billboards. */
import type { GlContext } from './context';
import type { GlProgram } from './shader';
import { createProgram } from './shader';
import { PARTICLE_FS, PARTICLE_VS } from './shaders';
import { PARTICLE_STRIDE, type ParticlePool } from './particles';
import type { Camera3d } from './camera';

const STRIDE = 8;

const KIND_COLOR: Array<[number, number, number]> = [
  [1, 0.88, 0.55], // flash
  [0.25, 0.26, 0.28], // smoke
  [0.5, 0.33, 0.16], // splinter
  [1, 0.55, 0.15], // ember
  [0.82, 0.92, 0.94], // bubble
  [0.85, 0.93, 0.95], // ring
];

export class Fx3d {
  private program: GlProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private data = new Float32Array(0);
  private count = 0;

  constructor(private readonly gl: GlContext) {
    this.program = createProgram(gl.gl, PARTICLE_VS, PARTICLE_FS);
    this.vao = gl.gl.createVertexArray()!;
    this.vbo = gl.gl.createBuffer()!;
    gl.gl.bindVertexArray(this.vao);
    gl.gl.bindBuffer(gl.gl.ARRAY_BUFFER, this.vbo);
    gl.gl.enableVertexAttribArray(0);
    gl.gl.vertexAttribPointer(0, 3, gl.gl.FLOAT, false, STRIDE * 4, 0);
    gl.gl.enableVertexAttribArray(1);
    gl.gl.vertexAttribPointer(1, 1, gl.gl.FLOAT, false, STRIDE * 4, 12);
    gl.gl.enableVertexAttribArray(2);
    gl.gl.vertexAttribPointer(2, 4, gl.gl.FLOAT, false, STRIDE * 4, 16);
    gl.gl.bindVertexArray(null);
  }

  setParticles(pool: ParticlePool): void {
    const n = pool.count;
    const src = pool.data;
    if (this.data.length < n * STRIDE) {
      this.data = new Float32Array(n * STRIDE);
    }
    for (let i = 0; i < n; i++) {
      const base = i * PARTICLE_STRIDE;
      const x = src[base]!;
      const y = src[base + 1]!;
      const size = src[base + 6]!;
      const kind = src[base + 7]!;
      const a = Math.max(0, src[base + 4]! / src[base + 5]!);
      const out = i * STRIDE;
      this.data[out] = x;
      this.data[out + 1] = 3 + size * 0.05;
      this.data[out + 2] = y;
      this.data[out + 3] = size;
      const [r, g, b] = KIND_COLOR[kind] ?? KIND_COLOR[0]!;
      this.data[out + 4] = r;
      this.data[out + 5] = g;
      this.data[out + 6] = b;
      this.data[out + 7] = a;
    }
    this.count = n;
  }

  draw(cam: Camera3d): void {
    if (this.count === 0) return;
    const gl = this.gl.gl;
    this.program.use();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.count * STRIDE), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.program.uniform('u_viewProj'), false, cam.getViewProj());
    gl.uniform1f(this.program.uniform('u_scale'), this.gl.cssH * 0.5 / Math.tan(cam.getFovY() / 2));
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.gl.deleteBuffer(this.vbo);
    this.gl.gl.deleteVertexArray(this.vao);
    this.program.dispose();
  }
}

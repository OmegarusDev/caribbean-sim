/** GL point sprites — the FxSystem particles rendered as billboards. */
import type { GlContext } from './gl/context';
import type { GlProgram } from './gl/shader';
import { createProgram } from './gl/shader';
import { PARTICLE_FS, PARTICLE_VS } from './gl/shaders';
import type { Camera3d } from './camera3d';
import type { Particle } from './fx';

const STRIDE = 8;

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

  setParticles(particles: Particle[]): void {
    const n = particles.length;
    if (this.data.length < n * STRIDE) {
      this.data = new Float32Array(n * STRIDE);
    }
    for (let i = 0; i < n; i++) {
      const p = particles[i]!;
      const a = Math.max(0, p.life / p.maxLife);
      const base = i * STRIDE;
      this.data[base] = p.x;
      this.data[base + 1] = 3 + p.size * 0.05;
      this.data[base + 2] = p.y;
      this.data[base + 3] = p.size;
      const [r, g, b] = particleColor(p);
      this.data[base + 4] = r;
      this.data[base + 5] = g;
      this.data[base + 6] = b;
      this.data[base + 7] = a;
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

function particleColor(p: Particle): [number, number, number] {
  switch (p.kind) {
    case 'flash':
      return [1, 0.88, 0.55];
    case 'smoke':
      return [0.25, 0.26, 0.28];
    case 'splinter':
      return [0.5, 0.33, 0.16];
    case 'ember':
      return [1, 0.55, 0.15];
    case 'bubble':
      return [0.82, 0.92, 0.94];
    case 'ring':
      return [0.85, 0.93, 0.95];
  }
}

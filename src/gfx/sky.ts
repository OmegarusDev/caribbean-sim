/** Procedural sky — fullscreen triangle, gradient + sun via inverse viewProj. */
import type { GlContext } from './gl/context';
import type { GlProgram } from './gl/shader';
import { createProgram } from './gl/shader';
import { SKY_FS, SKY_VS } from './gl/shaders';
import type { Camera3d } from './camera3d';

export class Sky {
  private program: GlProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;

  constructor(private readonly gl: GlContext) {
    this.program = createProgram(gl.gl, SKY_VS, SKY_FS);
    this.vao = gl.gl.createVertexArray()!;
    this.vbo = gl.gl.createBuffer()!;
    gl.gl.bindVertexArray(this.vao);
    gl.gl.bindBuffer(gl.gl.ARRAY_BUFFER, this.vbo);
    gl.gl.bufferData(gl.gl.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), gl.gl.STATIC_DRAW);
    gl.gl.enableVertexAttribArray(0);
    gl.gl.vertexAttribPointer(0, 2, gl.gl.FLOAT, false, 0, 0);
    gl.gl.bindVertexArray(null);
  }

  draw(cam: Camera3d, sunDir: Float32Array): void {
    const gl = this.gl.gl;
    this.program.use();
    gl.uniformMatrix4fv(this.program.uniform('u_invViewProj'), false, cam.getInvViewProj());
    gl.uniform3f(this.program.uniform('u_top'), 0.03, 0.12, 0.2);
    gl.uniform3f(this.program.uniform('u_horizon'), 0.36, 0.46, 0.52);
    gl.uniform3f(this.program.uniform('u_sunDir'), sunDir[0], sunDir[1], sunDir[2]);
    gl.uniform3f(this.program.uniform('u_sunColor'), 1.0, 0.78, 0.5);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.gl.deleteBuffer(this.vbo);
    this.gl.gl.deleteVertexArray(this.vao);
    this.program.dispose();
  }
}

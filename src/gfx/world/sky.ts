/** Procedural sky — fullscreen pass, depth-tested at the far plane. */
import type { GlContext } from '../core/context';
import type { GlProgram } from '../core/shader';
import { createProgram } from '../core/shader';
import { SKY_FS, SKY_VS } from '../core/shaders';
import { getProceduralTexture, hashNoise } from '../core/texture';
import type { Camera3d } from '../core/camera';
import type { Atmosphere } from './atmosphere';

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

  draw(cam: Camera3d, atm: Atmosphere, time: number): void {
    const gl = this.gl.gl;
    this.program.use();
    gl.uniformMatrix4fv(this.program.uniform('u_invViewProj'), false, cam.getInvViewProj());
    gl.uniform3f(this.program.uniform('u_top'), atm.skyTop[0], atm.skyTop[1], atm.skyTop[2]);
    gl.uniform3f(this.program.uniform('u_horizon'), atm.skyHorizon[0], atm.skyHorizon[1], atm.skyHorizon[2]);
    gl.uniform3f(this.program.uniform('u_cloudColor'), atm.cloudColor[0], atm.cloudColor[1], atm.cloudColor[2]);
    gl.uniform3f(this.program.uniform('u_sunDir'), atm.sunDir[0], atm.sunDir[1], atm.sunDir[2]);
    gl.uniform3f(this.program.uniform('u_sunColor'), atm.sunColor[0], atm.sunColor[1], atm.sunColor[2]);
    gl.uniform1f(this.program.uniform('u_cloudCover'), atm.cloudCover);
    gl.uniform1f(this.program.uniform('u_time'), time);
    const tex = getProceduralTexture(this.gl, 'noise:cloud', {
      size: 128,
      repeat: true,
      pixel: (x, y, _size) => {
        const n = hashNoise(x * 3.7, y * 3.7, 7);
        return [Math.round(255 * n), Math.round(255 * n), Math.round(255 * n), 255];
      },
    });
    if (tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(this.program.uniform('u_tex'), 0);
    }
    gl.bindVertexArray(this.vao);
    // The sky sits at the exact far plane and is depth-TESTED: it only fills
    // pixels where nothing closer has been drawn (above the water horizon).
    // Depth writes stay off so it never occludes the world.
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.gl.deleteBuffer(this.vbo);
    this.gl.gl.deleteVertexArray(this.vao);
    this.program.dispose();
  }
}

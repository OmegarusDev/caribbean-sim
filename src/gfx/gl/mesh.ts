/** Mesh — interleaved draw buffers with a tiny builder. */
import type { GlHandle } from './context';
import type { GlProgram } from './shader';
import { mat4Multiply, mat4Perspective, mat4LookAt, mat4Identity } from './math';

export interface MeshData {
  positions: number[];
  normals: number[];
  colors: number[];
  /** Sail-space UV (u across, v down) — used by the ship shader for billow. */
  binds: number[];
  /** 0 hull · 1 sail · 2 flag — selects shader behavior per vertex. */
  kinds: number[];
  indices: number[];
}

export interface GlMesh {
  count: number;
  draw: (gl: GlHandle, program: GlProgram) => void;
  dispose: (gl: GlHandle) => void;
}

export function createMesh(gl: GlHandle, data: MeshData): GlMesh {
  const stride = 3 + 3 + 4 + 2 + 1;
  const floats = new Float32Array(data.positions.length / 3 * stride);
  let f = 0;
  for (let i = 0; i < data.positions.length / 3; i++) {
    floats[f++] = data.positions[i * 3]!;
    floats[f++] = data.positions[i * 3 + 1]!;
    floats[f++] = data.positions[i * 3 + 2]!;
    floats[f++] = data.normals[i * 3] ?? 0;
    floats[f++] = data.normals[i * 3 + 1] ?? 1;
    floats[f++] = data.normals[i * 3 + 2] ?? 0;
    floats[f++] = data.colors[i * 4] ?? 1;
    floats[f++] = data.colors[i * 4 + 1] ?? 1;
    floats[f++] = data.colors[i * 4 + 2] ?? 1;
    floats[f++] = data.colors[i * 4 + 3] ?? 0;
    floats[f++] = data.binds[i * 2] ?? 0;
    floats[f++] = data.binds[i * 2 + 1] ?? 0;
    floats[f++] = data.kinds[i] ?? 0;
  }

  const vao = gl.createVertexArray();
  if (!vao) throw new Error('createVertexArray failed');
  const vbo = gl.createBuffer();
  const ibo = gl.createBuffer();
  if (!vbo || !ibo) throw new Error('createBuffer failed');

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, floats, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);

  const attr = (loc: number, size: number, offset: number) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, offset * 4);
  };
  attr(0, 3, 0);
  attr(1, 3, 3);
  attr(2, 4, 6);
  attr(3, 2, 10);
  attr(4, 1, 12);
  gl.bindVertexArray(null);

  return {
    count: data.indices.length,
    draw(gl2, program) {
      program.use();
      gl2.bindVertexArray(vao);
      gl2.drawElements(gl2.TRIANGLES, data.indices.length, gl2.UNSIGNED_SHORT, 0);
      gl2.bindVertexArray(null);
    },
    dispose(gl2) {
      gl2.deleteBuffer(vbo);
      gl2.deleteBuffer(ibo);
      gl2.deleteVertexArray(vao);
    },
  };
}

export function drawMesh(gl: GlHandle, mesh: GlMesh, program: GlProgram): void {
  mesh.draw(gl, program);
}

export { mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt };

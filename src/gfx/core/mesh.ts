/**
 * Mesh — interleaved buffers with optional per-instance attributes.
 *
 * Base attributes (locations 0–4): position, normal, color, uv, kind.
 * An instance layout extends the VAO with divisor-1 attributes (locations
 * 5+), enabling one instanced draw per mesh instead of one draw per entity —
 * the mechanism that scales the engine to fleets, convoys and armies.
 */
import type { GlHandle } from './context';
import type { GlProgram } from './shader';

export interface MeshData {
  positions: number[];
  normals: number[];
  colors: number[];
  /** UV — hull/sail texture coordinates; sails store (u across, v down). */
  binds: number[];
  /** 0 hull · 1 sail · 2 flag — selects shader behavior per vertex. */
  kinds: number[];
  indices: number[];
}

export interface MeshInstanceAttrib {
  /** Attribute size in floats (1..4); mat4 = four vec4s. */
  size: number;
  /** Offset in floats from the start of one instance record. */
  offsetFloats: number;
}

export interface MeshInstanceLayout {
  attribs: MeshInstanceAttrib[];
  strideFloats: number;
  /** First attribute location for instances (5+). */
  baseLocation: number;
}

export interface GlMesh {
  count: number;
  draw: (gl: GlHandle, program: GlProgram) => void;
  /** Upload instance records (dynamic) and draw them instanced. */
  drawInstanced: (gl: GlHandle, program: GlProgram, instanceCount: number, data: Float32Array) => void;
  dispose: (gl: GlHandle) => void;
}

export function createMesh(
  gl: GlHandle,
  data: MeshData,
  instances?: MeshInstanceLayout,
): GlMesh {
  if (data.positions.length % 3 !== 0) {
    throw new Error('mesh positions must be vec3 (3 floats per vertex)');
  }
  const baseStride = 3 + 3 + 4 + 2 + 1;
  const floats = new Float32Array((data.positions.length / 3) * baseStride);
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

  const baseAttrib = (loc: number, size: number, offset: number) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, baseStride * 4, offset * 4);
  };
  baseAttrib(0, 3, 0);
  baseAttrib(1, 3, 3);
  baseAttrib(2, 4, 6);
  baseAttrib(3, 2, 10);
  baseAttrib(4, 1, 12);

  let instanceVbo: WebGLBuffer | null = null;
  let instanceCapacity = 0;
  if (instances) {
    instanceVbo = gl.createBuffer();
    if (!instanceVbo) throw new Error('createBuffer failed');
  }

  // Instance attributes are set up in uploadInstances (needs the layout).
  const instanceLayout = instances;
  gl.bindVertexArray(null);

  const bindInstanceAttribs = (layout: MeshInstanceLayout): void => {
    if (!instanceVbo) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
    for (let i = 0; i < layout.attribs.length; i++) {
      const attr = layout.attribs[i]!;
      const loc = layout.baseLocation + i;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, attr.size, gl.FLOAT, false, layout.strideFloats * 4, attr.offsetFloats * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
  };

  const uploadInstances = (gl2: GlHandle, data: Float32Array): void => {
    if (!instanceVbo) return;
    gl2.bindVertexArray(vao);
    bindInstanceAttribs(instanceLayout!);
    gl2.bindBuffer(gl.ARRAY_BUFFER, instanceVbo);
    if (data.length > instanceCapacity) {
      gl2.bufferData(gl.ARRAY_BUFFER, data, gl2.DYNAMIC_DRAW);
      instanceCapacity = data.length;
    } else {
      gl2.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    }
    gl2.bindVertexArray(null);
  };

  return {
    count: data.indices.length,
    draw(gl2, program) {
      program.use();
      gl2.bindVertexArray(vao);
      gl2.drawElements(gl2.TRIANGLES, data.indices.length, gl2.UNSIGNED_SHORT, 0);
      gl2.bindVertexArray(null);
    },
    drawInstanced(gl2, program, instanceCount, instanceData) {
      if (instanceCount <= 0) return;
      uploadInstances(gl2, instanceData);
      program.use();
      gl2.bindVertexArray(vao);
      gl2.drawElementsInstanced(gl2.TRIANGLES, data.indices.length, gl2.UNSIGNED_SHORT, 0, instanceCount);
      gl2.bindVertexArray(null);
    },
    dispose(gl2) {
      gl2.deleteBuffer(vbo);
      gl2.deleteBuffer(ibo);
      if (instanceVbo) gl2.deleteBuffer(instanceVbo);
      gl2.deleteVertexArray(vao);
    },
  };
}

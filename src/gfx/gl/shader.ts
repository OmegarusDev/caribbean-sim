/** Shader compile/link with uniform+attrib caches. */
import type { GlHandle } from './context';

export interface GlProgram {
  program: WebGLProgram;
  attrib: (name: string) => number;
  uniform: (name: string) => WebGLUniformLocation | null;
  use: () => void;
  dispose: () => void;
}

function compile(gl: GlHandle, type: number, source: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown';
    gl.deleteShader(sh);
    console.error('[caribbean] shader compile failed', log, '\n', source.slice(0, 400));
    throw new Error(`Shader compile: ${log}`);
  }
  return sh;
}

export function createProgram(gl: GlHandle, vsSrc: string, fsSrc: string): GlProgram {
  const vs = compile(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('createProgram failed');
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'unknown';
    gl.deleteProgram(program);
    console.error('[caribbean] program link failed', log);
    throw new Error(`Program link: ${log}`);
  }
  const attribCache = new Map<string, number>();
  const uniformCache = new Map<string, WebGLUniformLocation | null>();
  return {
    program,
    attrib(name) {
      let loc = attribCache.get(name);
      if (loc === undefined) {
        loc = gl.getAttribLocation(program, name);
        attribCache.set(name, loc);
      }
      return loc;
    },
    uniform(name) {
      if (!uniformCache.has(name)) {
        uniformCache.set(name, gl.getUniformLocation(program, name));
      }
      return uniformCache.get(name) ?? null;
    },
    use() {
      gl.useProgram(program);
    },
    dispose() {
      gl.deleteProgram(program);
    },
  };
}

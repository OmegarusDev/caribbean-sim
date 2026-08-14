/**
 * Kelvin wakes — the signature V of a moving hull, drawn from the ship's
 * ACTUAL path. Each ship feeds a history ring of positions; every frame the
 * ribbon is rebuilt: the hull's track widened with age, its foam arms at
 * the edges, the calm trail between. The ribbon rides the same wave field
 * the water shader displaces.
 */
import type { GlContext } from '../core/context';
import type { GlProgram } from '../core/shader';
import { createProgram } from '../core/shader';
import { WAKE_VS, WAKE_FS } from '../core/shaders';
import type { Camera3d } from '../core/camera';
import { waveHeight } from './waves';

const STRIDE = 6; // pos(3) + uv(2) + alpha(1)
const HISTORY = 40; // ribbon segments per ship
const SAMPLE_TICKS = 3; // a history point every ~150ms

interface Trail {
  pts: Float32Array; // ring of x, y (world plane)
  head: number;
  filled: number;
  tick: number;
}

export class WakeSystem {
  private program: GlProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private data = new Float32Array(0);
  private trails = new Map<string, Trail>();
  private windDir = 0;

  constructor(private readonly gl: GlContext) {
    this.program = createProgram(gl.gl, WAKE_VS, WAKE_FS);
    this.vao = gl.gl.createVertexArray()!;
    this.vbo = gl.gl.createBuffer()!;
    gl.gl.bindVertexArray(this.vao);
    gl.gl.bindBuffer(gl.gl.ARRAY_BUFFER, this.vbo);
    gl.gl.enableVertexAttribArray(0);
    gl.gl.vertexAttribPointer(0, 3, gl.gl.FLOAT, false, STRIDE * 4, 0);
    gl.gl.enableVertexAttribArray(1);
    gl.gl.vertexAttribPointer(1, 2, gl.gl.FLOAT, false, STRIDE * 4, 12);
    gl.gl.enableVertexAttribArray(2);
    gl.gl.vertexAttribPointer(2, 1, gl.gl.FLOAT, false, STRIDE * 4, 20);
    gl.gl.bindVertexArray(null);
  }

  setWind(dir: number): void {
    this.windDir = dir;
  }

  /**
   * Feed one tick of the fleet. Ships that move leave a trail; stationary
   * ones shed theirs.
   */
  update(
    ships: ReadonlyArray<{ id: string; x: number; y: number; speed: number }>,
    dt: number,
  ): void {
    const alive = new Set(ships.map((s) => s.id));
    for (const key of [...this.trails.keys()]) {
      if (!alive.has(key)) this.trails.delete(key);
    }
    for (const s of ships) {
      let t = this.trails.get(s.id);
      if (s.speed < 8) {
        if (t) t.filled = 0;
        continue;
      }
      if (!t) {
        t = { pts: new Float32Array(HISTORY * 2), head: 0, filled: 0, tick: 0 };
        this.trails.set(s.id, t);
      }
      t.tick += dt;
      if (t.tick >= SAMPLE_TICKS * 0.05) {
        t.tick = 0;
        t.pts[t.head * 2] = s.x;
        t.pts[t.head * 2 + 1] = s.y;
        t.head = (t.head + 1) % HISTORY;
        if (t.filled < HISTORY) t.filled++;
      }
    }
  }

  /** Build the ribbon strips and draw them on the water. */
  draw(cam: Camera3d, time: number): void {
    const gl = this.gl.gl;
    let verts = 0;
    for (const [, t] of this.trails) {
      if (t.filled >= 2) verts += t.filled * 2;
    }
    if (verts === 0) return;
    if (this.data.length < verts * STRIDE) {
      this.data = new Float32Array(verts * STRIDE);
    }
    let out = 0;
    for (const [, t] of this.trails) {
      if (t.filled < 2) continue;
      const beam = 4; // half-width at the stern, in world units
      for (let k = 0; k < t.filled; k++) {
        const idx = (t.head - 1 - k + HISTORY * 2) % HISTORY;
        const px = t.pts[idx * 2]!;
        const py = t.pts[idx * 2 + 1]!;
        const next = (t.head - 2 - k + HISTORY * 2) % HISTORY;
        const nx = t.pts[next * 2]!;
        const ny = t.pts[next * 2 + 1]!;
        let dx = nx - px;
        let dy = ny - py;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const age = k / Math.max(1, t.filled - 1);
        const half = beam * (0.7 + age * 1.5);
        const hx = -dy * half;
        const hy = dx * half;
        const zh = waveHeight(px, py, time, this.windDir) + 0.4;
        const fade = k < 2 ? 1 : Math.max(0, 1 - age);
        for (const side of [-1, 1]) {
          this.data[out] = px + hx * side;
          this.data[out + 1] = zh;
          this.data[out + 2] = py + hy * side;
          this.data[out + 3] = side;
          this.data[out + 4] = age;
          this.data[out + 5] = fade;
          out += STRIDE;
        }
      }
    }
    this.program.use();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, out), gl.DYNAMIC_DRAW);
    gl.uniformMatrix4fv(this.program.uniform('u_viewProj'), false, cam.getViewProj());
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, out / STRIDE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.gl.deleteBuffer(this.vbo);
    this.gl.gl.deleteVertexArray(this.vao);
    this.program.dispose();
  }
}

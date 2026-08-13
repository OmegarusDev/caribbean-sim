/**
 * The 3D sea scene — sky, water, ships, FX in one frame. Ships keep smoothed
 * yaw so the hull always turns to face its course (never snaps or crabs).
 */
import type { GlContext } from './gl/context';
import { createProgram, type GlProgram } from './gl/shader';
import { SHIP_FS, SHIP_VS } from './gl/shaders';
import { createMesh, type GlMesh } from './gl/mesh';
import { hexToRgb, mat4Identity, projectToNdc, vec3, type Vec3 } from './gl/math';
import type { HullClassId } from '../content/ships';
import { HULL_CLASSES } from '../content/ships';
import { Camera3d } from './camera3d';
import { Sky } from './sky';
import { Water } from './water';
import { Fx3d } from './fx3d';
import { getShipMesh, shipModel, type ShipMesh } from './ship3d';
import type { Particle } from './fx';
import type { ShipState } from '../sim/battle/types';

export interface ShipView {
  id: string;
  team: 0 | 1;
  x: number;
  y: number;
  heading: number;
  hullClass: HullClassId;
  sailRatio: number;
  hullRatio: number;
  onFire: boolean;
  sunk: boolean;
  sinkT: number;
  struck: boolean;
  rudder: number;
  speed: number;
  selected: boolean;
}

export function toShipView(s: ShipState, selected: boolean): ShipView {
  return {
    id: s.id,
    team: s.team,
    x: s.x,
    y: s.y,
    heading: s.heading,
    hullClass: s.hullClass,
    sailRatio: s.sails / s.maxSails,
    hullRatio: s.hull / s.maxHull,
    onFire: s.onFire,
    sunk: s.sunk,
    sinkT: 0,
    struck: s.struck,
    rudder: s.rudder,
    speed: s.speed,
    selected,
  };
}

const TEAM_STRIPE: Record<0 | 1, Vec3> = {
  0: hexToRgb('#2e7d8a'),
  1: hexToRgb('#c06655'),
};
const TEAM_FLAG: Record<0 | 1, Vec3> = {
  0: hexToRgb('#4aa5b4'),
  1: hexToRgb('#d97a68'),
};

export class SeaScene {
  readonly camera = new Camera3d();
  private sky: Sky;
  private water: Water;
  private fx3d: Fx3d;
  private shipProgram: GlProgram;
  private ringMesh: GlMesh;
  private ringProgram: GlProgram;
  private views: ShipView[] = [];
  private particles: Particle[] = [];
  private windDir = 0;
  private smoothedYaw = new Map<string, number>();
  private bobPhase = new Map<string, number>();
  private readonly sunDir = new Float32Array(3);
  private readonly lightDir = new Float32Array(3);
  private readonly model = mat4Identity();
  private readonly scratch = vec3();

  constructor(private readonly gl: GlContext) {
    this.sky = new Sky(gl);
    this.water = new Water(gl);
    this.fx3d = new Fx3d(gl);
    this.shipProgram = createProgram(gl.gl, SHIP_VS, SHIP_FS);
    this.ringMesh = createMesh(gl.gl, buildRing());
    this.ringProgram = createProgram(gl.gl, SHIP_VS, SHIP_FS);
    this.setWind(0.6, 0.8);
  }

  setWind(dir: number, strength: number): void {
    this.windDir = dir;
    const sun = 0.55;
    this.sunDir[0] = Math.cos(dir) * 0.5;
    this.sunDir[1] = sun;
    this.sunDir[2] = Math.sin(dir) * 0.5;
    const len = Math.hypot(this.sunDir[0], this.sunDir[1], this.sunDir[2]) || 1;
    this.lightDir[0] = this.sunDir[0] / len;
    this.lightDir[1] = this.sunDir[1] / len;
    this.lightDir[2] = this.sunDir[2] / len;
    void strength;
  }

  setShips(views: ShipView[]): void {
    this.views = views;
    for (const v of views) {
      if (!this.smoothedYaw.has(v.id)) {
        this.smoothedYaw.set(v.id, -v.heading);
        this.bobPhase.set(v.id, Math.random() * Math.PI * 2);
      }
    }
    for (const key of [...this.smoothedYaw.keys()]) {
      if (!views.some((v) => v.id === key)) this.smoothedYaw.delete(key);
    }
  }

  setParticles(particles: Particle[]): void {
    this.particles = particles;
  }

  /** Advance per-ship pose smoothing (call every frame with dt). */
  smoothPoses(dt: number, time: number): void {
    const k = 1 - Math.exp(-dt * 5.5);
    for (const v of this.views) {
      const target = -v.heading;
      const cur = this.smoothedYaw.get(v.id) ?? target;
      let diff = target - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.smoothedYaw.set(v.id, cur + diff * k);
    }
    void time;
  }

  render(time: number): void {
    const gl = this.gl.gl;
    if (!this.camera.isReady()) this.camera.resize(this.gl.cssW, this.gl.cssH);
    gl.clearColor(0.03, 0.12, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Water first (the ground plane), then the depth-tested sky fills only
    // the pixels above the horizon, then the world on top.
    this.water.draw(this.camera, time, this.sunDir);
    this.sky.draw(this.camera, this.sunDir);

    for (const v of this.views) {
      this.drawShip(v, time);
    }

    this.fx3d.setParticles(this.particles);
    this.fx3d.draw(this.camera);
  }

  private drawShip(v: ShipView, time: number): void {
    const gl = this.gl.gl;
    const cls = HULL_CLASSES[v.hullClass];
    const entry: ShipMesh = getShipMesh(gl, v.hullClass);
    const phase = this.bobPhase.get(v.id) ?? 0;
    const yaw = this.smoothedYaw.get(v.id) ?? -v.heading;

    let pitch = Math.sin(time * 0.8 + phase) * 0.018;
    let roll = Math.sin(time * 0.9 + phase * 1.3) * 0.025;
    let y = Math.sin(time * 0.85 + phase) * 1.2;
    if (v.sunk) {
      const amt = Math.min(1, v.sinkT / 12);
      pitch -= amt * 1.05;
      y -= amt * amt * 26;
    } else {
      const way = Math.min(1, v.speed / cls.baseSpeed);
      roll += clamp(-v.rudder * way * 0.12, -0.28, 0.28);
    }

    shipModel(this.model, {
      x: v.x,
      z: v.y,
      y,
      yaw,
      pitch,
      roll,
      sinkT: v.sunk ? Math.min(1, v.sinkT / 12) : 0,
    });

    const prog = this.shipProgram;
    prog.use();
    gl.uniformMatrix4fv(prog.uniform('u_model'), false, this.model);
    gl.uniformMatrix4fv(prog.uniform('u_viewProj'), false, this.camera.getViewProj());
    const wlx = Math.cos(this.windDir - v.heading);
    const wly = Math.sin(this.windDir - v.heading);
    gl.uniform2f(prog.uniform('u_windLocal'), wlx, wly);
    gl.uniform1f(prog.uniform('u_time'), time);
    gl.uniform1f(prog.uniform('u_sailRatio'), v.struck ? 0.15 : Math.max(0.1, v.sailRatio));
    const eye = this.camera.eyeWorld();
    gl.uniform3f(prog.uniform('u_eye'), eye[0], eye[1], eye[2]);
    gl.uniform3f(prog.uniform('u_lightDir'), this.lightDir[0], this.lightDir[1], this.lightDir[2]);
    const stripe = TEAM_STRIPE[v.team];
    gl.uniform3f(prog.uniform('u_stripe'), stripe[0], stripe[1], stripe[2]);
    const flag = TEAM_FLAG[v.team];
    gl.uniform3f(prog.uniform('u_flag'), flag[0], flag[1], flag[2]);
    gl.uniform3f(prog.uniform('u_fog'), 0.24, 0.38, 0.48);
    gl.uniform1f(prog.uniform('u_fogStart'), 800);
    gl.uniform1f(prog.uniform('u_fogEnd'), 2500);
    entry.mesh.draw(gl, prog);

    if (v.selected && !v.sunk) {
      shipModel(this.model, {
        x: v.x,
        z: v.y,
        y: 0.2,
        yaw: 0,
        pitch: 0,
        roll: 0,
        sinkT: 0,
        scale: cls.length * 0.72,
      });
      this.ringProgram.use();
      gl.uniformMatrix4fv(this.ringProgram.uniform('u_model'), false, this.model);
      gl.uniformMatrix4fv(this.ringProgram.uniform('u_viewProj'), false, this.camera.getViewProj());
      gl.uniform2f(this.ringProgram.uniform('u_windLocal'), 0, 0);
      gl.uniform1f(this.ringProgram.uniform('u_time'), time);
      gl.uniform1f(this.ringProgram.uniform('u_sailRatio'), 1);
      const eye2 = this.camera.eyeWorld();
      gl.uniform3f(this.ringProgram.uniform('u_eye'), eye2[0], eye2[1], eye2[2]);
      gl.uniform3f(this.ringProgram.uniform('u_lightDir'), 0.4, 0.8, 0.45);
      gl.uniform3f(this.ringProgram.uniform('u_stripe'), 0.94, 0.79, 0.43);
      gl.uniform3f(this.ringProgram.uniform('u_flag'), 1, 1, 1);
      gl.uniform3f(this.ringProgram.uniform('u_fog'), 0.24, 0.38, 0.48);
      gl.uniform1f(this.ringProgram.uniform('u_fogStart'), 800);
      gl.uniform1f(this.ringProgram.uniform('u_fogEnd'), 2500);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.ringMesh.draw(gl, this.ringProgram);
      gl.disable(gl.BLEND);
    }
  }

  /** Nearest ship to a screen point (picking). Returns view index or -1. */
  pickShip(sx: number, sy: number, cssW: number, cssH: number, radius = 34): number {
    let best = -1;
    let bestD = radius * radius;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i]!;
      if (v.sunk) continue;
      projectToNdc(this.scratch, vec3(v.x, 6, v.y), this.camera.getViewProj());
      const px = (this.scratch[0]! + 1) * 0.5 * cssW;
      const py = (1 - this.scratch[1]!) * 0.5 * cssH;
      const d = (px - sx) * (px - sx) + (py - sy) * (py - sy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  dispose(): void {
    this.sky.dispose();
    this.water.dispose();
    this.fx3d.dispose();
    this.shipProgram.dispose();
    this.ringProgram.dispose();
    this.ringMesh.dispose(this.gl.gl);
  }
}

function buildRing(): Parameters<typeof createMesh>[1] {
  const segments = 28;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a), 0.04, Math.sin(a));
    colors.push(0.94, 0.79, 0.43, 0);
    positions.push(Math.cos(a) * 0.92, 0.04, Math.sin(a) * 0.92);
    colors.push(0.94, 0.79, 0.43, 0);
  }
  for (let i = 0; i < segments; i++) {
    const n = (i + 1) % segments;
    indices.push(i * 2, n * 2, i * 2 + 1, n * 2, n * 2 + 1, i * 2 + 1);
  }
  return { positions, normals: [], colors, binds: [], kinds: [], indices };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

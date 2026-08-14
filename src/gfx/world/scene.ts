/**
 * WorldScene — the pristine renderer. Owns the GL surface, camera, controller,
 * atmosphere, water, sky and the entity pipeline: frustum-culled, mesh-batched,
 * instanced draws. The engine knows nothing about ships or factions — game
 * layers map their domain onto WorldEntity and register meshes with programs.
 */
import type { GlContext } from '../core/context';
import type { GlProgram } from '../core/shader';
import { createMesh, type GlMesh } from '../core/mesh';
import { composeRigid, frustumSphereVisible, mat4Identity, type Frustum } from '../core/math';
import type { ParticlePool } from '../core/particles';
import { Camera3d, CameraController } from '../core/camera';
import { Sky } from './sky';
import { Water } from './water';
import { Fx3d } from '../core/fx3d';
import {
  INSTANCE_ATTRIBS,
  INSTANCE_LAYOUT,
  INSTANCE_STRIDE,
  writeInstance,
  type WorldEntity,
} from './entities';
import type { Atmosphere } from './atmosphere';
import { DAY } from './atmosphere';
import { solarPosition } from './sun';
import { getProceduralTexture, hashNoise, clearTextureCache } from '../core/texture';

interface MeshBatch {
  mesh: GlMesh;
  program: GlProgram;
  data: Float32Array;
  blend: boolean;
}

export class WorldScene {
  readonly camera = new Camera3d();
  readonly controller: CameraController;
  atmosphere: Atmosphere = DAY;
  /** Game layer re-registers its meshes here after a context restore. */
  onRebuild: (() => void) | null = null;
  private gl: GlContext;
  private sky: Sky;
  private water: Water;
  private fx3d: Fx3d;
  private meshes = new Map<string, MeshBatch>();
  private entities: WorldEntity[] = [];
  private particles: ParticlePool | null = null;
  private smoothedYaw = new Map<string, number>();
  private readonly model = mat4Identity();

  constructor(gl: GlContext) {
    this.gl = gl;
    this.sky = new Sky(gl);
    this.water = new Water(gl);
    this.fx3d = new Fx3d(gl);
    this.controller = new CameraController(this.camera);
    gl.onRestore(() => this.rebuild());
  }

  /** Register a mesh + program under an id (programs owned by the game layer). */
  registerMesh(id: string, mesh: GlMesh, program: GlProgram, blend = false): void {
    this.meshes.set(id, { mesh, program, data: new Float32Array(0), blend });
  }

  setEntities(entities: WorldEntity[]): void {
    this.entities = entities;
    for (const e of entities) {
      if (!this.smoothedYaw.has(e.id)) {
        this.smoothedYaw.set(e.id, e.yaw);
      }
    }
    for (const key of [...this.smoothedYaw.keys()]) {
      if (!entities.some((e) => e.id === key)) this.smoothedYaw.delete(key);
    }
  }

  setParticles(particles: ParticlePool | null): void {
    this.particles = particles;
  }

  private windDir = 0;

  /** The wind drives the sea and the sails — not the sun. */
  setWind(dir: number): void {
    this.windDir = dir;
  }

  // The sun is real: an ephemeris on Caribbean latitude (20N) in July.
  private sunDir: [number, number, number] = [0.37, 0.55, 0.37];
  private sunColor: [number, number, number] = [0.98, 0.95, 0.88];
  private sunIntensity = 1;
  private sunElev = 0.8;

  /** The sun's bearing in world space — for helms, shadows, and lighting. */
  get sunAzimuth(): number {
    return Math.atan2(this.sunDir[0], this.sunDir[2]);
  }

  /** The sun's height above the horizon. */
  get sunElevation(): number {
    return this.sunElev;
  }
  private readonly LATITUDE = 0.35;
  private readonly DAY_OF_YEAR = 190;

  /**
   * Set the hour of day (0..1, 0.5 = solar noon) and the ephemeris takes
   * over: the sun's elevation, azimuth and light level all fall out of the
   * astronomy, and the whole world — sky, mirror, ships — follows it.
   */
  setEpoch(hourFraction: number): void {
    const s = solarPosition(this.DAY_OF_YEAR, hourFraction, this.LATITUDE);
    this.sunDir = s.dir;
    this.sunIntensity = s.intensity;
    this.sunElev = s.elevation;
  }

  /** Shortest-path yaw smoothing so entities turn, never snap. */
  smoothPoses(dt: number): void {
    const k = 1 - Math.exp(-dt * 5.5);
    for (const e of this.entities) {
      const cur = this.smoothedYaw.get(e.id) ?? e.yaw;
      let diff = e.yaw - cur;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.smoothedYaw.set(e.id, cur + diff * k);
    }
  }

  render(time: number): void {
    const gl = this.gl.gl;
    if (!this.camera.isReady()) this.camera.resize(this.gl.cssW, this.gl.cssH);
    gl.clearColor(this.atmosphere.skyTop[0], this.atmosphere.skyTop[1], this.atmosphere.skyTop[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    this.water.draw(this.camera, this.atmosphere, time, this.windDir);
    this.sky.draw(this.camera, this.atmosphere, time);

    this.drawEntities(time);

    if (this.particles) {
      this.fx3d.setParticles(this.particles);
      this.fx3d.draw(this.camera);
    }
  }

  private drawEntities(time: number): void {
    const gl = this.gl.gl;
    // Shared procedural detail texture for materials (sails, hull, flags).
    const detail = getProceduralTexture(this.gl, 'noise:detail', {
      size: 64,
      repeat: true,
      pixel: (x, y, _size) => {
        const n = hashNoise(x * 5.1, y * 5.1, 41);
        return [Math.round(255 * n), Math.round(255 * n), Math.round(255 * n), 255];
      },
    });
    if (detail) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, detail);
    }
    const frustum: Frustum = this.camera.getFrustum();
    const byMesh = new Map<string, WorldEntity[]>();
    for (const e of this.entities) {
      if (!e.visible) continue;
      if (e.radius > 0 && !frustumSphereVisible(frustum, e.x, e.y, e.z, e.radius * e.scale)) continue;
      const list = byMesh.get(e.meshId);
      if (list) list.push(e);
      else byMesh.set(e.meshId, [e]);
    }
    const eye = this.camera.eyeWorld();
    const a = this.atmosphere;
    a.sunDir = this.sunDir;
    a.sunColor = this.sunColor;
    a.sunIntensity = this.sunIntensity;
    for (const [meshId, list] of byMesh) {
      const batch = this.meshes.get(meshId);
      if (!batch) continue;
      const needed = list.length * INSTANCE_STRIDE;
      if (batch.data.length < needed) {
        batch.data = new Float32Array(needed);
      }
      for (let i = 0; i < list.length; i++) {
        const e = list[i]!;
        const yaw = this.smoothedYaw.get(e.id) ?? e.yaw;
        composeRigid(this.model, e.x, e.y, e.z, yaw, e.pitch, e.roll, e.scale);
        writeInstance(batch.data, i, e, this.model);
      }
      // Per-frame uniforms for the batch program. Uniforms persist on the
      // program once set, so setting them before drawInstanced (which
      // re-uses the same program) applies to the draw. Unused uniforms are
      // optimized out and skipped.
      const prog = batch.program;
      prog.use();
      gl.uniformMatrix4fv(prog.uniform('u_viewProj'), false, this.camera.getViewProj());
      gl.uniform1f(prog.uniform('u_time'), time);
      gl.uniform3f(prog.uniform('u_eye'), eye[0], eye[1], eye[2]);
      gl.uniform3f(prog.uniform('u_lightDir'), a.sunDir[0], a.sunDir[1], a.sunDir[2]);
      gl.uniform3f(prog.uniform('u_fog'), a.fog[0], a.fog[1], a.fog[2]);
      gl.uniform1f(prog.uniform('u_fogStart'), a.fogStart);
      gl.uniform1f(prog.uniform('u_fogEnd'), a.fogEnd);
      gl.uniform1i(prog.uniform('u_tex'), 0);
      if (batch.blend) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }
      batch.mesh.drawInstanced(
        gl,
        batch.program,
        list.length,
        batch.data.subarray(0, needed),
      );
      if (batch.blend) gl.disable(gl.BLEND);
    }
  }

  /** Recreate every GPU resource (context loss / restore). */
  rebuild(): void {
    clearTextureCache();
    this.meshes.clear();
    this.sky = new Sky(this.gl);
    this.water = new Water(this.gl);
    this.fx3d = new Fx3d(this.gl);
    this.onRebuild?.();
  }

  /**
   * Dispose only the scene's own resources. Registered meshes are owned by
   * the game layer (ship meshes live in a shared module cache and must
   * survive scene teardown and the next battle).
   */
  dispose(): void {
    this.meshes.clear();
    this.sky.dispose();
    this.water.dispose();
    this.fx3d.dispose();
  }
}

export { INSTANCE_ATTRIBS, INSTANCE_LAYOUT, INSTANCE_STRIDE };

/** Convenience: a ship-style mesh with the shared instance layout. */
export function createInstancedMesh(gl: GlContext, data: Parameters<typeof createMesh>[1]): GlMesh {
  return createMesh(gl.gl, data, INSTANCE_LAYOUT);
}

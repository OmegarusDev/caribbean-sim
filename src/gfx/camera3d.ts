/**
 * 3D director camera — perspective, orbits the fleet, zooms to spread,
 * hands back after user silence. Sim plane (x, y) maps to world (x, z).
 */
import type { Input } from '../shell/input';
import {
  mat4Identity,
  mat4Invert,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
  transformMat4,
  type Mat4,
  type Vec3,
  vec3,
} from './gl/math';

export type CamMode = 'director' | 'manual' | 'focus';

const DOLLY_MIN = 260;
const DOLLY_MAX = 1500;
const PITCH_MIN = 0.32;
const PITCH_MAX = 1.15;
/** Vertical FOV (rad). A floor on the horizontal FOV keeps portrait phones
 * from collapsing to a ~20° sliver (Lanista's arena-camera lesson). */
const VFOV = (38 * Math.PI) / 180;
const HFOV_MIN = (40 * Math.PI) / 180;
const NEAR = 6;
const FAR = 9000;
const USER_HOLD_MS = 3000;

export class Camera3d {
  mode: CamMode = 'director';
  targetX = 0;
  targetZ = 0;
  smoothX = 0;
  smoothZ = 0;
  dolly = 640;
  smoothDolly = 640;
  pitch = 0.62;
  smoothPitch = 0.62;
  yaw = 0;
  smoothYaw = 0;

  focusId: string | null = null;
  private userHold = 0;
  private interestX: number | null = null;
  private interestZ: number | null = null;
  private interestLife = 0;
  private dragging = false;
  private dragMoved = false;
  private dragJustEnded = false;
  private dragSx = 0;
  private dragSy = 0;
  private pan0X = 0;
  private pan0Z = 0;
  private shakeAmp = 0;
  private shakeSeed = 1;
  private aspect = 16 / 9;
  private cssW = 800;
  private cssH = 600;
  private ready = false;
  private vfovHalf = VFOV / 2;

  private readonly proj = mat4Identity();
  private readonly view = mat4Identity();
  private readonly viewProj = mat4Identity();
  private readonly invViewProj = mat4Identity();
  private readonly eye = vec3(0, 640, 0);
  private readonly center = vec3(0, 0, 0);
  private readonly up = vec3(0, 1, 0);

  resize(cssW: number, cssH: number): void {
    this.cssW = Math.max(1, cssW);
    this.cssH = Math.max(1, cssH);
    this.aspect = this.cssW / this.cssH;
    let hfovHalf = Math.tan(VFOV / 2) * this.aspect;
    let vfovHalf = VFOV / 2;
    if (hfovHalf < Math.tan(HFOV_MIN / 2)) {
      vfovHalf = Math.tan(HFOV_MIN / 2) / Math.max(1e-3, this.aspect);
      hfovHalf = Math.tan(HFOV_MIN / 2);
    }
    this.vfovHalf = vfovHalf;
    this.ready = true;
  }

  /** Effective vertical FOV (rad) — portrait-safe. */
  getFovY(): number {
    return this.vfovHalf * 2;
  }

  update(
    points: Array<{ x: number; y: number }>,
    dt: number,
    input: Input,
    selected: { x: number; y: number } | null,
  ): void {
    if (!this.ready) return;

    if (this.mode !== 'director') {
      this.userHold += dt * 1000;
      if (this.userHold > USER_HOLD_MS) this.mode = 'director';
    }
    this.handleInput(input);

    if (this.mode === 'director' || this.mode === 'focus') {
      const center = this.fleetCenter(points, selected);
      this.smoothX = center.x;
      this.smoothZ = center.y;
      const spread = this.fleetSpread(points);
      // Fit the spread in the tightest view axis (portrait = horizontal).
      const constraintHalf = Math.min(this.vfovHalf, Math.tan(this.vfovHalf) * this.aspect);
      this.smoothDolly = clamp((spread * 0.85) / (2 * Math.max(1e-3, constraintHalf)), DOLLY_MIN, DOLLY_MAX);
      this.smoothPitch = clamp(0.42 + spread / 2600, PITCH_MIN, PITCH_MAX);
    } else if (this.interestLife > 0) {
      this.smoothX = this.interestX ?? this.smoothX;
      this.smoothZ = this.interestZ ?? this.smoothZ;
    }

    const k = 1 - Math.exp(-dt * 3.4);
    this.targetX += (this.smoothX - this.targetX) * k;
    this.targetZ += (this.smoothZ - this.targetZ) * k;
    this.dolly += (this.smoothDolly - this.dolly) * k;
    this.pitch += (this.smoothPitch - this.pitch) * k;
    this.yaw += (this.smoothYaw - this.yaw) * k;

    if (this.shakeAmp > 0.3) this.shakeAmp *= Math.exp(-dt * 4.5);
    else this.shakeAmp = 0;

    if (this.interestLife > 0) this.interestLife -= dt;
    if (this.interestLife <= 0) {
      this.interestX = null;
      this.interestZ = null;
    }

    this.computeMatrices();
  }

  private handleInput(input: Input): void {
    if (input.wheelDelta !== 0) {
      this.smoothDolly = clamp(this.smoothDolly * Math.exp(input.wheelDelta * 0.001), DOLLY_MIN, DOLLY_MAX);
      this.touch();
    }
    if (input.pinchDelta !== 0) {
      this.smoothDolly = clamp(this.smoothDolly * Math.exp(input.pinchDelta * 0.7), DOLLY_MIN, DOLLY_MAX);
      this.touch();
    }

    const p = input.pointer;
    const inView = p.x >= 0 && p.x <= this.cssW && p.y >= 0 && p.y <= this.cssH;
    if (p.down && !this.dragging && inView) {
      this.dragging = true;
      this.dragMoved = false;
      this.dragSx = p.x;
      this.dragSy = p.y;
      this.pan0X = this.targetX;
      this.pan0Z = this.targetZ;
    }
    if (p.down && this.dragging) {
      const dx = (p.x - this.dragSx) / this.cssH;
      const dy = (p.y - this.dragSy) / this.cssH;
      if (Math.hypot(dx, dy) > 0.01) this.dragMoved = true;
      if (this.dragMoved) {
        const world = this.planeDelta(dx, dy);
        this.smoothX = this.pan0X - world.x;
        this.smoothZ = this.pan0Z - world.z;
        this.touch();
      }
    }
    if (!p.down && this.dragging) {
      this.dragging = false;
      this.dragJustEnded = this.dragMoved;
    }
  }

  /** Screen-space drag delta → world-plane delta at the target depth. */
  private planeDelta(dxNorm: number, dyNorm: number): { x: number; z: number } {
    const tanHalf = Math.tan(this.vfovHalf);
    const worldPerNorm = this.dolly * tanHalf * 2;
    return {
      x: -dxNorm * worldPerNorm * this.aspect,
      z: -dyNorm * worldPerNorm,
    };
  }

  private touch(): void {
    this.mode = 'manual';
    this.userHold = 0;
  }

  private fleetCenter(
    points: Array<{ x: number; y: number }>,
    selected: { x: number; y: number } | null,
  ): { x: number; y: number } {
    if (selected) return { x: selected.x, y: selected.y };
    if (points.length === 0) return { x: this.targetX, y: this.targetZ };
    let x = 0;
    let y = 0;
    for (const p of points) {
      x += p.x;
      y += p.y;
    }
    return { x: x / points.length, y: y / points.length };
  }

  private fleetSpread(points: Array<{ x: number; y: number }>): number {
    if (points.length < 2) return 520;
    let max = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
        if (d > max) max = d;
      }
    }
    return max;
  }

  setInterest(x: number, z: number, life: number): void {
    this.interestX = x;
    this.interestZ = z;
    this.interestLife = life;
  }

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  focusOn(x: number, z: number): void {
    this.mode = 'focus';
    this.smoothX = x;
    this.smoothZ = z;
    this.smoothDolly = Math.min(this.smoothDolly, 460);
  }

  clearFocus(): void {
    this.mode = 'director';
  }

  consumeDragJustEnded(): boolean {
    const v = this.dragJustEnded;
    this.dragJustEnded = false;
    return v;
  }

  private computeMatrices(): void {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const ex = this.targetX + this.dolly * cp * cy;
    const ey = this.dolly * sp;
    const ez = this.targetZ + this.dolly * cp * sy;
    let sx = 0;
    let sz = 0;
    if (this.shakeAmp > 0) {
      this.shakeSeed = (this.shakeSeed * 1103515245 + 12345) >>> 0;
      const r1 = ((this.shakeSeed >>> 16) / 65535) - 0.5;
      this.shakeSeed = (this.shakeSeed * 1103515245 + 12345) >>> 0;
      const r2 = ((this.shakeSeed >>> 16) / 65535) - 0.5;
      sx = r1 * this.shakeAmp * 0.5;
      sz = r2 * this.shakeAmp * 0.5;
    }
    this.eye[0] = ex + sx;
    this.eye[1] = ey + 6;
    this.eye[2] = ez + sz;
    this.center[0] = this.targetX;
    this.center[1] = 0;
    this.center[2] = this.targetZ;
    mat4Perspective(this.proj, this.vfovHalf * 2, this.aspect, NEAR, FAR);
    mat4LookAt(this.view, this.eye, this.center, this.up);
    mat4Multiply(this.viewProj, this.proj, this.view);
    mat4Invert(this.invViewProj, this.viewProj);
  }

  /** Current eye position (world). */
  eyeWorld(): Vec3 {
    return [this.eye[0], this.eye[1], this.eye[2]];
  }

  getViewProj(): Mat4 {
    return this.viewProj;
  }

  getInvViewProj(): Mat4 {
    return this.invViewProj;
  }

  /** Unproject a screen point onto the sea plane (y=0). Returns null off-plane. */
  worldFromScreen(sx: number, sy: number, cssW: number, cssH: number): { x: number; z: number } | null {
    const ndc = vec3((sx / cssW) * 2 - 1, 1 - (sy / cssH) * 2, -1);
    const near = transformMat4(vec3(), ndc, this.invViewProj);
    ndc[2] = 1;
    const far = transformMat4(vec3(), ndc, this.invViewProj);
    const dx = far[0] - near[0];
    const dy = far[1] - near[1];
    const dz = far[2] - near[2];
    if (Math.abs(dy) < 1e-8) return null;
    const t = -near[1] / dy;
    if (t < 0) return null;
    return { x: near[0] + dx * t, z: near[2] + dz * t };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * FX system — particles and wakes, consolidated out of the scene.
 * Presentation-only: its randomness comes from a presentation rng
 * (split from the battle seed), never from the sim.
 */
import type { DirectorCamera } from './camera';

export type ParticleKind =
  | 'flash'
  | 'smoke'
  | 'splinter'
  | 'ember'
  | 'bubble'
  | 'ring';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: ParticleKind;
}

export class FxSystem {
  particles: Particle[] = [];
  private wakes = new Map<string, Array<{ x: number; y: number }>>();

  constructor(private readonly rand: () => number) {}

  muzzleFlash(x: number, y: number, angle: number, length: number, size = 26): void {
    const side = this.rand() < 0.5 ? -1 : 1;
    const lx = Math.cos(angle) * length * 0.5;
    const ly = Math.sin(angle) * length * 0.5;
    const px = -Math.sin(angle) * side;
    const py = Math.cos(angle) * side;
    const fx = x + lx + px * length * 0.28;
    const fy = y + ly + py * length * 0.28;
    this.spawn({ x: fx, y: fy, vx: 0, vy: 0, life: 0.22, maxLife: 0.22, size, kind: 'flash' });
    for (let i = 0; i < 3; i++) {
      this.spawn({
        x: fx,
        y: fy,
        vx: this.randRange(-24, 24),
        vy: this.randRange(-24, 24),
        life: this.randRange(0.8, 1.6),
        maxLife: 1.6,
        size: this.randRange(10, 20),
        kind: 'smoke',
      });
    }
  }

  splinters(x: number, y: number, n = 8, spread = 70): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x,
        y,
        vx: this.randRange(-spread, spread),
        vy: this.randRange(-spread, spread),
        life: this.randRange(0.3, 0.7),
        maxLife: 0.7,
        size: 2.5,
        kind: 'splinter',
      });
    }
  }

  embers(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + this.randRange(-30, 30),
        y: y + this.randRange(-30, 30),
        vx: this.randRange(-8, 8),
        vy: this.randRange(-30, -8),
        life: this.randRange(0.6, 1.4),
        maxLife: 1.4,
        size: 3,
        kind: 'ember',
      });
    }
  }

  bubbles(x: number, y: number, n = 12): void {
    for (let i = 0; i < n; i++) {
      this.spawn({
        x: x + this.randRange(-40, 40),
        y: y + this.randRange(-40, 40),
        vx: this.randRange(-12, 12),
        vy: this.randRange(-40, -10),
        life: this.randRange(0.8, 1.8),
        maxLife: 1.8,
        size: this.randRange(2, 5),
        kind: 'bubble',
      });
    }
    this.spawn({ x, y, vx: 0, vy: 0, life: 1.2, maxLife: 1.2, size: 30, kind: 'ring' });
  }

  spawn(p: Particle): void {
    this.particles.push(p);
    if (this.particles.length > 220) this.particles.shift();
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += 6 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, cam: DirectorCamera): void {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      const s = cam.worldToScreen(p.x, p.y);
      switch (p.kind) {
        case 'flash':
          ctx.fillStyle = `rgba(255, 226, 150, ${a})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * cam.zoom * (1.6 - a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'smoke':
          ctx.fillStyle = `rgba(60, 62, 66, ${a * 0.35})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * cam.zoom, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'splinter':
          ctx.strokeStyle = `rgba(120, 80, 40, ${a})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - p.vx * 0.04 * cam.zoom, s.y - p.vy * 0.04 * cam.zoom);
          ctx.stroke();
          break;
        case 'ember':
          ctx.fillStyle = `rgba(255, ${140 + Math.floor(a * 100)}, 40, ${a})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * cam.zoom, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'bubble':
          ctx.strokeStyle = `rgba(210, 235, 240, ${a * 0.7})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * cam.zoom, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = `rgba(220, 235, 238, ${a * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * cam.zoom * (1.6 - a), 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
    }
  }

  trackWake(id: string, x: number, y: number, cap = 34): void {
    const wake = this.wakes.get(id) ?? [];
    wake.push({ x, y });
    if (wake.length > cap) wake.shift();
    this.wakes.set(id, wake);
  }

  drawWakes(ctx: CanvasRenderingContext2D, cam: DirectorCamera): void {
    for (const wake of this.wakes.values()) {
      if (wake.length < 2) continue;
      ctx.lineWidth = Math.max(1, 1.6 * cam.zoom);
      for (let i = 1; i < wake.length; i++) {
        const a = (i / wake.length) * 0.22;
        const p0 = cam.worldToScreen(wake[i - 1]!.x, wake[i - 1]!.y);
        const p1 = cam.worldToScreen(wake[i]!.x, wake[i]!.y);
        ctx.strokeStyle = `rgba(225, 242, 244, ${a})`;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  private randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }
}

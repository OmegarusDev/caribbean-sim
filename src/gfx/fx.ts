/**
 * FX system — particle data + spawners. Rendering lives in Fx3d (WebGL
 * point sprites); presentation randomness comes from a presentation rng,
 * never from the sim.
 */
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

  private randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }
}

/**
 * FxSystem — particle spawners over the zero-GC pool. Presentation-only:
 * its randomness comes from a presentation rng, never from the sim.
 */
import { ParticlePool, type ParticleKind } from './particles';

export class FxSystem {
  readonly pool = new ParticlePool(256);

  constructor(private readonly rand: () => number) {}

  muzzleFlash(x: number, y: number, angle: number, length: number, size = 26): void {
    const side = this.rand() < 0.5 ? -1 : 1;
    const lx = Math.cos(angle) * length * 0.5;
    const ly = Math.sin(angle) * length * 0.5;
    const px = -Math.sin(angle) * side;
    const py = Math.cos(angle) * side;
    const fx = x + lx + px * length * 0.28;
    const fy = y + ly + py * length * 0.28;
    this.spawn(fx, fy, 0, 0, 0.22, 0.22, size, 'flash');
    for (let i = 0; i < 3; i++) {
      this.spawn(fx, fy, this.randRange(-24, 24), this.randRange(-24, 24), this.randRange(0.8, 1.6), 1.6, this.randRange(10, 20), 'smoke');
    }
  }

  splinters(x: number, y: number, n = 8, spread = 70): void {
    for (let i = 0; i < n; i++) {
      this.spawn(x, y, this.randRange(-spread, spread), this.randRange(-spread, spread), this.randRange(0.3, 0.7), 0.7, 2.5, 'splinter');
    }
  }

  embers(x: number, y: number, n = 6): void {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + this.randRange(-30, 30),
        y + this.randRange(-30, 30),
        this.randRange(-8, 8),
        this.randRange(-30, -8),
        this.randRange(0.6, 1.4),
        1.4,
        3,
        'ember',
      );
    }
  }

  bubbles(x: number, y: number, n = 12): void {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + this.randRange(-40, 40),
        y + this.randRange(-40, 40),
        this.randRange(-12, 12),
        this.randRange(-40, -10),
        this.randRange(0.8, 1.8),
        1.8,
        this.randRange(2, 5),
        'bubble',
      );
    }
    this.spawn(x, y, 0, 0, 1.2, 1.2, 30, 'ring');
  }

  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    maxLife: number,
    size: number,
    kind: ParticleKind,
  ): void {
    this.pool.spawn(x, y, vx, vy, life, maxLife, size, kind);
  }

  update(dt: number): void {
    this.pool.update(dt);
  }

  private randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }
}

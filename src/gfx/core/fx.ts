/**
 * FxSystem — particle spawners over the zero-GC pool. Presentation-only:
 * its randomness comes from a presentation rng, never from the sim.
 * All spawners are 3D: the world layer sets the wave-surface callback so
 * sprays and embers land on the sea, not in it.
 */
import { ParticlePool, type ParticleKind } from './particles';

export class FxSystem {
  readonly pool = new ParticlePool(320);

  constructor(private readonly rand: () => number) {}

  /** The sea surface at a world point — wired by the world layer. */
  private surface: (x: number, y: number) => number = () => 0;

  setSurface(fn: (x: number, y: number) => number): void {
    this.surface = fn;
    this.pool.setSurface(fn);
  }

  setWind(dir: number, strength: number): void {
    this.pool.setWind(dir, strength);
  }

  /**
   * A broadside: the muzzle flash at the mid-side battery, then a rolling
   * bank of powder smoke that lifts and drifts downwind.
   */
  muzzleFlash(x: number, y: number, angle: number, length: number, size = 26): void {
    const side = this.rand() < 0.5 ? -1 : 1;
    const lx = Math.cos(angle) * length * 0.5;
    const ly = Math.sin(angle) * length * 0.5;
    const px = -Math.sin(angle) * side;
    const py = Math.cos(angle) * side;
    const fx = x + lx + px * length * 0.3;
    const fy = y + ly + py * length * 0.3;
    const z = this.surface(fx, fy) + 1.5;
    this.spawn(fx, fy, z, 0, 0, 14, 0.2, 0.2, size, 'flash');
    for (let i = 0; i < 6; i++) {
      const sx = fx + this.randRange(-6, 6);
      const sy = fy + this.randRange(-6, 6);
      this.spawn(
        sx,
        sy,
        z + this.randRange(0, 3),
        this.randRange(-14, 14),
        this.randRange(-14, 14),
        this.randRange(6, 18),
        this.randRange(2.2, 3.6),
        3.6,
        this.randRange(14, 26),
        'smoke',
      );
    }
  }

  /** A hit: splinters flying with gravity, landing on the sea. */
  splinters(x: number, y: number, n = 10, spread = 80): void {
    const z = this.surface(x, y) + 4;
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + this.randRange(-spread, spread),
        y + this.randRange(-spread, spread),
        z + this.randRange(0, 6),
        this.randRange(-70, 70),
        this.randRange(-70, 70),
        this.randRange(30, 90),
        this.randRange(0.6, 1.3),
        1.3,
        2.5,
        'splinter',
      );
    }
  }

  /** Ship afire: embers spiralling up from the decks, arcing into the sea. */
  embers(x: number, y: number, n = 8): void {
    const z = this.surface(x, y) + 6;
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + this.randRange(-30, 30),
        y + this.randRange(-30, 30),
        z,
        this.randRange(-14, 14),
        this.randRange(-14, 14),
        this.randRange(40, 90),
        this.randRange(1.2, 2.4),
        2.4,
        3,
        'ember',
      );
    }
  }

  /** A sinking ship: the sea closes over it — bubbles rising, a ring. */
  bubbles(x: number, y: number, n = 16): void {
    for (let i = 0; i < n; i++) {
      this.spawn(
        x + this.randRange(-40, 40),
        y + this.randRange(-40, 40),
        this.surface(x, y) - this.randRange(4, 14),
        this.randRange(-12, 12),
        this.randRange(-12, 12),
        0,
        this.randRange(1.2, 2.2),
        2.2,
        this.randRange(2, 5),
        'bubble',
      );
    }
    this.spawn(x, y, this.surface(x, y) + 0.4, 0, 0, 0, 1.4, 1.4, 22, 'ring');
  }

  /**
   * Bow spray: continuous at speed — the bow's waterline sheds white water
   * — and violent when the bow plunges into a crest. rate scales with speed.
   */
  bowSpray(x: number, y: number, heading: number, length: number, speedFactor: number, plunge: number): void {
    const bx = x + Math.cos(heading) * length * 0.5;
    const by = y + Math.sin(heading) * length * 0.5;
    const z = this.surface(bx, by) + 0.8;
    const n = 1 + Math.round(speedFactor * 2 + Math.max(0, plunge) * 3);
    for (let i = 0; i < n; i++) {
      const side = this.rand() < 0.5 ? -1 : 1;
      const px = -Math.sin(heading) * side;
      const py = Math.cos(heading) * side;
      this.spawn(
        bx + px * this.randRange(1, 6),
        by + py * this.randRange(1, 6),
        z,
        px * this.randRange(6, 30) + this.randRange(-6, 6),
        py * this.randRange(6, 30) + this.randRange(-6, 6),
        this.randRange(16, 46),
        this.randRange(0.35, 0.9),
        0.9,
        this.randRange(2.2, 4.6),
        'spray',
      );
    }
  }

  /** A ship blown apart: flash, smoke column, embers, debris — one burst. */
  explosion(x: number, y: number): void {
    const z = this.surface(x, y) + 2;
    this.spawn(x, y, z + 6, 0, 0, 0, 0.28, 0.28, 64, 'flash');
    this.spawn(x, y, z + 6, 0, 0, 0, 1.6, 1.6, 40, 'ring');
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.spawn(
        x + Math.cos(a) * this.randRange(20, 50),
        y + Math.sin(a) * this.randRange(20, 50),
        z + this.randRange(0, 8),
        Math.cos(a) * this.randRange(30, 90),
        Math.sin(a) * this.randRange(30, 90),
        this.randRange(20, 70),
        this.randRange(2.4, 4.2),
        4.2,
        this.randRange(18, 34),
        'smoke',
      );
    }
    for (let i = 0; i < 14; i++) {
      this.spawn(
        x + this.randRange(-24, 24),
        y + this.randRange(-24, 24),
        z + 4,
        this.randRange(-90, 90),
        this.randRange(-90, 90),
        this.randRange(40, 130),
        this.randRange(1.2, 2.2),
        2.2,
        2.6,
        'ember',
      );
    }
    this.splinters(x, y, 14, 90);
  }

  spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    maxLife: number,
    size: number,
    kind: ParticleKind,
  ): void {
    this.pool.spawn(x, y, z, vx, vy, vz, life, maxLife, size, kind);
  }

  update(dt: number): void {
    this.pool.update(dt);
  }

  private randRange(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }
}

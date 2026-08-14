/**
 * Particle pool — fixed-capacity, typed-array, zero-GC.
 * Records are packed floats: x, y, z, vx, vy, vz, life, maxLife, size, kind.
 * Physics per kind is real: gravity arcs (embers, splinters, spray), buoyant
 * rise (bubbles), wind drift + lift (smoke), and everything settles on the
 * wave field via the surface callback. Spawn takes the next free slot
 * (compaction on update); rendering reads the packed buffer directly.
 */

export const PARTICLE_STRIDE = 10;
export const PARTICLE_KINDS = ['flash', 'smoke', 'splinter', 'ember', 'bubble', 'ring', 'spray'] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

/** Gravity in world units/s^2. */
export const PARTICLE_GRAVITY = 110;

export class ParticlePool {
  /** Packed records: count * PARTICLE_STRIDE floats. */
  readonly data: Float32Array;
  count = 0;
  private readonly capacity: number;
  /** Next write position when count < capacity. */
  private next = 0;
  /** The sea surface the particles settle on (set by the world layer). */
  private surface: ((x: number, y: number) => number) | null = null;
  /** Wind drift for smoke (set by the world layer). */
  private windX = 0;
  private windZ = 0;

  constructor(capacity = 320) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * PARTICLE_STRIDE);
  }

  setSurface(fn: ((x: number, y: number) => number) | null): void {
    this.surface = fn;
  }

  setWind(dir: number, strength: number): void {
    this.windX = Math.cos(dir) * strength;
    this.windZ = Math.sin(dir) * strength;
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
    if (this.count >= this.capacity) return;
    const i = this.next * PARTICLE_STRIDE;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = z;
    this.data[i + 3] = vx;
    this.data[i + 4] = vy;
    this.data[i + 5] = vz;
    this.data[i + 6] = life;
    this.data[i + 7] = maxLife;
    this.data[i + 8] = size;
    this.data[i + 9] = PARTICLE_KINDS.indexOf(kind);
    this.count++;
    this.next = (this.next + 1) % this.capacity;
  }

  update(dt: number): void {
    // Compaction pass: move live records to the front, dead ones drop out.
    let write = 0;
    for (let read = 0; read < this.count; read++) {
      const base = read * PARTICLE_STRIDE;
      this.data[base + 6] -= dt;
      if (this.data[base + 6]! <= 0) continue;
      const kind = this.data[base + 9]!;
      // Per-kind physics.
      if (kind === 1) {
        // smoke: lifts with the heat, drifts with the wind, swells.
        this.data[base + 5]! += 9 * dt;
        this.data[base + 3]! += this.windX * 26 * dt;
        this.data[base + 4]! += this.windZ * 26 * dt;
        this.data[base + 8]! += 7 * dt;
      } else if (kind === 2 || kind === 3 || kind === 6) {
        // splinters, embers, spray: gravity arcs that settle on the sea.
        this.data[base + 5]! -= PARTICLE_GRAVITY * dt;
      } else if (kind === 4) {
        // bubbles: buoyant, they rise to the surface.
        this.data[base + 5]! += 26 * dt;
      } else if (kind === 5) {
        // ring: an expanding disturbance on the surface.
        this.data[base + 8]! += 70 * dt;
      }
      // Integrate and settle on the wave field.
      this.data[base]! += this.data[base + 3]! * dt;
      this.data[base + 1]! += this.data[base + 4]! * dt;
      this.data[base + 2]! += this.data[base + 5]! * dt;
      if (this.surface && kind >= 2 && kind <= 6) {
        const s = this.surface(this.data[base]!, this.data[base + 1]!);
        if (this.data[base + 2]! < s) {
          this.data[base + 2] = s + 0.3;
          // The impact kills the vertical motion — the splash lands.
          if (this.data[base + 5]! < -20) this.data[base + 5]! *= -0.18;
          else this.data[base + 5]! = 0;
        }
      }
      if (write !== read) {
        const wb = write * PARTICLE_STRIDE;
        for (let k = 0; k < PARTICLE_STRIDE; k++) {
          this.data[wb + k] = this.data[base + k]!;
        }
      }
      write++;
    }
    this.count = write;
    this.next = write;
  }
}

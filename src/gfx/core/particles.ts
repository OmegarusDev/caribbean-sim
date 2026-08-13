/**
 * Particle pool — fixed-capacity, typed-array, zero-GC.
 * Records are packed floats: x, y, vx, vy, life, maxLife, size, kindIndex.
 * Spawn takes the next free slot (compaction on update); rendering reads the
 * packed buffer directly. No objects, no splices, no allocation.
 */

export const PARTICLE_STRIDE = 8;
export const PARTICLE_KINDS = ['flash', 'smoke', 'splinter', 'ember', 'bubble', 'ring'] as const;
export type ParticleKind = (typeof PARTICLE_KINDS)[number];

export class ParticlePool {
  /** Packed records: count * PARTICLE_STRIDE floats. */
  readonly data: Float32Array;
  count = 0;
  private readonly capacity: number;
  /** Next write position when count < capacity. */
  private next = 0;

  constructor(capacity = 256) {
    this.capacity = capacity;
    this.data = new Float32Array(capacity * PARTICLE_STRIDE);
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
    if (this.count >= this.capacity) return;
    const i = this.next * PARTICLE_STRIDE;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = vx;
    this.data[i + 3] = vy;
    this.data[i + 4] = life;
    this.data[i + 5] = maxLife;
    this.data[i + 6] = size;
    this.data[i + 7] = PARTICLE_KINDS.indexOf(kind);
    this.count++;
    this.next = (this.next + 1) % this.capacity;
  }

  update(dt: number): void {
    // Compaction pass: move live records to the front, dead ones drop out.
    let write = 0;
    for (let read = 0; read < this.count; read++) {
      const base = read * PARTICLE_STRIDE;
      this.data[base + 4] -= dt;
      if (this.data[base + 4]! <= 0) continue;
      const alive = this.data[base + 4]! / this.data[base + 5]!;
      this.data[base]! += this.data[base + 2]! * dt;
      this.data[base + 1]! += this.data[base + 3]! * dt;
      if (this.data[base + 7] === 1) this.data[base + 6]! += 6 * dt; // smoke grows
      if (write !== read) {
        for (let f = 0; f < PARTICLE_STRIDE; f++) {
          this.data[write * PARTICLE_STRIDE + f] = this.data[base + f]!;
        }
      }
      write++;
      void alive;
    }
    this.count = write;
    this.next = write < this.capacity ? write : 0;
  }

  clear(): void {
    this.count = 0;
    this.next = 0;
  }

  /** Read one packed record (for renderers). */
  get(index: number): number {
    return this.data[index * PARTICLE_STRIDE]!;
  }
}

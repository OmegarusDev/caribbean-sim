/**
 * Mulberry32 seeded PRNG — the engine's only randomness source.
 *
 * Rules (from the engine contract):
 *  - No Math.random / Date.now anywhere inside sim code.
 *  - Every domain gets its own stream via `split` — a battle never changes
 *    the economy's rolls, and a skirmish never changes the battle's.
 *  - State can be captured and resumed (`getState` / `fromState`), which is
 *    the primitive behind checkpoints and input-log replays.
 */

export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 1;
  }

  /** Rebuild from a captured state (checkpoint/resume). */
  static fromState(state: number): SeededRng {
    const rng = new SeededRng(state);
    // Ensure a nonzero internal state even if the caller passes 0.
    rng.state = state >>> 0;
    if (rng.state === 0) rng.state = 1;
    return rng;
  }

  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inclusive integer range. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty array');
    return items[this.int(0, items.length - 1)]!;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  weightedPick<T extends { weight: number }>(items: readonly T[]): T {
    let total = 0;
    for (const it of items) total += it.weight;
    let r = this.next() * total;
    for (const it of items) {
      r -= it.weight;
      if (r <= 0) return it;
    }
    return items[items.length - 1]!;
  }

  shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const tmp = arr[i]!;
      arr[i] = arr[j]!;
      arr[j] = tmp;
    }
  }

  /**
   * Independent sub-stream for a named domain/subsystem.
   * Derives a fresh state from the parent stream without consuming it.
   */
  split(streamId: number): SeededRng {
    const mix = (x: number) => {
      let h = (x ^ 0x9e3779b9) >>> 0;
      h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
      return (h ^ (h >>> 13)) >>> 0;
    };
    return new SeededRng((this.state ^ mix(streamId ^ 0x7f4a7c15)) >>> 0);
  }

  /** Current internal state — capture for checkpoints/replays. */
  getState(): number {
    return this.state;
  }
}

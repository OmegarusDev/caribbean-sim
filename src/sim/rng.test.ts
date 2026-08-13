import { describe, expect, it } from 'vitest';
import { SeededRng } from './rng';

describe('SeededRng', () => {
  it('is deterministic: same seed, same sequence', () => {
    const a = new SeededRng(42);
    const b = new SeededRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces uniform [0, 1) values', () => {
    const rng = new SeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int respects the inclusive bounds', () => {
    const rng = new SeededRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('split streams are deterministic and independent per stream id', () => {
    const base = new SeededRng(1234);
    const s1a = base.split(1);
    const s1b = base.split(1);
    const s2 = base.split(2);
    const seq1a = Array.from({ length: 20 }, () => s1a.next());
    const seq1b = Array.from({ length: 20 }, () => s1b.next());
    const seq2 = Array.from({ length: 20 }, () => s2.next());
    expect(seq1a).toEqual(seq1b);
    expect(seq1a).not.toEqual(seq2);
  });

  it('state capture and resume reproduces the sequence', () => {
    const a = new SeededRng(555);
    for (let i = 0; i < 50; i++) a.next();
    const state = a.getState();
    const b = SeededRng.fromState(state);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('pick and weightedPick behave', () => {
    const rng = new SeededRng(3);
    const picks = new Set<string>();
    for (let i = 0; i < 50; i++) picks.add(rng.pick(['a', 'b', 'c']));
    expect(picks.size).toBe(3);

    const heavy = rng.weightedPick([
      { weight: 1, id: 'light' },
      { weight: 99, id: 'heavy' },
    ]);
    expect(heavy.id).toBe('heavy');
  });
});

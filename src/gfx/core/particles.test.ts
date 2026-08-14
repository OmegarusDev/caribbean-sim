import { describe, expect, it } from 'vitest';
import { ParticlePool } from './particles';

describe('ParticlePool', () => {
  it('spawns and updates without allocation churn', () => {
    const pool = new ParticlePool(16);
    pool.spawn(1, 2, 0, 10, 20, 0, 0.5, 0.5, 4, 'flash');
    pool.spawn(3, 4, 0, 0, 0, 0, 0.1, 0.5, 2, 'smoke');
    expect(pool.count).toBe(2);
    pool.update(0.4); // second dies (0.1-0.4); first survives
    expect(pool.count).toBe(1);
    const base = 0 * 10;
    expect(pool.data[base]).toBeCloseTo(1 + 10 * 0.4);
    expect(pool.data[base + 1]).toBeCloseTo(2 + 20 * 0.4);
    expect(pool.data[base + 6]!).toBeCloseTo(0.1);
  });

  it('embers obey gravity and settle on the sea', () => {
    const pool = new ParticlePool(8);
    pool.setSurface((x, y) => (x === 0 && y === 0 ? 0 : 0));
    pool.spawn(0, 0, 5, 0, 0, 0, 1, 1, 3, 'ember');
    pool.update(0.2);
    expect(pool.data[5]).toBeLessThan(0); // falling
    for (let i = 0; i < 30; i++) pool.update(0.2);
    expect(pool.data[2]).toBeCloseTo(0.3, 1); // resting on the surface
  });

  it('smoke drifts with the wind', () => {
    const pool = new ParticlePool(8);
    pool.setWind(0, 1); // wind toward +x
    pool.spawn(0, 0, 0, 0, 0, 0, 1, 1, 3, 'smoke');
    pool.update(0.5);
    expect(pool.data[0]).toBeGreaterThan(0);
    expect(pool.data[5]).toBeGreaterThan(0); // rising
  });

  it('compacts to the front after deaths', () => {
    const pool = new ParticlePool(8);
    pool.spawn(1, 1, 0, 0, 0, 0, 0.2, 1, 2, 'flash');
    pool.spawn(2, 2, 0, 0, 0, 0, 0.9, 1, 2, 'flash');
    pool.spawn(3, 3, 0, 0, 0, 0, 0.3, 1, 2, 'flash');
    pool.update(0.5); // 1st and 3rd die
    expect(pool.count).toBe(1);
    expect(pool.data[1]).toBeCloseTo(2);
  });

  it('respects capacity', () => {
    const pool = new ParticlePool(4);
    for (let i = 0; i < 10; i++) {
      pool.spawn(i, 0, 0, 0, 0, 0, 1, 1, 1, 'flash');
    }
    expect(pool.count).toBe(4);
  });

  it('kills particles by life and keeps the pool usable', () => {
    const pool = new ParticlePool(8);
    for (let i = 0; i < 6; i++) pool.spawn(0, 0, 0, 0, 0, 0, 0.05, 1, 1, 'flash');
    for (let i = 0; i < 40; i++) pool.update(0.1);
    expect(pool.count).toBe(0);
    pool.spawn(1, 1, 0, 0, 0, 0, 1, 1, 1, 'ring');
    expect(pool.count).toBe(1);
  });
});

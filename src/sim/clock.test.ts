import { describe, expect, it } from 'vitest';
import { Clock } from './clock';

describe('Clock', () => {
  it('advances only when told', () => {
    const clock = new Clock('action');
    expect(clock.tick).toBe(0);
    clock.advance();
    clock.advance(4);
    expect(clock.tick).toBe(5);
  });

  it('snapshots and restarts at a captured tick', () => {
    const clock = new Clock('wallClock');
    clock.advance(100);
    const resumed = new Clock('wallClock', clock.snapshot());
    expect(resumed.tick).toBe(100);
  });

  it('refuses to rewind', () => {
    const clock = new Clock('scheduler');
    expect(() => clock.advance(-1)).toThrow();
  });
});

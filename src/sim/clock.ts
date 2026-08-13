/**
 * Clocks, not time models.
 *
 * Time is an integer tick counter advanced by a Driver. The sim never sees
 * wall-clock time — only `tick`. This unifies every progression model used by
 * the templates:
 *
 *   wallClock   — advanced by a fixed-step accumulator (race, sea battle, sailing)
 *   action      — advanced only when the player resolves something (menus, campaign)
 *   scheduler   — advanced at scheduled offsets (weather, faction wars, events)
 *   offline     — caught up on save-load (Lanista idle.ts → provisioning)
 *   fastForward — as many ticks as possible, headless (balance harness, auto-resolve)
 *
 * Domains nest: a domain spawned from a parent runs its own Clock at its own
 * rate and returns a result. A domain's entire state is `config + seed + tick`,
 * so checkpoint/resume is just (clock snapshot + rng state + entity state).
 */

export type ClockDriver = 'wallClock' | 'action' | 'scheduler' | 'offline' | 'fastForward';

export class Clock {
  tick = 0;

  constructor(readonly driver: ClockDriver, startTick = 0) {
    this.tick = startTick;
  }

  /** Advance one or more ticks. The only way time moves. */
  advance(n = 1): void {
    if (n < 0) throw new Error('clock cannot rewind');
    this.tick += n;
  }

  snapshot(): number {
    return this.tick;
  }
}

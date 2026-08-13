/**
 * The spectacle meter — Lanista's EntertainmentTracker generalized.
 * Events feed a running score; the score feeds the story, the audio surface,
 * and (later) the crowd. Pure state, no presentation inside.
 */
import type { SimEvent } from '../sim/events';

export const SPECTACLE_WEIGHTS: Record<string, number> = {
  broadside: 2,
  broadsideHit: 14,
  sailHit: 4,
  crewHit: 8,
  fireStart: 22,
  sink: 70,
  strike: 50,
  capture: 45,
  boardAttempt: 10,
  boardRepulse: 20,
};

export class SpectacleMeter {
  score = 0;
  private since = 0;

  addEvent(ev: SimEvent): void {
    const w = SPECTACLE_WEIGHTS[ev.kind];
    if (w) this.score += w;
  }

  add(amount: number): void {
    this.score += amount;
  }

  /** Decay score over time so a quiet sea drifts back down. */
  tick(dt: number): void {
    this.since += dt;
    if (this.since > 3) {
      this.score = Math.max(0, this.score - 1.5 * dt * (this.since / 3));
    }
  }

  reset(): void {
    this.score = 0;
    this.since = 0;
  }
}

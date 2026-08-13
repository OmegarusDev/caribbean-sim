import { describe, expect, it } from 'vitest';
import { Battle, runToEnd } from './battle';
import type { HarnessPairing } from './harness';
import { makeConfig, matchupStats, runDeterminismCheck, runHeadless } from './harness';

const SL: HarnessPairing = { team0: ['sloop'], team1: ['sloop'] };
const FF: HarnessPairing = { team0: ['frigate'], team1: ['frigate'] };
const SL_VS_GA: HarnessPairing = { team0: ['sloop'], team1: ['galleon'] };
const MIXED: HarnessPairing = { team0: ['sloop', 'brig'], team1: ['sloop', 'brig'] };

describe('sea battle sim', () => {
  it('is deterministic: same seed, identical fingerprint', () => {
    expect(runDeterminismCheck(SL)).toBe(true);
    expect(runDeterminismCheck(FF)).toBe(true);
  });

  it('terminates for every matchup', () => {
    for (const p of [SL, FF, SL_VS_GA, MIXED]) {
      const { result } = runHeadless(makeConfig(p, 1234));
      expect(result.winner).toBeTypeOf('number');
      expect(result.ticks).toBeGreaterThan(0);
    }
  });

  it('produces combat events', () => {
    const battle = new Battle(makeConfig(SL, 777));
    while (battle.phase === 'ongoing') battle.step();
    const events = battle.events.drain();
    expect(events.length).toBeGreaterThan(5);
    const kinds = new Set(events.map((e) => e.kind));
    expect(kinds.has('broadside') || kinds.has('broadsideHit')).toBe(true);
  });

  it('a sloop struggles against a galleon', () => {
    const stats = matchupStats(SL_VS_GA, 60);
    expect(stats.wins0).toBeLessThan(stats.wins1);
  });

  it('an even duel is not a guaranteed draw or blowout', () => {
    const stats = matchupStats(SL, 60);
    expect(stats.wins0 + stats.wins1).toBeGreaterThan(0);
    expect(stats.wins0).toBeGreaterThan(5);
    expect(stats.wins1).toBeGreaterThan(5);
  });

  it('runToEnd stops at the max tick cap', () => {
    const battle = new Battle({ ...makeConfig(SL, 99), maxTicks: 240 });
    const result = runToEnd(battle);
    expect(result.ticks).toBeLessThanOrEqual(240);
  });
});

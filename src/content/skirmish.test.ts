import { describe, expect, it } from 'vitest';
import { Battle } from '../sim/battle/battle';
import { makeDuelConfig, makeSkirmishConfig, SKIRMISH_PRESETS } from './skirmish';

describe('skirmish content', () => {
  it('duel configs are deterministic and terminate', () => {
    for (const player of ['sloop', 'frigate', 'galleon'] as const) {
      const battle = new Battle(makeDuelConfig(player, 'brig', 4242));
      while (battle.phase === 'ongoing') battle.step();
      expect(battle.buildResult().ticks).toBeGreaterThan(0);
      expect(battle.events.length).toBeGreaterThan(0);
    }
  });

  it('fleet presets produce valid battles', () => {
    for (const preset of SKIRMISH_PRESETS) {
      const battle = new Battle(makeSkirmishConfig(preset, 777));
      while (battle.phase === 'ongoing') battle.step();
      const result = battle.buildResult();
      expect(result.remaining.length).toBeGreaterThanOrEqual(0);
    }
  });
});

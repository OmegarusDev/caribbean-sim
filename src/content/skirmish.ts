/**
 * Skirmish presets — content as code. The quick-battle modes of the v0.1
 * sandbox; each is a seeded BattleConfig generator.
 */
import { SeededRng } from '../sim/rng';
import type { HullClassId } from './ships';
import type { BattleConfig } from '../sim/battle/types';
import { DEFAULT_MAX_TICKS } from '../sim/battle/types';

export interface SkirmishPreset {
  id: string;
  label: string;
  blurb: string;
  team0: HullClassId[];
  team1: HullClassId[];
}

export const SKIRMISH_PRESETS: SkirmishPreset[] = [
  {
    id: 'duel',
    label: 'Sloop Duel',
    blurb: 'Fast and light — two sloops, one winner.',
    team0: ['sloop'],
    team1: ['sloop'],
  },
  {
    id: 'frigate',
    label: 'Frigate Duel',
    blurb: 'Heavy broadsides and long reloads.',
    team0: ['frigate'],
    team1: ['frigate'],
  },
  {
    id: 'squadron',
    label: 'Squadron 2v2',
    blurb: 'A sloop and a brig per side — support matters.',
    team0: ['sloop', 'brig'],
    team1: ['sloop', 'brig'],
  },
  {
    id: 'grand',
    label: 'Grand 3v3',
    blurb: 'Mixed fleet action — the full sandbox.',
    team0: ['sloop', 'brig', 'frigate'],
    team1: ['sloop', 'brig', 'frigate'],
  },
];

export function makeSkirmishConfig(preset: SkirmishPreset, seed: number): BattleConfig {
  const rng = new SeededRng(seed);
  return {
    seed,
    windStrength: 0.75 + rng.range(0, 0.25),
    windDir: rng.range(0, Math.PI * 2),
    maxTicks: DEFAULT_MAX_TICKS,
    teams: [{ hullClasses: preset.team0 }, { hullClasses: preset.team1 }],
  };
}

/**
 * Headless battle harness — the balance tool and the determinism contract.
 * Same seed + same stepping = identical fingerprint, forever.
 */
import type { HullClassId } from '../../content/ships';
import { SeededRng } from '../rng';
import { Battle, rollCaptain, runToEnd } from './battle';
import type { BattleConfig, BattleResult } from './types';
import { BATTLE_TICK, DEFAULT_MAX_TICKS } from './types';

export interface HarnessPairing {
  team0: HullClassId[];
  team1: HullClassId[];
}

export function makeConfig(pairing: HarnessPairing, seed: number, windDir?: number): BattleConfig {
  const rng = new SeededRng(seed);
  return {
    seed,
    windDir: windDir ?? rng.range(0, Math.PI * 2),
    windStrength: 0.8,
    maxTicks: DEFAULT_MAX_TICKS,
    teams: [
      { hullClasses: pairing.team0, captains: pairing.team0.map(() => rollCaptain(rng)) },
      { hullClasses: pairing.team1 },
    ],
  };
}

/** Run a full battle headless; returns result + fingerprint. */
export function runHeadless(config: BattleConfig): { result: BattleResult; fingerprint: number } {
  const battle = new Battle(config);
  const result = runToEnd(battle);
  return { result, fingerprint: fingerprintBattle(config, result, battle.events.length) };
}

export function fingerprintBattle(
  config: BattleConfig,
  result: BattleResult,
  eventCount: number,
): number {
  const values = [
    config.seed,
    result.winner === 'DRAW' ? -1 : result.winner,
    result.ticks,
    eventCount,
  ];
  for (const r of result.remaining) values.push(Math.round(r.hullRatio * 1000));
  for (const n of result.sunk) values.push(hashString(n));
  for (const n of result.struck) values.push(hashString(n));
  for (const n of result.escaped ?? []) values.push(hashString(n));
  return hashNumbers(values);
}

/** Two identical headless runs must produce identical fingerprints. */
export function runDeterminismCheck(pairing: HarnessPairing, seed = 42_001): boolean {
  const a = runHeadless(makeConfig(pairing, seed));
  const b = runHeadless(makeConfig(pairing, seed));
  return a.fingerprint === b.fingerprint;
}

/** Win-rate bands for a pairing over N runs. */
export function matchupStats(
  pairing: HarnessPairing,
  runs = 100,
  startSeed = 9000,
): { wins0: number; wins1: number; draws: number; avgTicks: number } {
  let wins0 = 0;
  let wins1 = 0;
  let draws = 0;
  let ticks = 0;
  for (let i = 0; i < runs; i++) {
    const { result } = runHeadless(makeConfig(pairing, startSeed + i * 7919));
    if (result.winner === 0) wins0++;
    else if (result.winner === 1) wins1++;
    else draws++;
    ticks += result.ticks;
  }
  return { wins0, wins1, draws, avgTicks: Math.round(ticks / runs) };
}

function hashNumbers(values: number[]): number {
  let h = 2166136261;
  for (const v of values) {
    h ^= (v | 0) >>> 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const SIM_TIME = BATTLE_TICK;

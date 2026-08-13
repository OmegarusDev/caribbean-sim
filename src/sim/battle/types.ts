/**
 * Sea battle domain types. The sim is a pure function over this state:
 * createBattle(config) → stepBattle(state) → result. Nothing here touches
 * rendering or wall-clock time.
 */
import type { HullClassId } from '../../content/ships';

export type ShipIntention =
  | 'CHASE'
  | 'BREACH'
  | 'EVADE'
  | 'WHEEL'
  | 'HOLD'
  | 'STRIKE';

export type BattlePhase = 'ongoing' | 'ended';

export interface Captain {
  skill: number;
  bravery: number;
  focus: number;
  determination: number;
}

export interface ShipState {
  id: string;
  team: 0 | 1;
  name: string;
  hullClass: HullClassId;
  captain: Captain;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
  speed: number;
  sailState: number;
  rudder: number;
  hull: number;
  maxHull: number;
  sails: number;
  maxSails: number;
  crew: number;
  maxCrew: number;
  morale: number;
  maxMorale: number;
  onFire: boolean;
  fireT: number;
  reload: number;
  intention: ShipIntention;
  targetId: string | null;
  grappledWith: string | null;
  boardLeader: boolean;
  boardTicks: number;
  sunk: boolean;
  struck: boolean;
  lastSternAim: boolean;
  aiT: number;
  aimHeading: number;
}

export interface BattleConfig {
  seed: number;
  teams: Array<{
    hullClasses: HullClassId[];
    captains?: Captain[];
    names?: string[];
  }>;
  /** 0..1 scalar; direction of the wind in radians. */
  windStrength: number;
  windDir: number;
  maxTicks: number;
  spacing?: number;
}

export interface BattleResult {
  winner: 0 | 1 | 'DRAW';
  ticks: number;
  remaining: Array<{
    id: string;
    team: 0 | 1;
    name: string;
    hullClass: HullClassId;
    hullRatio: number;
  }>;
  captured: string[];
  sunk: string[];
  struck: string[];
}

export const BATTLE_TICK = 0.05;
export const DEFAULT_MAX_TICKS = 60 * 60 * 3;

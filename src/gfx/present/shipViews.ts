/**
 * Game-layer mapping: battle/preview state → WorldEntity.
 * The engine stays domain-free; all pirate knowledge lives here.
 */
import { HULL_CLASSES } from '../../content/ships';
import type { HullClassId } from '../../content/ships';
import type { ShipState } from '../../sim/battle/types';
import type { WorldEntity } from '../world/entities';

export const TEAM_STRIPE: Record<0 | 1, [number, number, number]> = {
  0: [0.18, 0.49, 0.54],
  1: [0.75, 0.4, 0.33],
};
export const TEAM_FLAG: Record<0 | 1, [number, number, number]> = {
  0: [0.29, 0.65, 0.71],
  1: [0.85, 0.48, 0.41],
};

export interface ShipEntityOpts {
  selected?: boolean;
  time: number;
  windDir: number;
  /** 0..1 sink progress for sunk ships. */
  sinkT?: number;
  extraY?: number;
}

/** Stable per-ship phase (bob/flutter) derived from the id. */
export function shipPhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 628) / 100;
}

export function shipToEntity(s: ShipState, opts: ShipEntityOpts): WorldEntity {
  const cls = HULL_CLASSES[s.hullClass];
  const phase = shipPhase(s.id);
  let pitch = Math.sin(opts.time * 0.8 + phase) * 0.018;
  let roll = Math.sin(opts.time * 0.9 + phase * 1.3) * 0.025;
  let y = Math.sin(opts.time * 0.85 + phase) * 1.2 + (opts.extraY ?? 0);
  if (s.sunk) {
    const amt = Math.min(1, (opts.sinkT ?? 0) / 12);
    pitch -= amt * 1.05;
    y -= amt * amt * 26;
  } else {
    const way = Math.min(1, s.speed / cls.baseSpeed);
    roll += clamp(-s.rudder * way * 0.12, -0.28, 0.28);
  }
  return {
    id: s.id,
    meshId: `ship:${s.hullClass}`,
    x: s.x,
    z: s.y,
    y,
    yaw: -s.heading,
    pitch,
    roll,
    scale: 1,
    radius: cls.length * 0.8,
    stripe: TEAM_STRIPE[s.team],
    flag: TEAM_FLAG[s.team],
    sailRatio: s.struck ? 0.15 : Math.max(0.1, s.sails / s.maxSails),
    windLocal: [Math.cos(opts.windDir - s.heading), Math.sin(opts.windDir - s.heading)],
    phase,
    visible: true,
  };
}

/** Selection ring entity (flat gold, scale = length * 0.72). */
export function ringEntity(s: ShipState): WorldEntity {
  const cls = HULL_CLASSES[s.hullClass];
  return {
    id: `ring:${s.id}`,
    meshId: 'ring',
    x: s.x,
    z: s.y,
    y: 0.2,
    yaw: 0,
    pitch: 0,
    roll: 0,
    scale: cls.length * 0.72,
    radius: 0,
    stripe: [0.94, 0.79, 0.43],
    flag: [1, 1, 1],
    sailRatio: 1,
    windLocal: [0, 0],
    phase: 0,
    visible: true,
  };
}

/** A pristine ShipState for previews (select screens, shipyard later). */
export function makePreviewShip(
  id: string,
  team: 0 | 1,
  name: string,
  hullClass: HullClassId,
  heading: number,
): ShipState {
  const cls = HULL_CLASSES[hullClass];
  return {
    id,
    team,
    name,
    hullClass,
    captain: { skill: 60, bravery: 60, focus: 60, determination: 60 },
    x: 0,
    y: 0,
    heading,
    vx: 0,
    vy: 0,
    speed: 0,
    sailState: 1,
    rudder: 0,
    hull: cls.maxHull,
    maxHull: cls.maxHull,
    sails: cls.maxSails,
    maxSails: cls.maxSails,
    crew: cls.maxCrew,
    maxCrew: cls.maxCrew,
    morale: cls.maxMorale,
    maxMorale: cls.maxMorale,
    onFire: false,
    fireT: 0,
    reload: 0,
    intention: 'HOLD',
    targetId: null,
    grappledWith: null,
    boardLeader: false,
    boardTicks: 0,
    sunk: false,
    struck: false,
    lastSternAim: false,
    aiT: 0,
    aimHeading: heading,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

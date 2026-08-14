/**
 * Captain AI — the phase engine.
 *
 * Each ship sails inside an engagement phase that reads like real naval
 * combat: approach from the windward side (the weather gauge, tacking when
 * pinched), stare down the enemy at range, exchange broadside passes
 * (close to fire, wheel away to reload), press an advantage (chase, cross
 * the T, rake), flee downwind when beaten, or set up a boarding alongside.
 * Personality stats shape every decision:
 *   skill         → gun accuracy (battle.ts) and sailing efficiency here
 *   bravery       → aggression, boarding appetite, pressing after damage
 *   focus         → steady aim, orbit discipline, target stickiness
 *   determination → chase persistence, last stands, strike resistance
 */
import { HULL_CLASSES } from '../../content/ships';
import { SeededRng } from '../rng';
import { clamp, clamp01, normalizeAngle } from './battle';
import type { CaptainPhase, ShipIntention, ShipState } from './types';

const NO_SAIL_ANGLE = 0.96; // rad — pinching harder than this is impossible
const PHASE_EVAL_TICKS = 5; // re-evaluate the phase every ~2s of sim time
const TACK_FLIP_TICKS = 150;

export function updateCaptain(
  ship: ShipState,
  ships: ShipState[],
  rng: SeededRng,
  windDir: number,
  tick: number,
): void {
  const cls = HULL_CLASSES[ship.hullClass];

  if (ship.grappledWith !== null) {
    ship.rudder = 0;
    ship.sailState = 0.4;
    ship.phase = 'boarding';
    ship.intention = 'BREACH';
    return;
  }

  const enemy = nearestEnemy(ship, ships);
  if (!enemy) {
    ship.phase = 'approach';
    ship.intention = 'HOLD';
    ship.sailState = 0.2;
    ship.rudder = 0;
    ship.targetId = null;
    return;
  }

  const dx = enemy.x - ship.x;
  const dy = enemy.y - ship.y;
  const dist = Math.hypot(dx, dy);
  ship.targetId = enemy.id;

  ship.tacticT++;
  if (ship.tacticT >= PHASE_EVAL_TICKS) {
    ship.phase = decidePhase(ship, enemy, dist, rng, tick);
    ship.tacticT = 0;
  }
  const phase = ship.phase;

  let aim: number;
  switch (phase) {
    case 'approach':
      aim = approachAim(ship, enemy, dx, dy, dist, windDir, rng, tick);
      ship.sailState = 1;
      break;
    case 'stare':
      aim = stareAim(ship, tick);
      ship.sailState = 0.7;
      break;
    case 'exchange':
      aim = exchangeAim(ship, enemy, rng);
      ship.sailState = 1;
      break;
    case 'pressing':
      aim = pressingAim(enemy, dx, dy, dist);
      ship.sailState = 1;
      break;
    case 'fleeing':
      aim = fleeAim(windDir, tick);
      ship.sailState = 1;
      break;
    case 'boarding':
      aim = Math.atan2(dy, dx);
      ship.sailState = 0.55;
      break;
    default:
      aim = ship.aimHeading;
      ship.sailState = 0.3;
  }
  ship.aimHeading = aim;

  const diff = normalizeAngle(aim - ship.heading);
  const noise =
    ((ship.captain.focus - 50) / 100) * 0.35 + ((100 - ship.captain.skill) / 100) * 0.3;
  ship.rudder = clamp((diff + rng.range(-noise, noise)) * 2.0 / cls.turnRate, -1, 1);
  ship.intention = intentionFor(phase);
}

function intentionFor(phase: CaptainPhase): ShipIntention {
  switch (phase) {
    case 'approach':
      return 'CHASE';
    case 'stare':
      return 'HOLD';
    case 'exchange':
      return 'WHEEL';
    case 'pressing':
      return 'CHASE';
    case 'fleeing':
      return 'EVADE';
    case 'boarding':
      return 'BREACH';
  }
}

function nearestEnemy(ship: ShipState, ships: ShipState[]): ShipState | null {
  let best: ShipState | null = null;
  let bestD = Infinity;
  for (const s of ships) {
    if (s === ship || s.team === ship.team || s.sunk || s.struck) continue;
    const d = Math.hypot(s.x - ship.x, s.y - ship.y);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function decidePhase(
  ship: ShipState,
  enemy: ShipState,
  dist: number,
  rng: SeededRng,
  tick: number,
): CaptainPhase {
  const cls = HULL_CLASSES[ship.hullClass];
  const enCls = HULL_CLASSES[enemy.hullClass];
  const hullRatio = clamp01(ship.hull / ship.maxHull);
  const crewRatio = clamp01(ship.crew / ship.maxCrew);
  const enHull = clamp01(enemy.hull / enemy.maxHull);
  const enCrew = clamp01(enemy.crew / enemy.maxCrew);
  const brave = (ship.captain.bravery - 50) / 50; // -1..1
  const determined = (ship.captain.determination - 50) / 50;

  const beaten = hullRatio < 0.3 || crewRatio < 0.35;
  const winning = hullRatio - enHull > 0.15 || crewRatio - enCrew > 0.15;
  const desperate = hullRatio < 0.18 && crewRatio < 0.3;

  if (desperate) {
    // Out of options: if we can outrun the foe, flee; else gamble on a board.
    if (cls.baseSpeed > enCls.baseSpeed * 1.05 && rng.chance(0.6)) return 'fleeing';
    return 'boarding';
  }
  if (beaten) {
    if (rng.chance(clamp01(0.3 - determined * 0.25))) return 'pressing'; // last stand
    return 'fleeing';
  }
  if (winning) {
    if (dist < 420 && brave > 0.15 && crewRatio > enCrew + 0.05 && rng.chance(0.5)) {
      return 'boarding';
    }
    return 'pressing';
  }
  if (dist > cls.gunRange * 1.12) {
    // The opening: healthy ships on open water size each other up.
    if (tick < 420 && dist > 560 && rng.chance(0.5)) return 'stare';
    return 'approach';
  }
  return 'exchange';
}

/** Close from the enemy's windward side — and tack when the course pinches. */
function approachAim(
  ship: ShipState,
  enemy: ShipState,
  dx: number,
  dy: number,
  dist: number,
  windDir: number,
  rng: SeededRng,
  tick: number,
): number {
  const wx = Math.cos(windDir);
  const wy = Math.sin(windDir);
  // Approach point: on the enemy's windward side, about halfway out.
  const tx = enemy.x - wx * dist * 0.55;
  const ty = enemy.y - wy * dist * 0.55;
  const aim = Math.atan2(ty - ship.y, tx - ship.x);
  const relWind = Math.abs(normalizeAngle(aim - windDir));
  if (relWind < NO_SAIL_ANGLE) return aim;
  // Pinched: tack — beat toward the target's side of the wind, alternating
  // the favorable tack so the ship makes progress instead of stalling.
  const targetBearing = Math.atan2(dy, dx);
  const toward = Math.sign(Math.sin(targetBearing - windDir)) || 1;
  const beat = Math.floor(tick / TACK_FLIP_TICKS) % 2 === 0 ? 1 : -1;
  const skill = ship.captain.skill;
  const tackAngle = NO_SAIL_ANGLE * 0.92 * (0.9 + 0.1 * (skill / 100));
  return normalizeAngle(windDir + toward * beat * tackAngle + rng.range(-0.02, 0.02));
}

/** Mutual caution at range — hold a gentle yaw and wait. */
function stareAim(ship: ShipState, tick: number): number {
  return ship.aimHeading + Math.sin(tick * 0.012 + ship.orbitSign) * 0.3;
}

/**
 * Broadside passes: orbit the enemy's beam line. When guns are ready, close
 * in for the pass; when they've fired, wheel away to reload and come again.
 */
function exchangeAim(
  ship: ShipState,
  enemy: ShipState,
  rng: SeededRng,
): number {
  if (rng.chance(0.01)) ship.orbitSign = ship.orbitSign === 1 ? -1 : 1;
  const ready = shipHasReadyGuns(ship);
  const beam = enemy.heading + ship.orbitSign * (Math.PI / 2);
  const range = ready ? 150 : 430;
  const tx = enemy.x + Math.cos(beam) * range;
  const ty = enemy.y + Math.sin(beam) * range;
  // Close for the pass when guns are ready; wheel away to reload after.
  return Math.atan2(ty - ship.y, tx - ship.x);
}

/** Advantage: chase and cross the enemy's T for raking fire. */
function pressingAim(
  enemy: ShipState,
  dx: number,
  dy: number,
  dist: number,
): number {
  const fwd = enemy.heading;
  let perpX = -Math.sin(fwd);
  let perpY = Math.cos(fwd);
  if (perpX * dx + perpY * dy < 0) {
    perpX = -perpX;
    perpY = -perpY;
  }
  if (dist < 420) {
    // Cross its bow: aim at a point ahead of the enemy's heading.
    return Math.atan2(dy + Math.sin(fwd) * 190, dx + Math.cos(fwd) * 190);
  }
  const leadT = clamp(dist / 460, 0.4, 1.8);
  return Math.atan2(dy + enemy.vy * leadT + perpY * 260, dx + enemy.vx * leadT + perpX * 260);
}

/** Run downwind with a lazy sway to spoil the enemy's aim. */
function fleeAim(windDir: number, tick: number): number {
  return windDir + Math.sin(tick * 0.045) * 0.22;
}

/** Any gun loaded (or within the early-press grace) on either side. */
function shipHasReadyGuns(ship: ShipState): boolean {
  for (const gun of ship.guns) {
    if (gun.reload <= 0 || gun.reload <= gun.max * 0.15) return true;
  }
  return false;
}

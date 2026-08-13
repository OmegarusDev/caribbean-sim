/**
 * Captain AI — fallible autopilots (the Apex DriverBrain pattern) steering
 * Lanista-style intentions. Personality stats shape every decision:
 *   skill         → gun accuracy (in battle.ts) and turn-noise (here)
 *   bravery       → boarding appetite, strike resistance, aggression
 *   focus         → target stickiness and steady aim
 *   determination → chase persistence, strike resistance
 */
import { HULL_CLASSES } from '../../content/ships';
import { SeededRng } from '../rng';
import { clamp, clamp01, normalizeAngle } from './battle';
import type { ShipIntention, ShipState } from './types';

export function updateCaptain(
  ship: ShipState,
  ships: ShipState[],
  rng: SeededRng,
  windDir: number,
): void {
  const cls = HULL_CLASSES[ship.hullClass];

  if (ship.grappledWith !== null) {
    ship.rudder = 0;
    ship.sailState = 0.4;
    ship.intention = 'BREACH';
    return;
  }

  const enemy = nearestEnemy(ship, ships);
  if (!enemy) {
    ship.intention = 'HOLD';
    ship.sailState = 0.2;
    ship.rudder = 0;
    ship.targetId = null;
    return;
  }

  const dx = enemy.x - ship.x;
  const dy = enemy.y - ship.y;
  const dist = Math.hypot(dx, dy);

  if (ship.targetId !== null && ship.captain.focus > 55) {
    const stick = ships.find((s) => s.id === ship.targetId && !s.sunk && !s.struck);
    if (stick && Math.hypot(stick.x - ship.x, stick.y - ship.y) < cls.gunRange * 2.2) {
      // keep current target — resolved below by re-picking the same enemy
    }
  }
  ship.targetId = enemy.id;

  const hullRatio = clamp01(ship.hull / ship.maxHull);
  const crewRatio = clamp01(ship.crew / ship.maxCrew);
  const morale01 = clamp01(ship.morale / ship.maxMorale);
  const enCrewRatio = clamp01(enemy.crew / enemy.maxCrew);

  const aggression =
    ((ship.captain.bravery - 40) / 90) * 0.55 +
    ((ship.captain.focus - 50) / 100) * 0.3 +
    rng.range(-0.2, 0.2);
  const fear = (1 - morale01) * 0.45 + (1 - crewRatio) * 0.25;

  let intention: ShipIntention;
  const weakened = hullRatio < 0.24 || crewRatio < 0.32;
  const outnumbered = countAlive(ships, enemy.team) > countAlive(ships, ship.team);

  if (weakened || (outnumbered && hullRatio < 0.4)) {
    intention = 'EVADE';
  } else if (dist < 170) {
    const confident =
      aggression - fear > -0.05 &&
      crewRatio > 0.6 &&
      hullRatio > 0.5 &&
      crewRatio >= enCrewRatio - 0.08;
    intention = confident ? 'BREACH' : 'EVADE';
  } else if (dist < cls.gunRange * 1.1) {
    // In gun range: maneuver to the beam — never charge head-on.
    intention = aggression - fear > -0.15 ? 'WHEEL' : 'EVADE';
  } else {
    intention = aggression > -0.05 ? 'CHASE' : 'HOLD';
  }
  ship.intention = intention;

  const aim = pickAim(ship, enemy, dx, dy, dist, intention, windDir, rng);
  ship.aimHeading = aim;

  const diff = normalizeAngle(aim - ship.heading);
  const noise = ((ship.captain.focus - 50) / 100) * 0.5;
  const rudder = clamp((diff + rng.range(-noise, noise)) * 2.0 / cls.turnRate, -1, 1);
  ship.rudder = rudder;

  ship.sailState =
    intention === 'BREACH' ? 0.6 : intention === 'WHEEL' ? 0.85 : intention === 'HOLD' ? 0.2 : 1;
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

function countAlive(ships: ShipState[], team: 0 | 1): number {
  let n = 0;
  for (const s of ships) {
    if (s.team === team && !s.sunk && !s.struck) n++;
  }
  return n;
}

function pickAim(
  ship: ShipState,
  enemy: ShipState,
  dx: number,
  dy: number,
  dist: number,
  intention: ShipIntention,
  windDir: number,
  rng: SeededRng,
): number {
  switch (intention) {
    case 'BREACH':
      return Math.atan2(dy, dx);
    case 'CHASE': {
      const leadT = clamp(dist / 420, 0, 2.4);
      return Math.atan2(dy + enemy.vy * leadT, dx + enemy.vx * leadT);
    }
    case 'WHEEL': {
      let perpX = -Math.sin(enemy.heading);
      let perpY = Math.cos(enemy.heading);
      if (perpX * dx + perpY * dy < 0) {
        perpX = -perpX;
        perpY = -perpY;
      }
      // Lead the beam point so we cross its T, not sail into its bow.
      const leadT = clamp(dist / 520, 0.4, 1.8);
      return Math.atan2(dy + enemy.vy * leadT + perpY * 300, dx + enemy.vx * leadT + perpX * 300);
    }
    case 'EVADE': {
      const wx = Math.cos(windDir);
      const wy = Math.sin(windDir);
      let aim = Math.atan2(wy, wx);
      const rel = normalizeAngle(aim - ship.heading);
      if (Math.abs(rel) < 0.5) {
        const jitter = rng.chance(0.5) ? 1 : -1;
        aim = windDir + jitter * (Math.PI / 2) * 0.8;
      }
      return aim;
    }
    case 'HOLD':
    default:
      return ship.aimHeading;
  }
}

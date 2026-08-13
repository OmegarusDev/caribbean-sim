/**
 * Sea battle sim — a pure, deterministic domain.
 * createBattle(config) → stepBattle(state) → buildResult(state).
 * All randomness flows through one split stream; the sim never sees wall time.
 */
import { HULL_CLASSES, SHIP_NAMES_A, SHIP_NAMES_B } from '../../content/ships';
import type { HullClassId } from '../../content/ships';
import { SeededRng } from '../rng';
import { EventRing, type SimEvent } from '../events';
import { updateCaptain } from './captain';
import type {
  BattleConfig,
  BattleResult,
  BattlePhase,
  Captain,
  GunState,
  ShipReadiness,
  ShipState,
} from './types';
import { BATTLE_TICK, DEFAULT_MAX_TICKS } from './types';

/** Hull grip on the water — lateral velocity decays fast so the hull faces
 * its course; hard turns leave only ~10-15° of leeway (realistic crab). */
const DRIFT = 3.6;
/** Pressing fire early: guns within this fraction of their reload still go off. */
const EARLY_FIRE_FRAC = 0.15;
const GRAPPLE_MULT = 0.55;
const BOARD_RESOLVE_TICKS = 10;
const BOARD_MAX_TICKS = 600;
const STRIKE_THREAT_RANGE = 700;

export class Battle {
  readonly seed: number;
  readonly config: BattleConfig;
  readonly rng: SeededRng;
  readonly events: EventRing;
  ships: ShipState[] = [];
  tick = 0;
  phase: BattlePhase = 'ongoing';
  private recent: SimEvent[] = [];

  constructor(config: BattleConfig) {
    this.seed = config.seed;
    this.config = config;
    this.rng = new SeededRng(config.seed).split(0x0b1a7e);
    this.events = new EventRing(128);
    this.spawn();
  }

  getRecentEvents(): SimEvent[] {
    return this.recent;
  }

  clearRecentEvents(): void {
    this.recent = [];
  }

  private spawn(): void {
    const spacing = this.config.spacing ?? 620;
    let idx = 0;
    for (const team of [0, 1] as const) {
      const hulls = this.config.teams[team]!.hullClasses;
      const captains = this.config.teams[team]!.captains;
      const names = this.config.teams[team]!.names;
      for (let i = 0; i < hulls.length; i++) {
        const hullClass = hulls[i]!;
        const c = HULL_CLASSES[hullClass];
        const facing = team === 0 ? Math.PI : 0;
        const side = i - (hulls.length - 1) / 2;
        const x = team === 0 ? spacing / 2 : -spacing / 2;
        const y = side * (c.length * 0.75 + 60);
        const name =
          names?.[i] ??
          (team === 0
            ? SHIP_NAMES_A[idx % SHIP_NAMES_A.length]
            : SHIP_NAMES_B[idx % SHIP_NAMES_B.length]);
        const captain: Captain = captains?.[i] ?? rollCaptain(this.rng);
        const ship = createShip(`t${team}s${i}`, team, name, hullClass, captain, x, y, facing);
        ship.guns = initGuns(this.rng, hullClass);
        this.ships.push(ship);
        idx++;
      }
    }
  }

  step(): void {
    if (this.phase !== 'ongoing') return;
    this.tick++;
    this.recent = [];

    for (const ship of this.ships) {
      if (ship.sunk || ship.struck) continue;
      if (ship.id === this.config.playerShipId) {
        ship.intention = 'MANUAL';
        continue;
      }
      ship.aiT -= BATTLE_TICK;
      if (ship.aiT <= 0) {
        updateCaptain(ship, this.ships, this.rng, this.config.windDir);
        ship.aiT = 0.4;
      }
    }

    for (const ship of this.ships) {
      if (ship.sunk || ship.struck) continue;
      this.applyPhysics(ship);
    }

    this.applyGrappleConstraints();

    for (const ship of this.ships) {
      if (ship.sunk || ship.struck) continue;
      if (ship.onFire) this.burn(ship);
      this.recoverMorale(ship);
    }

    this.resolveBoarding();
    for (const ship of this.ships) {
      if (ship.sunk || ship.struck) continue;
      for (const gun of ship.guns) gun.reload = Math.max(0, gun.reload - BATTLE_TICK);
    }
    for (const ship of this.ships) {
      if (ship.sunk || ship.struck) continue;
      if (ship.grappledWith !== null) continue;
      // The player presses fire; AI ships fire themselves.
      if (ship.id !== this.config.playerShipId) {
        for (const side of [-1, 1] as const) this.fireSideIfPossible(ship, side);
      }
      this.checkStrike(ship);
      this.checkSink(ship);
    }

    if (this.checkEnd()) this.phase = 'ended';
  }

  private applyPhysics(ship: ShipState): void {
    applyShipPhysics(ship, this.config.windDir, this.config.windStrength);
  }

  /** Guns ready (loaded, or within the early-press grace) on a side. */
  private sideReady(ship: ShipState, side: -1 | 1): boolean {
    for (const gun of ship.guns) {
      if (gun.side !== side) continue;
      if (gun.reload <= 0 || gun.reload <= gun.max * EARLY_FIRE_FRAC) return true;
    }
    return false;
  }

  private fireSideIfPossible(ship: ShipState, side: -1 | 1): boolean {
    const target = this.bestGunTarget(ship, side);
    if (!target) return false;
    if (!this.sideReady(ship, side)) return false;
    return this.fireSide(ship, side, target);
  }

  private bestGunTarget(ship: ShipState, side: -1 | 1): ShipState | null {
    const cls = HULL_CLASSES[ship.hullClass];
    let best: ShipState | null = null;
    let bestScore = Infinity;
    for (const other of this.ships) {
      if (other === ship || other.sunk || other.struck || other.team === ship.team) continue;
      if (other.grappledWith !== null) continue;
      const dist = Math.hypot(other.x - ship.x, other.y - ship.y);
      if (dist > cls.gunRange * 1.05) continue;
      if (this.arcSide(ship, other.x, other.y) !== side) continue;
      const score = dist - (other.lastSternAim ? 120 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  /** Which broadside (port −1 / starboard +1) the target sits in, or null. */
  private arcSide(ship: ShipState, tx: number, ty: number): -1 | 1 | null {
    const cls = HULL_CLASSES[ship.hullClass];
    const bearing = Math.atan2(ty - ship.y, tx - ship.x);
    const rel = normalizeAngle(bearing - ship.heading);
    const half = cls.guns <= 0 ? 0 : Math.PI / 2.6;
    const beam = Math.PI / 2;
    if (Math.abs(normalizeAngle(rel - beam)) <= half) return 1;
    if (Math.abs(normalizeAngle(rel + beam)) <= half) return -1;
    return null;
  }

  /** Fire every ready (or early-grace) gun on one side. True if anything fired. */
  private fireSide(ship: ShipState, side: -1 | 1, target: ShipState): boolean {
    const cls = HULL_CLASSES[ship.hullClass];
    const dist = Math.hypot(target.x - ship.x, target.y - ship.y);
    const bearing = Math.atan2(target.y - ship.y, target.x - ship.x);
    const rel = normalizeAngle(bearing - ship.heading);
    const raked = Math.abs(normalizeAngle(rel - target.heading)) < 0.9;
    const bowOn = Math.abs(normalizeAngle(rel - normalizeAngle(target.heading + Math.PI))) < 0.7;

    const hitChanceBase = 0.42 + ((ship.captain.skill - 50) / 100) * 0.6;
    const rangePenalty = 1 - 0.45 * clamp01(dist / cls.gunRange);

    let hullDamage = 0;
    let sailDamage = 0;
    let crewLoss = 0;
    let hits = 0;
    let fired = 0;
    for (const gun of ship.guns) {
      if (gun.side !== side) continue;
      if (gun.reload > 0 && gun.reload > gun.max * EARLY_FIRE_FRAC) continue;
      // Each reload cycle rolls a fresh rate within the band — the same gun
      // loads faster or slower shot-to-shot (still deterministic per seed).
      gun.max = cls.reload * (0.85 + 0.3 * this.rng.next());
      gun.reload = gun.max;
      fired++;
      const hitChance = hitChanceBase * rangePenalty * (0.85 + this.rng.next() * 0.3);
      if (this.rng.next() >= hitChance) continue;
      hits++;
      let dmg = cls.gunDamage * (0.8 + this.rng.next() * 0.4);
      if (raked) dmg *= 1.4;
      else if (bowOn) dmg *= 1.08;
      hullDamage += dmg;
      if (this.rng.chance(0.18)) sailDamage += dmg * 0.5;
      if (this.rng.chance(0.24)) crewLoss += 1;
    }
    if (fired === 0) return false;

    ship.lastSternAim = raked;

    this.pushEvent({
      kind: 'broadside',
      actor: ship.id,
      target: target.id,
      detail: `${side === 1 ? 'starboard' : 'port'}:${fired}`,
      tick: this.tick,
      severity: fired >= 8 ? 'notable' : 'info',
    });

    if (hits === 0) return true;

    target.hull = Math.max(0, target.hull - hullDamage);
    if (sailDamage > 0) target.sails = Math.max(0, target.sails - sailDamage);
    if (crewLoss > 0) target.crew = Math.max(0, target.crew - crewLoss);

    this.pushEvent({
      kind: 'broadsideHit',
      actor: ship.id,
      target: target.id,
      detail: raked ? 'raked' : bowOn ? 'bow' : 'beam',
      tick: this.tick,
      severity: raked ? 'major' : hits >= 6 ? 'notable' : 'info',
    });
    if (sailDamage > 0) {
      this.pushEvent({
        kind: 'sailHit',
        actor: ship.id,
        target: target.id,
        tick: this.tick,
        severity: 'info',
      });
    }
    if (crewLoss > 0) {
      this.pushEvent({
        kind: 'crewHit',
        actor: ship.id,
        target: target.id,
        tick: this.tick,
        severity: crewLoss >= 3 ? 'notable' : 'info',
      });
    }

    const fireChance = raked ? 0.14 : 0.06;
    if (!target.onFire && this.rng.chance(fireChance)) {
      target.onFire = true;
      target.fireT = 16 + this.rng.range(0, 8);
      this.pushEvent({
        kind: 'fireStart',
        actor: target.id,
        target: ship.id,
        tick: this.tick,
        severity: 'major',
      });
    }

    const moraleHit = (hullDamage / cls.maxHull) * 12 + (raked ? 8 : 0) + crewLoss * 3;
    target.morale -= moraleHit;
    return true;
  }

  /** Player API: pull the trigger — every qualified side fires. True if any fired. */
  fireRequest(shipId: string): boolean {
    const ship = this.ships.find((s) => s.id === shipId);
    if (!ship || ship.sunk || ship.struck || ship.grappledWith !== null) return false;
    if (this.phase !== 'ongoing') return false;
    let fired = false;
    for (const side of [-1, 1] as const) {
      if (this.fireSideIfPossible(ship, side)) fired = true;
    }
    return fired;
  }

  /** Player API: per-side gun readiness + target presence for the fire UI. */
  shipReadiness(shipId: string): ShipReadiness | null {
    const ship = this.ships.find((s) => s.id === shipId);
    if (!ship || ship.sunk || ship.struck) return null;
    const read = (side: -1 | 1) => {
      let loaded = 0;
      let total = 0;
      for (const gun of ship.guns) {
        if (gun.side !== side) continue;
        total++;
        if (gun.reload <= 0 || gun.reload <= gun.max * EARLY_FIRE_FRAC) loaded++;
      }
      return {
        loadedFrac: total > 0 ? loaded / total : 0,
        hasTarget: this.bestGunTarget(ship, side) !== null,
      };
    };
    return { port: read(-1), starboard: read(1) };
  }

  private applyGrappleConstraints(): void {
    for (const leader of this.ships) {
      if (!leader.boardLeader || leader.grappledWith === null) continue;
      const other = this.ships.find((s) => s.id === leader.grappledWith);
      if (!other) continue;
      const clsA = HULL_CLASSES[leader.hullClass];
      const clsB = HULL_CLASSES[other.hullClass];
      const common = normalizeAngle(Math.atan2(
        Math.sin(leader.heading) + Math.sin(other.heading),
        Math.cos(leader.heading) + Math.cos(other.heading),
      ));
      leader.heading = rotateToward(leader.heading, common, 0.05);
      other.heading = rotateToward(other.heading, common, 0.05);
      const avx = (leader.vx + other.vx) / 2;
      const avy = (leader.vy + other.vy) / 2;
      leader.vx = avx;
      leader.vy = avy;
      other.vx = avx;
      other.vy = avy;
      leader.speed = Math.hypot(avx, avy);
      other.speed = leader.speed;
      const perpX = -Math.sin(common);
      const perpY = Math.cos(common);
      const gap = (clsA.length + clsB.length) * 0.28;
      other.x = leader.x + perpX * gap;
      other.y = leader.y + perpY * gap;
    }
  }

  private burn(ship: ShipState): void {
    ship.hull = Math.max(0, ship.hull - 0.5);
    ship.crew = Math.max(0, ship.crew - 0.06);
    ship.sails = Math.max(0, ship.sails - 0.3);
    ship.fireT -= BATTLE_TICK;
    if (ship.fireT <= 0) {
      if (this.rng.chance(0.6)) {
        ship.onFire = false;
      } else {
        ship.fireT = 6;
      }
    }
  }

  private recoverMorale(ship: ShipState): void {
    const threat = this.ships.some(
      (o) =>
        o !== ship &&
        o.team !== ship.team &&
        !o.sunk &&
        !o.struck &&
        Math.hypot(o.x - ship.x, o.y - ship.y) < STRIKE_THREAT_RANGE,
    );
    if (!threat && ship.morale < 100) {
      ship.morale = Math.min(100, ship.morale + 0.02);
    }
  }

  private resolveBoarding(): void {
    const pairs: Array<[ShipState, ShipState]> = [];
    for (const a of this.ships) {
      if (a.sunk || a.struck) continue;
      for (const b of this.ships) {
        if (a === b || b.sunk || b.struck || a.team === b.team) continue;
        const clsA = HULL_CLASSES[a.hullClass];
        const clsB = HULL_CLASSES[b.hullClass];
        const grapple = (clsA.length + clsB.length) * GRAPPLE_MULT;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
        if (dist < grapple && relSpeed < 90) pairs.push([a, b]);
      }
    }

    for (const [a, b] of pairs) {
      if (a.grappledWith !== null || b.grappledWith !== null) continue;
      const wantsA =
        a.intention === 'BREACH' && a.crew > a.maxCrew * 0.25 && a.morale > 25;
      const wantsB =
        b.intention === 'BREACH' && b.crew > b.maxCrew * 0.25 && b.morale > 25;
      if (!wantsA && !wantsB) continue;
      const attacker = wantsA && (!wantsB || this.boardStrength(a) >= this.boardStrength(b)) ? a : b;
      const defender = attacker === a ? b : a;
      this.grapple(attacker, defender);
    }

    for (const ship of this.ships) {
      if (ship.sunk || ship.struck || ship.grappledWith === null) continue;
      if (!ship.boardLeader) continue;
      ship.boardTicks += 1;
      if (ship.boardTicks % BOARD_RESOLVE_TICKS !== 0) continue;
      const other = this.ships.find((s) => s.id === ship.grappledWith);
      if (!other) continue;
      this.resolveBoardFight(ship, other);
    }
  }

  private grapple(attacker: ShipState, defender: ShipState): void {
    attacker.grappledWith = defender.id;
    defender.grappledWith = attacker.id;
    attacker.boardLeader = true;
    attacker.boardTicks = 0;
    defender.boardTicks = 0;
    this.pushEvent({
      kind: 'boardAttempt',
      actor: attacker.id,
      target: defender.id,
      tick: this.tick,
      severity: 'notable',
    });
  }

  private boardStrength(ship: ShipState): number {
    const cls = HULL_CLASSES[ship.hullClass];
    return (
      ship.crew *
      (0.75 + 0.25 * (ship.morale / ship.maxMorale)) *
      (1 + cls.boardingBonus) *
      (1 + (ship.captain.bravery - 50) / 125)
    );
  }

  private resolveBoardFight(attacker: ShipState, defender: ShipState): void {
    const clsA = HULL_CLASSES[attacker.hullClass];
    const clsD = HULL_CLASSES[defender.hullClass];
    const atkStr = this.boardStrength(attacker);
    const defStr = this.boardStrength(defender);

    const aLoss = 0.02 * (defStr / Math.max(1, atkStr)) * attacker.crew;
    const dLoss = 0.02 * (atkStr / Math.max(1, defStr)) * defender.crew;
    attacker.crew = Math.max(0, attacker.crew - aLoss);
    defender.crew = Math.max(0, defender.crew - dLoss);
    defender.morale = Math.max(0, defender.morale - 1.5);
    attacker.morale = Math.max(0, attacker.morale - 0.8);

    if (attacker.boardTicks >= BOARD_MAX_TICKS) {
      this.repulse(attacker, defender);
      return;
    }
    if (attacker.crew <= clsA.maxCrew * 0.25) {
      this.repulse(attacker, defender);
      return;
    }
    if (defender.crew <= clsD.maxCrew * 0.25) {
      this.capture(attacker, defender);
    }
  }

  private repulse(attacker: ShipState, defender: ShipState): void {
    this.breakGrapple(attacker, defender);
    defender.morale = Math.min(100, defender.morale + 12);
    attacker.morale = Math.max(0, attacker.morale - 22);
    this.pushEvent({
      kind: 'boardRepulse',
      actor: attacker.id,
      target: defender.id,
      tick: this.tick,
      severity: 'major',
    });
  }

  private capture(attacker: ShipState, defender: ShipState): void {
    this.breakGrapple(attacker, defender);
    defender.struck = true;
    attacker.morale = Math.min(100, attacker.morale + 20);
    this.pushEvent({
      kind: 'capture',
      actor: attacker.id,
      target: defender.id,
      tick: this.tick,
      severity: 'major',
    });
  }

  private breakGrapple(a: ShipState, b: ShipState): void {
    a.grappledWith = null;
    b.grappledWith = null;
    a.boardLeader = false;
    b.boardLeader = false;
    a.boardTicks = 0;
    b.boardTicks = 0;
  }

  private checkStrike(ship: ShipState): void {
    if (ship.morale > 0) return;
    // A ship only strikes when it is actually beaten up — otherwise it flees.
    const hullRatio = ship.hull / ship.maxHull;
    const crewRatio = ship.crew / ship.maxCrew;
    const sailRatio = ship.sails / ship.maxSails;
    const beaten = crewRatio < 0.4 || hullRatio < 0.3 || sailRatio < 0.25;
    if (!beaten) {
      ship.intention = 'EVADE';
      return;
    }
    const resist = (ship.captain.bravery - 50) * 0.18 + (ship.captain.determination - 50) * 0.18;
    if (ship.morale > -resist) {
      ship.intention = 'EVADE';
      return;
    }
    ship.struck = true;
    ship.intention = 'STRIKE';
    ship.rudder = 0;
    ship.sailState = 0;
    this.pushEvent({
      kind: 'strike',
      actor: ship.id,
      tick: this.tick,
      severity: 'major',
    });
  }

  private checkSink(ship: ShipState): void {
    if (ship.hull > 0) return;
    ship.sunk = true;
    this.pushEvent({
      kind: 'sink',
      actor: ship.id,
      tick: this.tick,
      severity: 'major',
    });
  }

  private checkEnd(): boolean {
    const alive = (team: 0 | 1) =>
      this.ships.filter((s) => s.team === team && !s.sunk && !s.struck).length;
    if (alive(1) === 0) return true;
    if (alive(0) === 0) return true;
    if (this.tick >= (this.config.maxTicks ?? DEFAULT_MAX_TICKS)) return true;
    return false;
  }

  private pushEvent(ev: Omit<SimEvent, 'seq'>): void {
    const full = this.events.push(ev);
    this.recent.push(full);
  }

  buildResult(): BattleResult {
    const alive0 = this.ships.filter((s) => s.team === 0 && !s.sunk && !s.struck);
    const alive1 = this.ships.filter((s) => s.team === 1 && !s.sunk && !s.struck);
    let winner: BattleResult['winner'];
    if (alive1.length === 0) winner = 0;
    else if (alive0.length === 0) winner = 1;
    else {
      const hull0 = alive0.reduce((a, s) => a + s.hull / s.maxHull, 0);
      const hull1 = alive1.reduce((a, s) => a + s.hull / s.maxHull, 0);
      if (hull0 === hull1) winner = 'DRAW';
      else winner = hull0 > hull1 ? 0 : 1;
    }
    const remaining = [...alive0, ...alive1].map((s) => ({
      id: s.id,
      team: s.team,
      name: s.name,
      hullClass: s.hullClass,
      hullRatio: s.hull / s.maxHull,
    }));
    return {
      winner,
      ticks: this.tick,
      remaining,
      captured: this.ships.filter((s) => s.struck).map((s) => s.name),
      sunk: this.ships.filter((s) => s.sunk).map((s) => s.name),
      struck: this.ships.filter((s) => s.struck).map((s) => s.name),
    };
  }
}

export function createBattle(config: BattleConfig): Battle {
  return new Battle(config);
}

function createShip(
  id: string,
  team: 0 | 1,
  name: string,
  hullClass: HullClassId,
  captain: Captain,
  x: number,
  y: number,
  heading: number,
): ShipState {
  const cls = HULL_CLASSES[hullClass];
  return {
    id,
    team,
    name,
    hullClass,
    captain,
    x,
    y,
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
    guns: [],
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

/** Per-side cannons, each with its own reload rate (±15%, seeded) — loaded at start. */
function initGuns(rng: SeededRng, hullClass: HullClassId): GunState[] {
  const cls = HULL_CLASSES[hullClass];
  const guns: GunState[] = [];
  for (const side of [-1, 1] as const) {
    for (let g = 0; g < cls.guns; g++) {
      const max = cls.reload * (0.85 + 0.3 * rng.next());
      guns.push({ side, reload: 0, max });
    }
  }
  return guns;
}

export function rollCaptain(rng: SeededRng): Captain {
  return {
    skill: rng.int(35, 80),
    bravery: rng.int(30, 85),
    focus: rng.int(40, 85),
    determination: rng.int(35, 80),
  };
}

export function runToEnd(battle: Battle): BattleResult {
  while (battle.phase === 'ongoing') battle.step();
  return battle.buildResult();
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
}

/** Rotate `current` toward `target` by at most `maxDelta` radians. */
export function rotateToward(current: number, target: number, maxDelta: number): number {
  let diff = normalizeAngle(target - current);
  const step = clamp(diff, -maxDelta, maxDelta);
  return normalizeAngle(current + step);
}

/**
 * One tick of ship kinematics — exported so tests can verify the steering
 * contract: in steady state the hull faces its course (heading ≈ velocity).
 */
export function applyShipPhysics(
  ship: ShipState,
  windDir: number,
  windStrength: number,
): void {
  const cls = HULL_CLASSES[ship.hullClass];
  const dt = BATTLE_TICK;

  const hvx = Math.cos(ship.heading);
  const hvy = Math.sin(ship.heading);
  const along = ship.vx * hvx + ship.vy * hvy;

  const app = Math.cos(ship.heading - windDir);
  let windFactor = 0.35 + 0.65 * clamp01((1 + app) / 2);
  if (app < -0.5) windFactor *= 0.3;
  const sailFactor = ship.grappledWith !== null ? 0 : 0.2 + 0.8 * ship.sailState;
  const hullFactor = 0.75 + 0.25 * (ship.hull / cls.maxHull);
  let targetSpeed =
    cls.baseSpeed * (0.3 + 0.7 * windStrength) * windFactor * sailFactor * hullFactor;
  if (ship.grappledWith !== null) targetSpeed = 0;

  const newAlong = approach(along, targetSpeed, cls.accel * dt);
  const latX = ship.vx - hvx * along;
  const latY = ship.vy - hvy * along;
  const latDamp = Math.exp(-DRIFT * dt);
  ship.vx = hvx * newAlong + latX * latDamp;
  ship.vy = hvy * newAlong + latY * latDamp;

  const way = clamp01(Math.abs(newAlong) / cls.baseSpeed);
  const turn = clamp(ship.rudder, -1, 1) * cls.turnRate * (0.25 + 0.75 * way) * dt;
  ship.heading = normalizeAngle(ship.heading + turn);

  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  ship.speed = Math.hypot(ship.vx, ship.vy);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function normalizeAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

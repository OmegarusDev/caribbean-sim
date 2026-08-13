import { describe, expect, it } from 'vitest';
import { Battle, applyShipPhysics, normalizeAngle, runToEnd } from './battle';
import type { ShipState } from './types';
import type { HarnessPairing } from './harness';
import { makeConfig, matchupStats, runDeterminismCheck, runHeadless } from './harness';

const SL: HarnessPairing = { team0: ['sloop'], team1: ['sloop'] };
const FF: HarnessPairing = { team0: ['frigate'], team1: ['frigate'] };
const SL_VS_GA: HarnessPairing = { team0: ['sloop'], team1: ['galleon'] };
const MIXED: HarnessPairing = { team0: ['sloop', 'brig'], team1: ['sloop', 'brig'] };

function testShip(partial: Partial<ShipState> = {}): ShipState {
  return {
    id: 't0s0',
    team: 0,
    name: 'Test',
    hullClass: 'brig',
    captain: { skill: 60, bravery: 60, focus: 60, determination: 60 },
    x: 0,
    y: 0,
    heading: 0,
    vx: 0,
    vy: 0,
    speed: 0,
    sailState: 1,
    rudder: 0,
    hull: 1600,
    maxHull: 1600,
    sails: 1000,
    maxSails: 1000,
    crew: 54,
    maxCrew: 54,
    morale: 100,
    maxMorale: 100,
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
    aimHeading: 0,
    ...partial,
  };
}

describe('ship steering physics', () => {
  it('hull faces its course in steady state (velocity aligns with heading)', () => {
    const ship = testShip();
    for (let i = 0; i < 900; i++) applyShipPhysics(ship, 0, 0.8);
    const velAngle = Math.atan2(ship.vy, ship.vx);
    const diff = Math.abs(normalizeAngle(velAngle - ship.heading));
    expect(diff).toBeLessThan(0.05);
    expect(ship.speed).toBeGreaterThan(80);
  });

  it('a hard turn keeps the hull ahead of the crab (leeway bounded)', () => {
    const ship = testShip({ rudder: 1 });
    for (let i = 0; i < 2400; i++) applyShipPhysics(ship, 0.5, 0.8);
    const velAngle = Math.atan2(ship.vy, ship.vx);
    const leeway = Math.abs(normalizeAngle(velAngle - ship.heading));
    expect(leeway).toBeLessThan(0.35);
  });

  it('cannot turn sharply while stationary', () => {
    const ship = testShip({ sailState: 0.1 });
    const h0 = ship.heading;
    for (let i = 0; i < 200; i++) applyShipPhysics(ship, 0.4, 0.6);
    expect(Math.abs(normalizeAngle(ship.heading - h0))).toBeLessThan(0.1);
  });

  it('grappled ships rotate to lie alongside, same heading', () => {
    const battle = new Battle(makeConfig(SL, 555));
    const a = battle.ships[0]!;
    const b = battle.ships[1]!;
    a.x = 0;
    a.y = 0;
    b.x = 120;
    b.y = 0;
    a.heading = 0.4;
    b.heading = 2.9;
    a.intention = 'BREACH';
    a.crew = a.maxCrew;
    a.morale = 100;
    let grappled = false;
    for (let i = 0; i < 400 && battle.phase === 'ongoing'; i++) {
      battle.step();
      if (a.grappledWith !== null) {
        grappled = true;
        break;
      }
    }
    expect(grappled).toBe(true);
    for (let i = 0; i < 120; i++) battle.step();
    expect(Math.abs(normalizeAngle(a.heading - b.heading))).toBeLessThan(0.06);
  });
});

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

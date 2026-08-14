import { describe, expect, it } from 'vitest';
import { applyShipPhysics, Battle } from './battle';
import type { ShipState } from './types';
import { makeConfig } from './harness';

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
    rudderSmoothed: 0,
    yawRate: 0,
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
    phase: 'approach',
    tacticT: 0,
    orbitSign: 1,
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

describe('ship feel', () => {
  it('acceleration is brisk from rest and eases near hull speed', () => {
    const a = testShip();
    for (let i = 0; i < 40; i++) applyShipPhysics(a, 0, 0.8); // 2s from rest
    const earlySpeed = a.speed;

    const b = testShip();
    b.vx = b.speed = 120; // ~83% of hull speed — drag has set in
    for (let i = 0; i < 40; i++) applyShipPhysics(b, 0, 0.8);
    const lateGain = b.speed - 120;

    expect(earlySpeed).toBeGreaterThan(30);
    expect(lateGain).toBeLessThan(earlySpeed * 0.6);
  });

  it('the helm lags the rudder demand and converges', () => {
    const ship = testShip({ rudder: 1 });
    applyShipPhysics(ship, 0, 0.8);
    expect(ship.rudderSmoothed).toBeGreaterThan(0);
    expect(ship.rudderSmoothed).toBeLessThan(1);
    for (let i = 0; i < 300; i++) applyShipPhysics(ship, 0, 0.8);
    expect(ship.rudderSmoothed).toBeGreaterThan(0.99);
  });

  it('dead upwind is nearly impossible — the ship must tack', () => {
    const wind = 1.2;
    const ship = testShip({ heading: wind + Math.PI }); // dead into the wind
    for (let i = 0; i < 600; i++) applyShipPhysics(ship, wind, 0.8);
    expect(ship.speed).toBeLessThan(15);
  });

  it('close-hauled still sails at a useful speed', () => {
    const wind = 0;
    // 50 degrees off the wind — close-hauled but sailable.
    const ship = testShip({ heading: 0.873 });
    for (let i = 0; i < 1200; i++) applyShipPhysics(ship, wind, 0.8);
    expect(ship.speed).toBeGreaterThan(50);
  });

  it('the steering contract still holds in a real battle', () => {
    const battle = new Battle(makeConfig({ team0: ['brig'], team1: ['brig'] }, 4321, 0.3));
    for (let i = 0; i < 900 && battle.phase === 'ongoing'; i++) battle.step();
    for (const s of battle.ships) {
      expect(Number.isFinite(s.rudderSmoothed)).toBe(true);
      expect(Number.isFinite(s.speed)).toBe(true);
    }
  });
});

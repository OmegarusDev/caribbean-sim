import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { makeConfig } from './harness';
import { makeDuelConfig } from '../../content/skirmish';

describe('living wind', () => {
  it('veers and gusts deterministically within bounds', () => {
    const a = new Battle(makeConfig({ team0: ['sloop'], team1: ['sloop'] }, 9001));
    const b = new Battle(makeConfig({ team0: ['sloop'], team1: ['sloop'] }, 9001));
    for (let i = 0; i < 2000; i++) {
      a.step();
      b.step();
    }
    const wa = a.getWind();
    const wb = b.getWind();
    expect(wa.dir).toBe(wb.dir);
    expect(wa.strength).toBe(wb.strength);
    expect(wa.dir).not.toBe(a.config.windDir); // it moved
    expect(Math.abs(normalizeAngle(wa.dir - a.config.windDir))).toBeLessThan(0.5);
    expect(wa.strength).toBeGreaterThan(0.4);
    expect(wa.strength).toBeLessThan(1.01);
  });
});

describe('captain phases', () => {
  it('a fleeing ship runs downwind', () => {
    const battle = new Battle(makeDuelConfig('sloop', 'sloop', 77));
    const ship = battle.ships[0]!;
    ship.phase = 'fleeing';
    const windDir = battle.getWind().dir;
    for (let i = 0; i < 600; i++) {
      ship.phase = 'fleeing';
      battle.step();
    }
    const vel = Math.atan2(ship.vy, ship.vx);
    expect(Math.abs(normalizeAngle(vel - windDir))).toBeLessThan(0.5);
  });

  it('tacks to make progress upwind during the approach', () => {
    const battle = new Battle(makeDuelConfig('sloop', 'sloop', 88));
    const ship = battle.ships[0]!;
    const enemy = battle.ships[1]!;
    // Wind blows hard toward +x; put the enemy upwind of the ship.
    battle.config.windDir = 0;
    ship.x = 0;
    ship.y = 0;
    enemy.x = 700;
    enemy.y = 0;
    ship.phase = 'approach';
    const startDist = Math.hypot(enemy.x - ship.x, enemy.y - ship.y);
    for (let i = 0; i < 1800; i++) {
      ship.phase = 'approach';
      battle.step();
    }
    const endDist = Math.hypot(enemy.x - ship.x, enemy.y - ship.y);
    expect(endDist).toBeLessThan(startDist - 40);
  });

  it('runs through the phase repertoire in a real battle', () => {
    const battle = new Battle(makeDuelConfig('frigate', 'frigate', 123));
    const phases = new Set<string>();
    for (let i = 0; i < 2400 && battle.phase === 'ongoing'; i++) {
      battle.step();
      for (const s of battle.ships) phases.add(s.phase);
    }
    expect(phases.has('approach')).toBe(true);
    expect(phases.has('exchange')).toBe(true);
  });
});

describe('the chase', () => {
  it('a faster evader outruns a slow hunter and the battle ends by escape', () => {
    const battle = new Battle(makeConfig({ team0: ['sloop'], team1: ['galleon'] }, 4242, 0));
    const player = battle.ships[0]!;
    const enemy = battle.ships[1]!;
    player.phase = 'fleeing';
    enemy.phase = 'pressing';
    // The sloop is already ahead and at speed — the galleon can never catch.
    player.x = 600;
    player.y = 0;
    player.vx = 140;
    player.speed = 140;
    enemy.x = -300;
    enemy.y = 0;
    enemy.heading = 0;
    let ended = false;
    for (let i = 0; i < 4000 && battle.phase === 'ongoing'; i++) {
      player.phase = 'fleeing'; // hold the roles: evader + hunter
      enemy.phase = 'pressing';
      battle.step();
    }
    if (battle.phase !== 'ongoing') ended = true;
    const result = battle.buildResult();
    expect(ended).toBe(true);
    expect(result.endReason).toBe('escape');
    expect(result.winner).toBe('DRAW');
    expect(result.escaped).toContain(player.name);
  });
});

function normalizeAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r < -Math.PI) r += Math.PI * 2;
  return r;
}

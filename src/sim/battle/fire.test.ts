import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { makeCaptainConfig, makeDuelConfig } from '../../content/skirmish';

describe('per-gun cannons', () => {
  it('loads each cannon at its own slightly different rate', () => {
    const battle = new Battle(makeDuelConfig('frigate', 'frigate', 1234));
    const ship = battle.ships[0]!;
    expect(ship.guns.length).toBe(48); // 24 per side
    const maxes = new Set(ship.guns.map((g) => g.max.toFixed(4)));
    expect(maxes.size).toBeGreaterThan(1);
    expect(ship.guns.every((g) => g.reload === 0)).toBe(true); // loaded at start
    for (const side of [-1, 1] as const) {
      expect(ship.guns.filter((g) => g.side === side).length).toBe(24);
    }
  });

  it('fires only the side with an enemy in arc', () => {
    const battle = new Battle(makeCaptainConfig('frigate', 'frigate', 99));
    const player = battle.ships[0]!;
    const enemy = battle.ships[1]!;
    player.x = 0;
    player.y = 0;
    player.heading = 0; // bow +x; starboard = +y side
    enemy.x = 400;
    enemy.y = 220; // starboard broadside (28deg off bow, inside the 69deg arc)
    const before = player.guns.filter((g) => g.side === 1 && g.reload === 0).length;
    battle.fireRequest(player.id);
    const afterPort = player.guns.filter((g) => g.side === -1 && g.reload === 0).length;
    const afterStar = player.guns.filter((g) => g.side === 1 && g.reload === 0).length;
    expect(afterStar).toBeLessThan(before);
    expect(afterPort).toBe(before); // port side untouched — no enemy there
  });

  it('early press: guns within the grace window still go off, half-loaded ones do not', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 7));
    const player = battle.ships[0]!;
    const enemy = battle.ships[1]!;
    player.x = 0;
    player.y = 0;
    player.heading = 0;
    enemy.x = 400;
    enemy.y = 220;
    for (const gun of player.guns) {
      if (gun.side !== 1) continue;
      gun.reload = gun.max * (gun.max > 2.2 ? 0.05 : 0.5);
    }
    battle.fireRequest(player.id);
    const near = player.guns.filter((g) => g.side === 1 && g.max > 2.2).map((g) => g.reload);
    const far = player.guns.filter((g) => g.side === 1 && g.max <= 2.2).map((g) => g.reload);
    // near-ready guns fired (reset to max), half-loaded ones kept their charge
    expect(near.every((r) => r > 2.0)).toBe(true);
    expect(far.every((r) => r > 0 && r < 2.2)).toBe(true);
  });

  it('fireRequest does nothing with no enemy in either arc', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 3));
    const player = battle.ships[0]!;
    player.x = 0;
    player.y = 0;
    player.heading = 0;
    const enemy = battle.ships[1]!;
    enemy.x = 500; // dead ahead, not in arc
    enemy.y = 0;
    battle.fireRequest(player.id);
    expect(player.guns.every((g) => g.reload === 0)).toBe(true);
  });

  it('readiness reports per-side loaded fraction and target presence', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 5));
    const player = battle.ships[0]!;
    const enemy = battle.ships[1]!;
    player.x = 0;
    player.y = 0;
    player.heading = 0;
    enemy.x = 400;
    enemy.y = 220;
    const r = battle.shipReadiness(player.id)!;
    expect(r.starboard.hasTarget).toBe(true);
    expect(r.starboard.loadedFrac).toBe(1);
    expect(r.port.hasTarget).toBe(false);
  });
});

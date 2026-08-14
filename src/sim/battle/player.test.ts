import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { makeCaptainConfig } from '../../content/skirmish';

describe('captain mode (player ship)', () => {
  it('keeps the player ship off the captain AI — rudder and sails stay manual', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'brig', 4242));
    const player = battle.ships.find((s) => s.id === 't0s0')!;
    player.rudder = 1;
    player.sailState = 0.3;
    for (let i = 0; i < 300; i++) battle.step();
    expect(player.intention).toBe('MANUAL');
    expect(player.rudder).toBe(1);
    expect(player.sailState).toBe(0.3);
    expect(player.aiT).toBe(0);
  });

  it('the player ship never initiates boarding (MANUAL has no BREACH)', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 777));
    const player = battle.ships.find((s) => s.id === 't0s0')!;
    const enemy = battle.ships.find((s) => s.id !== 't0s0')!;
    // Park the ships alongside so boarding is possible.
    player.x = 0;
    player.y = 0;
    enemy.x = 60;
    enemy.y = 0;
    player.crew = player.maxCrew;
    player.morale = 100;
    for (let i = 0; i < 400 && battle.phase === 'ongoing'; i++) battle.step();
    // If grappled, the player is never the leader (attacker).
    expect(player.boardLeader).toBe(false);
  });

  it('still sinks and strikes like any ship (battle can end)', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 31337));
    const player = battle.ships.find((s) => s.id === 't0s0')!;
    player.hull = 1;
    for (let i = 0; i < 600 && battle.phase === 'ongoing'; i++) battle.step();
    expect(player.sunk || player.struck).toBe(true);
    expect(battle.phase).toBe('ended');
  });

  it('still auto-fires its broadsides', () => {
    const battle = new Battle(makeCaptainConfig('frigate', 'frigate', 555));
    const player = battle.ships.find((s) => s.id === 't0s0')!;
    player.rudder = 0;
    player.sailState = 1;
    let fired = false;
    for (let i = 0; i < 900 && battle.phase === 'ongoing'; i++) {
      battle.step();
      if (battle.getRecentEvents().some((e) => e.kind === 'broadside')) fired = true;
      battle.clearRecentEvents();
    }
    expect(fired).toBe(true);
  });
});

describe('grappled ships still end battles', () => {
  it('a burning grappled ship at zero hull sinks', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 999));
    const a = battle.ships.find((s) => s.id === 't0s0')!;
    const b = battle.ships.find((s) => s.id !== 't0s0')!;
    a.hull = 0;
    a.onFire = true;
    a.fireT = 99;
    a.grappledWith = b.id;
    b.grappledWith = a.id;
    b.boardLeader = true;
    for (let i = 0; i < 60 && battle.phase === 'ongoing'; i++) battle.step();
    expect(a.sunk).toBe(true);
  });
});

describe('phase cadence', () => {
  it('a beaten ship switches to fleeing within ~3s of becoming beaten', () => {
    const battle = new Battle(makeCaptainConfig('sloop', 'sloop', 2024));
    const enemy = battle.ships.find((s) => s.id !== 't0s0')!;
    enemy.hull = 1;
    enemy.morale = 60;
    let fled = false;
    for (let i = 0; i < 180 && battle.phase === 'ongoing'; i++) {
      battle.step();
      if (enemy.phase === 'fleeing') {
        fled = true;
        break;
      }
    }
    expect(fled).toBe(true);
  });
});

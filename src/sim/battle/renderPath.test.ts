/**
 * Render-path data invariants — the non-GPU side of "ships on screen".
 * If any of these break, entities silently vanish: NaN poses, unregistered
 * mesh ids, or an instance layout that doesn't match the writer.
 */
import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { makeConfig } from './harness';
import { shipToEntity, ringEntity } from '../../gfx/present/shipViews';
import { INSTANCE_ATTRIBS, INSTANCE_STRIDE } from '../../gfx/world/entities';
import { composeRigid, mat4Identity } from '../../gfx/core/math';
import { HULL_CLASS_LIST } from '../../content/ships';

describe('render path', () => {
  it('every ship maps to a finite, visible, registered entity', () => {
    const battle = new Battle(makeConfig({ team0: ['sloop', 'brig'], team1: ['frigate'] }, 1234, 0.4));
    for (let i = 0; i < 900; i++) battle.step();
    const windDir = battle.getWind().dir;
    const entities = battle.ships.map((s) =>
      shipToEntity(s, { time: 10, windDir, sinkT: 0 }),
    );
    expect(entities.length).toBe(3);
    for (const e of entities) {
      for (const v of [e.x, e.y, e.z, e.yaw, e.pitch, e.roll, e.scale, e.sailRatio]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      for (const c of [...e.stripe, ...e.flag]) expect(Number.isFinite(c)).toBe(true);
      expect(e.meshId).toMatch(/^ship:/);
      expect(HULL_CLASS_LIST.some((c) => e.meshId === `ship:${c}`)).toBe(true);
      const m = mat4Identity();
      composeRigid(m, e.x, e.y, e.z, e.yaw, e.pitch, e.roll, e.scale);
      for (const v of m) expect(Number.isFinite(v)).toBe(true);
      expect(m[15]).toBe(1);
      // The matrix is GPU-precision (float32); the entity is double.
      expect(m[12]).toBeCloseTo(e.x, 3);
      expect(m[13]).toBeCloseTo(e.y, 3);
      expect(m[14]).toBeCloseTo(e.z, 3);
    }
  });

  it('instance layout offsets fit the stride and cover every field', () => {
    let maxEnd = 0;
    let count = 0;
    for (const a of INSTANCE_ATTRIBS) {
      maxEnd = Math.max(maxEnd, a.offsetFloats + a.size);
      count += a.size;
    }
    expect(maxEnd).toBeLessThanOrEqual(INSTANCE_STRIDE);
    // mat4(16) + stripe(3) + flag(3) + sailRatio(1) + windLocal(2) + phase(1)
    expect(count).toBe(26);
    expect(INSTANCE_STRIDE).toBe(26);
  });

  it('the ring entity targets the registered ring mesh', () => {
    const battle = new Battle(makeConfig({ team0: ['sloop'], team1: ['sloop'] }, 77, 0.2));
    const ring = ringEntity(battle.ships[0]!);
    expect(ring.meshId).toBe('ring');
    expect(Number.isFinite(ring.x)).toBe(true);
  });
});

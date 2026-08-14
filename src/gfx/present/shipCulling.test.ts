import { describe, expect, it } from 'vitest';
import { HULL_CLASSES, HULL_CLASS_LIST, type HullClassId } from '../../content/ships';
import { shipToEntity } from './shipViews';
import { frustumSphereVisible, extractFrustum, mat4Perspective, mat4LookAt, mat4Multiply } from '../core/math';
import type { ShipState } from '../../sim/battle/types';

function testShip(hullClass: HullClassId = 'sloop'): ShipState {
  return {
    id: 't', team: 0, name: 'T', hullClass, x: 0, y: 0, heading: 0,
    vx: 0, vy: 0, speed: 0, sailState: 1, rudder: 0, rudderSmoothed: 0, yawRate: 0,
    hull: 1, maxHull: 1, sails: 1, maxSails: 1, crew: 1, maxCrew: 1,
    morale: 1, maxMorale: 1, onFire: false, fireT: 0, guns: [],
    phase: 'approach', tacticT: 0, orbitSign: 1, intention: 'HOLD',
    targetId: null, grappledWith: null, boardLeader: false, boardTicks: 0,
    sunk: false, struck: false, lastSternAim: false, aiT: 0, aimHeading: 0,
    captain: { skill: 50, bravery: 50, focus: 50, determination: 50 },
  };
}

describe('ship culling sphere', () => {
  it('contains the whole ship — mast tip, bowsprit, and hull keel', () => {
    for (const clsId of HULL_CLASS_LIST) {
      const cls = HULL_CLASSES[clsId];
      const e = shipToEntity(testShip(clsId), { time: 0, windDir: 0 });
      // The sphere sits at the waterline; it must reach the mainmast top
      // (0.95 * L above) and the bowsprit (0.78 * L ahead of the bow).
      const reach = e.radius;
      expect(reach, `${clsId} must cover the mast tip`).toBeGreaterThan(0.95 * cls.length - 2);
      expect(reach, `${clsId} must cover the bowsprit`).toBeGreaterThan(0.78 * cls.length - 2);
      expect(e.radius).toBeGreaterThan(0.2 * cls.length); // keel depth
    }
  });
});

describe('the ship stays visible while any part is on screen', () => {
  it('a ship near the frame edge with only its masts in view is NOT culled', () => {
    // Camera high above, looking down at a ship half-off the top of the frame.
    const e = shipToEntity(testShip('sloop'), { time: 0, windDir: 0 });
    // Eye at (0, 60, 80) looking at the ship: the ship sits near the frame's
    // bottom edge — the mast must keep it in the draw list.
    const proj = new Float32Array(16);
    mat4Perspective(proj, 0.9, 1.5, 5, 3000);
    const view = new Float32Array(16);
    mat4LookAt(view, [0, 60, 80], [0, 0, 0], [0, 1, 0]);
    const vp = new Float32Array(16);
    mat4Multiply(vp, proj, view);
    const frustum = extractFrustum(vp);
    const visible = frustumSphereVisible(frustum, e.x, e.y + 30, e.z, e.radius);
    expect(visible).toBe(true);
  });
});

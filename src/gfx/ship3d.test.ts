import { describe, expect, it } from 'vitest';
import { buildShipMeshData, shipModel, type ShipPose } from './ship3d';
import { mat4Identity, transformMat4, vec3 } from './gl/math';

describe('ship mesh geometry', () => {
  for (const hullClass of ['sloop', 'brig', 'frigate', 'galleon'] as const) {
    it(`${hullClass}: valid indices, sane bounds, no NaN`, () => {
      const d = buildShipMeshData(hullClass);
      const verts = d.positions.length / 3;
      expect(verts).toBeGreaterThan(100);
      expect(d.indices.length).toBeGreaterThan(500);
      for (const idx of d.indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(verts);
      }
      let minY = Infinity;
      let maxY = -Infinity;
      let minX = Infinity;
      let maxX = -Infinity;
      for (let i = 0; i < verts; i++) {
        const x = d.positions[i * 3]!;
        const y = d.positions[i * 3 + 1]!;
        const z = d.positions[i * 3 + 2]!;
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Number.isFinite(z)).toBe(true);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      expect(minY).toBeLessThan(-10);
      expect(maxY).toBeGreaterThan(40);
      expect(minX).toBeLessThan(-40);
      expect(maxX).toBeGreaterThan(40);
    });

    it(`${hullClass}: sails sit above the deck, hull is vertical`, () => {
      const d = buildShipMeshData(hullClass);
      let sailMinY = Infinity;
      let sailMaxY = -Infinity;
      let hullY = Infinity;
      d.kinds.forEach((k, i) => {
        const y = d.positions[i * 3 + 1]!;
        if (k === 1) {
          sailMinY = Math.min(sailMinY, y);
          sailMaxY = Math.max(sailMaxY, y);
        } else if (k === 0) {
          hullY = Math.min(hullY, y);
        }
      });
      expect(sailMinY).toBeGreaterThan(10);
      expect(sailMaxY).toBeGreaterThan(sailMinY + 30);
      expect(hullY).toBeLessThan(0);
    });
  }
});

function pose(yaw: number, pitch = 0, roll = 0): ShipPose {
  return { x: 0, z: 0, y: 0, yaw, pitch, roll, sinkT: 0 };
}

function apply(pose: ShipPose, v: [number, number, number]): [number, number, number] {
  const m = mat4Identity();
  shipModel(m, pose);
  const out = transformMat4(vec3(), vec3(v[0], v[1], v[2]), m);
  return [out[0], out[1], out[2]];
}

describe('shipModel orientation', () => {
  it('is identity at rest', () => {
    expect(apply(pose(0), [1, 0, 0])).toEqual([1, 0, 0]);
    expect(apply(pose(0), [0, 1, 0])).toEqual([0, 1, 0]);
    expect(apply(pose(0), [0, 0, 1])).toEqual([0, 0, 1]);
  });

  it('keeps the hull upright at every yaw (up stays up)', () => {
    for (const yaw of [0, 0.4, Math.PI / 2, 1.9, Math.PI, -2.2, -Math.PI / 2]) {
      const up = apply(pose(yaw), [0, 1, 0]);
      expect(up[1]).toBeGreaterThan(0.98);
      expect(Math.hypot(up[0], up[2])).toBeLessThan(0.02);
    }
  });

  it('bow faces the heading (heading 0 = +x, positive heading = +z)', () => {
    for (const heading of [0, 0.5, 1.2, Math.PI, -0.9]) {
      const bow = apply(pose(-heading), [1, 0, 0]);
      const expected = [Math.cos(heading), 0, Math.sin(heading)];
      expect(Math.abs(bow[0] - expected[0]!)).toBeLessThan(0.001);
      expect(Math.abs(bow[1])).toBeLessThan(0.001);
      expect(Math.abs(bow[2] - expected[2]!)).toBeLessThan(0.001);
    }
  });

  it('roll banks about the bow axis, pitch tips the bow', () => {
    const rolled = apply(pose(0, 0, Math.PI / 2), [0, 1, 0]);
    expect(Math.abs(rolled[0])).toBeLessThan(0.001);
    expect(Math.abs(rolled[1])).toBeLessThan(0.001);
    expect(Math.abs(rolled[2] - 1)).toBeLessThan(0.001);

    const pitched = apply(pose(0, Math.PI / 2), [1, 0, 0]);
    expect(Math.abs(pitched[0])).toBeLessThan(0.001);
    expect(Math.abs(pitched[2])).toBeLessThan(0.001);
    expect(Math.abs(pitched[1] - 1)).toBeLessThan(0.001);
  });

  it('translates without affecting orientation', () => {
    const m = mat4Identity();
    shipModel(m, { x: 10, z: 20, y: 3, yaw: 0.7, pitch: 0.1, roll: 0.2, sinkT: 0 });
    expect(m[12]).toBe(10);
    expect(m[13]).toBe(3);
    expect(m[14]).toBe(20);
  });
});

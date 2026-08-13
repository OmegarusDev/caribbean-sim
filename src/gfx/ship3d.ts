/**
 * Procedural 3D ship — parametric hull loft, masts, billowing sails, flag.
 * Built once per hull class, drawn per ship with instance uniforms.
 * Model space: bow +x, up +y, port/starboard ±z.
 */
import { HULL_CLASSES } from '../content/ships';
import type { HullClassId } from '../content/ships';
import type { GlHandle } from './gl/context';
import { createMesh, type GlMesh, type MeshData } from './gl/mesh';
import { mat4Identity, mat4Multiply, type Mat4 } from './gl/math';

const WOOD_LIGHT: [number, number, number] = [0.47, 0.31, 0.17];
const WOOD_DARK: [number, number, number] = [0.16, 0.105, 0.07];
const DECK: [number, number, number] = [0.55, 0.38, 0.21];
const SAIL: [number, number, number] = [0.93, 0.9, 0.79];

export interface ShipMesh {
  mesh: GlMesh;
  length: number;
}

type VertFn = (
  x: number,
  y: number,
  z: number,
  color: [number, number, number],
  stripe?: number,
  kind?: number,
) => number;

const cache = new Map<HullClassId, ShipMesh>();

export function getShipMesh(gl: GlHandle, hullClass: HullClassId): ShipMesh {
  const hit = cache.get(hullClass);
  if (hit) return hit;
  const built = createMesh(gl, buildShipMeshData(hullClass));
  const entry = { mesh: built, length: HULL_CLASSES[hullClass].length };
  cache.set(hullClass, entry);
  return entry;
}

export function disposeShipMeshes(gl: GlHandle): void {
  for (const entry of cache.values()) entry.mesh.dispose(gl);
  cache.clear();
}

/** Pure mesh build — exported for geometry tests and diagnostics. */
export function buildShipMeshData(hullClass: HullClassId): MeshData {
  const cls = HULL_CLASSES[hullClass];
  const L = cls.length;
  const D = L * 0.2;
  const sections = 13;
  const data: MeshData = {
    positions: [],
    normals: [],
    colors: [],
    binds: [],
    kinds: [],
    indices: [],
  };

  const vert = (
    x: number,
    y: number,
    z: number,
    color: [number, number, number],
    stripe = 0,
    kind = 0,
  ) => {
    data.positions.push(x, y, z);
    data.normals.push(0, 1, 0);
    data.colors.push(color[0], color[1], color[2], stripe);
    data.binds.push(0, 0);
    data.kinds.push(kind);
    return data.positions.length / 3 - 1;
  };

  const quad = (a: number, b: number, c: number, d: number) => {
    data.indices.push(a, b, c, a, c, d);
  };

  const hullColor = (i: number, ratio: number, y: number): [number, number, number] => {
    if (y < -D * 0.18) return [WOOD_DARK[0] * 0.9, WOOD_DARK[1] * 0.9, WOOD_DARK[2] * 0.9];
    const band = Math.sin(i * 1.7) * 0.04;
    const deep = 1 - 0.35 * Math.min(1, Math.max(0, ratio));
    return [WOOD_LIGHT[0] * deep + band, WOOD_LIGHT[1] * deep + band, WOOD_LIGHT[2] * deep];
  };

  // Section profiles: [keel, bilge, waterline, deck] in (y, z) per side sign.
  const halfBeam = (t: number) => {
    const s = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
    return 0.5 + 0.5 * s * s;
  };
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const x = -L / 2 + t * L;
    const b = L * 0.16 * halfBeam(t);
    const bowTaper = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
    const bw = b * bowTaper;
    const deckRaise = t > 0.86 ? (t - 0.86) / 0.14 : 0;
    const yDeck = D * 0.05 + deckRaise * D * 0.35;
    const stripe = t > 0.14 && t < 0.9 ? 1 : 0;

    const v0 = vert(x, -D, 0, hullColor(i, t, -D));
    const v1 = vert(x, -D * 0.5, bw * 0.55, hullColor(i, t, -D * 0.5));
    const v2 = vert(x, -D * 0.26, bw, hullColor(i, t, -D * 0.26), stripe);
    const v3 = vert(x, -D * 0.12, bw * 0.98, hullColor(i, t, -D * 0.12), stripe);
    const v4 = vert(x, yDeck, bw * 0.9, DECK);
    const v5 = vert(x, yDeck, -bw * 0.9, DECK);
    const v6 = vert(x, -D * 0.12, -bw * 0.98, hullColor(i, t, -D * 0.12), stripe);
    const v7 = vert(x, -D * 0.26, -bw, hullColor(i, t, -D * 0.26), stripe);
    const v8 = vert(x, -D * 0.5, -bw * 0.55, hullColor(i, t, -D * 0.5));
    const v9 = vert(x, -D, 0, hullColor(i, t, -D));
    void v0;
    void v1;
    void v2;
    void v3;
    void v4;
    void v5;
    void v6;
    void v7;
    void v8;
    void v9;

    if (i > 0) {
      const base = data.positions.length / 3 - 10;
      const p = (off: number) => base + off;
      quad(p(0), p(10), p(11), p(1));
      quad(p(1), p(11), p(12), p(2));
      quad(p(2), p(12), p(13), p(3));
      quad(p(3), p(13), p(14), p(4));
      quad(p(4), p(14), p(15), p(5));
      quad(p(5), p(15), p(16), p(6));
      quad(p(6), p(16), p(17), p(7));
      quad(p(7), p(17), p(18), p(8));
      quad(p(8), p(18), p(19), p(9));
    }
  }

  // Bow cap (tip at +x): fan from the final section's keel.
  const n = data.positions.length / 3;
  const tip = vert(L / 2 + L * 0.04, -D * 0.9, 0, WOOD_DARK);
  const last = n - 10;
  for (let k = 0; k < 9; k++) {
    data.indices.push(last + k, tip, last + k + 1);
  }

  // Stern transom (section 0 at x = -L/2): fan from the keel over the whole
  // stern profile (keel → bilge → waterline → gunwales → deck).
  for (let k = 1; k <= 7; k++) {
    data.indices.push(0, k, k + 1);
  }

  // Deck fill between gunwales.
  const deckSeg = 8;
  const dRow: number[] = [];
  for (let i = 0; i <= deckSeg; i++) {
    const t = i / deckSeg;
    const x = -L / 2 + t * L;
    const b = L * 0.16 * halfBeam(t) * (t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1);
    const yDeck = D * 0.05 + (t > 0.86 ? ((t - 0.86) / 0.14) * D * 0.35 : 0);
    const row: number[] = [];
    for (let s = -1; s <= 1; s += 2) {
      row.push(vert(x, yDeck, s * b * 0.92, DECK));
    }
    dRow.push(...row);
  }
  for (let i = 0; i < deckSeg; i++) {
    quad(dRow[i * 2]!, dRow[i * 2 + 1]!, dRow[i * 2 + 3]!, dRow[i * 2 + 2]!);
  }

  addMast(data, vert, L, -L * 0.34, L * 0.72, L * 0.028, 2);
  addMast(data, vert, L, L * 0.02, L * 0.95, L * 0.032, 3);
  addMast(data, vert, L, L * 0.38, L * 0.8, L * 0.024, 2);

  addBowsprit(data, vert, L);

  computeNormals(data);
  return data;
}

function addMast(
  data: MeshData,
  vert: VertFn,
  L: number,
  x: number,
  height: number,
  radius: number,
  sailTiers: number,
): void {
  const sides = 8;
  const base = data.positions.length / 3;
  for (let ring = 0; ring < 2; ring++) {
    const y = ring === 0 ? L * 0.02 : height;
    const r = ring === 0 ? radius : radius * 0.55;
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      vert(x, y, Math.cos(a) * r, [0.32, 0.22, 0.12]);
    }
  }
  for (let s = 0; s < sides; s++) {
    const n1 = base + s;
    const n2 = base + ((s + 1) % sides);
    data.indices.push(n1, n2, n2 + sides, n1, n2 + sides, n1 + sides);
  }

  const sailW = L * 0.3;
  for (let k = 0; k < sailTiers; k++) {
    const yTop = height - L * 0.1 - k * L * 0.24;
    const yBot = yTop - L * 0.2;
    const g = 4;
    const gridBase = data.positions.length / 3;
    for (let row = 0; row < g; row++) {
      for (let col = 0; col < g; col++) {
        const u = (col / (g - 1)) * 2 - 1;
        const v = row / (g - 1);
        const px = x + u * sailW * 0.5;
        const py = yBot + (1 - v) * (yTop - yBot);
        const idx = vert(px, py, 0, SAIL, 0, 1);
        data.binds[idx * 2] = u;
        data.binds[idx * 2 + 1] = v;
      }
    }
    for (let row = 0; row < g - 1; row++) {
      for (let col = 0; col < g - 1; col++) {
        const a = gridBase + row * g + col;
        const b = gridBase + row * g + col + 1;
        const c = gridBase + (row + 1) * g + col + 1;
        const d = gridBase + (row + 1) * g + col;
        data.indices.push(a, b, c, a, c, d);
      }
    }
  }

  if (sailTiers >= 3) {
    const fx = x;
    const fy = height;
    const a = vert(fx, fy, 0, [1, 1, 1], 0, 2);
    const b = vert(fx + L * 0.16, fy - L * 0.02, 0, [1, 1, 1], 0, 2);
    const c = vert(fx, fy - L * 0.05, 0, [1, 1, 1], 0, 2);
    data.indices.push(a, b, c);
  }
}

function addBowsprit(data: MeshData, vert: VertFn, L: number): void {
  const sides = 6;
  const base = data.positions.length / 3;
  for (let ring = 0; ring < 2; ring++) {
    const t = ring === 0 ? 0 : 1;
    const x = L / 2 + t * L * 0.28;
    const y = L * 0.02 + t * L * 0.05;
    const z0 = -t * L * 0.06;
    const r = L * 0.012 * (1 - t * 0.5);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      vert(x, y, z0 + Math.cos(a) * r, [0.3, 0.21, 0.12]);
    }
  }
  for (let s = 0; s < sides; s++) {
    const n1 = base + s;
    const n2 = base + ((s + 1) % sides);
    data.indices.push(n1, n2, n2 + sides, n1, n2 + sides, n1 + sides);
  }
}

function computeNormals(data: MeshData): void {
  for (let i = 0; i < data.positions.length / 3; i++) {
    data.normals[i * 3] = 0;
    data.normals[i * 3 + 1] = 1;
    data.normals[i * 3 + 2] = 0;
  }
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = data.indices[i]! * 3;
    const b = data.indices[i + 1]! * 3;
    const c = data.indices[i + 2]! * 3;
    const ax = data.positions[a]!,
      ay = data.positions[a + 1]!,
      az = data.positions[a + 2]!;
    const bx = data.positions[b]!,
      by = data.positions[b + 1]!,
      bz = data.positions[b + 2]!;
    const cx = data.positions[c]!,
      cy = data.positions[c + 1]!,
      cz = data.positions[c + 2]!;
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az;
    const vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const idx of [a, b, c]) {
      data.normals[idx] += nx;
      data.normals[idx + 1] += ny;
      data.normals[idx + 2] += nz;
    }
  }
  for (let i = 0; i < data.positions.length / 3; i++) {
    const len = Math.hypot(data.normals[i * 3]!, data.normals[i * 3 + 1]!, data.normals[i * 3 + 2]!) || 1;
    data.normals[i * 3]! /= len;
    data.normals[i * 3 + 1]! /= len;
    data.normals[i * 3 + 2]! /= len;
  }
}

export interface ShipPose {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  roll: number;
  sinkT: number;
  scale?: number;
}

const SCRATCH_A = mat4Identity();
const SCRATCH_B = mat4Identity();

function rotX(out: Mat4, a: number): Mat4 {
  mat4Identity(out);
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[5] = c;
  out[6] = s;
  out[9] = -s;
  out[10] = c;
  return out;
}

function rotY(out: Mat4, a: number): Mat4 {
  mat4Identity(out);
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = c;
  out[2] = -s;
  out[8] = s;
  out[10] = c;
  return out;
}

function rotZ(out: Mat4, a: number): Mat4 {
  mat4Identity(out);
  const c = Math.cos(a);
  const s = Math.sin(a);
  out[0] = c;
  out[1] = s;
  out[4] = -s;
  out[5] = c;
  return out;
}

/**
 * Model matrix for a ship pose: roll (about bow axis) → pitch (about beam
 * axis) → yaw (about world up). Verified: yaw keeps the hull upright.
 */
export function shipModel(out: Mat4, pose: ShipPose): Mat4 {
  const s = pose.scale ?? 1;
  rotX(SCRATCH_A, pose.roll);
  rotZ(SCRATCH_B, pose.pitch);
  mat4Multiply(SCRATCH_A, SCRATCH_B, SCRATCH_A);
  rotY(SCRATCH_B, pose.yaw);
  mat4Multiply(out, SCRATCH_B, SCRATCH_A);
  for (let i = 0; i < 12; i++) out[i] *= s;
  out[12] = pose.x;
  out[13] = pose.y;
  out[14] = pose.z;
  out[15] = 1;
  return out;
}

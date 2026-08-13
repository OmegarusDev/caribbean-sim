/**
 * WorldEntity — the generic drawable the world scene consumes.
 * The engine knows nothing about ships or factions; game layers map their
 * domain onto these fields (meshId, rigid pose, palette, state flags).
 */
export interface WorldEntity {
  id: string;
  meshId: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  /** Cull sphere radius in world units (0 = always drawn). */
  radius: number;
  stripe: [number, number, number];
  flag: [number, number, number];
  sailRatio: number;
  windLocal: [number, number];
  phase: number;
  visible: boolean;
}

/** Instance float layout shared by ship-style meshes (model+palette+state). */
export const INSTANCE_STRIDE = 26;
export const INSTANCE_ATTRIBS: Array<{ size: number; offsetFloats: number }> = [
  { size: 4, offsetFloats: 0 },
  { size: 4, offsetFloats: 4 },
  { size: 4, offsetFloats: 8 },
  { size: 4, offsetFloats: 12 },
  { size: 3, offsetFloats: 16 },
  { size: 3, offsetFloats: 19 },
  { size: 1, offsetFloats: 22 },
  { size: 2, offsetFloats: 23 },
  { size: 1, offsetFloats: 25 },
];

export const INSTANCE_LAYOUT = {
  attribs: INSTANCE_ATTRIBS,
  strideFloats: INSTANCE_STRIDE,
  baseLocation: 5,
};

/** Pack one entity into the instance record at the given index. */
export function writeInstance(out: Float32Array, index: number, e: WorldEntity, model: Float32Array): void {
  const base = index * INSTANCE_STRIDE;
  for (let i = 0; i < 16; i++) out[base + i] = model[i]!;
  out[base + 16] = e.stripe[0];
  out[base + 17] = e.stripe[1];
  out[base + 18] = e.stripe[2];
  out[base + 19] = e.flag[0];
  out[base + 20] = e.flag[1];
  out[base + 21] = e.flag[2];
  out[base + 22] = e.sailRatio;
  out[base + 23] = e.windLocal[0];
  out[base + 24] = e.windLocal[1];
  out[base + 25] = e.phase;
}

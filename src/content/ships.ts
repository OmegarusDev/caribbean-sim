/**
 * Hull classes — content as code. Sloop → Brig → Frigate → Galleon.
 * Every number feeds the balance harness; classes are rock-paper-scissors
 * (fast/light vs slow/heavy), never just stat-lists.
 */

export type HullClassId = 'sloop' | 'brig' | 'frigate' | 'galleon';

export interface HullClass {
  id: HullClassId;
  name: string;
  /** Ship length in world px — affects scale, grapple range, wake. */
  length: number;
  maxHull: number;
  maxSails: number;
  maxCrew: number;
  maxMorale: number;
  /** Top speed at full sail, running downwind (px/s). */
  baseSpeed: number;
  /** Turning power at full way (rad/s). */
  turnRate: number;
  /** Accel toward target speed (px/s^2). */
  accel: number;
  /** Guns per broadside side. */
  guns: number;
  gunRange: number;
  gunDamage: number;
  /** Seconds between broadsides. */
  reload: number;
  boardingBonus: number;
}

export const HULL_CLASSES: Record<HullClassId, HullClass> = {
  sloop: {
    id: 'sloop',
    name: 'Sloop',
    length: 88,
    maxHull: 1000,
    maxSails: 700,
    maxCrew: 32,
    maxMorale: 100,
    baseSpeed: 165,
    turnRate: 1.05,
    accel: 26,
    guns: 8,
    gunRange: 460,
    gunDamage: 13,
    reload: 2.2,
    boardingBonus: 0.08,
  },
  brig: {
    id: 'brig',
    name: 'Brig',
    length: 112,
    maxHull: 1600,
    maxSails: 1000,
    maxCrew: 54,
    maxMorale: 100,
    baseSpeed: 145,
    turnRate: 0.85,
    accel: 20,
    guns: 14,
    gunRange: 520,
    gunDamage: 16,
    reload: 2.5,
    boardingBonus: 0,
  },
  frigate: {
    id: 'frigate',
    name: 'Frigate',
    length: 140,
    maxHull: 2400,
    maxSails: 1400,
    maxCrew: 88,
    maxMorale: 100,
    baseSpeed: 128,
    turnRate: 0.72,
    accel: 16,
    guns: 24,
    gunRange: 580,
    gunDamage: 20,
    reload: 3.0,
    boardingBonus: -0.05,
  },
  galleon: {
    id: 'galleon',
    name: 'Galleon',
    length: 172,
    maxHull: 3600,
    maxSails: 1900,
    maxCrew: 130,
    maxMorale: 100,
    baseSpeed: 108,
    turnRate: 0.55,
    accel: 12,
    guns: 32,
    gunRange: 640,
    gunDamage: 24,
    reload: 3.6,
    boardingBonus: 0.04,
  },
};

export const HULL_CLASS_LIST = Object.keys(HULL_CLASSES) as HullClassId[];

export const SHIP_NAMES_A = [
  'Revenge',
  'Sea Wolf',
  'Fortune',
  'Stormbringer',
  'Blood Moon',
  'Raven',
  'Scourge',
  'Tempest',
] as const;

export const SHIP_NAMES_B = [
  'Sovereign',
  'Royal Oak',
  'Mercury',
  'Defiance',
  'Trident',
  'Invincible',
  'Crown Jewel',
  'Vanguard',
] as const;

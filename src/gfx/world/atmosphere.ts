/**
 * Atmosphere — the scene's sky/lighting data, as plain data not code.
 * Moods (day/dusk/night/storm) are presets; scenes pick one and the shaders
 * read it. Adding a mood never touches a shader.
 */
import type { Vec3 } from '../core/math';

export interface Atmosphere {
  skyTop: Vec3;
  skyHorizon: Vec3;
  cloudColor: Vec3;
  cloudCover: number;
  sunDir: Vec3;
  sunColor: Vec3;
  /** 0..1 light level from the sun's elevation (ephemeris-driven). */
  sunIntensity: number;
  fog: Vec3;
  fogStart: number;
  fogEnd: number;
  waterDeep: Vec3;
  waterMid: Vec3;
}

export const DAY: Atmosphere = {
  skyTop: [0.03, 0.12, 0.2],
  skyHorizon: [0.24, 0.38, 0.48],
  cloudColor: [0.55, 0.62, 0.68],
  cloudCover: 0.35,
  sunDir: [0.37, 0.55, 0.37],
  sunColor: [1.0, 0.78, 0.5],
  sunIntensity: 1,
  fog: [0.24, 0.38, 0.48],
  fogStart: 800,
  fogEnd: 2500,
  waterDeep: [0.02, 0.1, 0.145],
  waterMid: [0.055, 0.24, 0.3],
};

export const DUSK: Atmosphere = {
  skyTop: [0.05, 0.06, 0.12],
  skyHorizon: [0.5, 0.32, 0.2],
  cloudColor: [0.45, 0.35, 0.3],
  cloudCover: 0.4,
  sunDir: [0.2, 0.2, 0.55],
  sunColor: [1.0, 0.55, 0.3],
  sunIntensity: 1,
  fog: [0.32, 0.28, 0.3],
  fogStart: 600,
  fogEnd: 2200,
  waterDeep: [0.05, 0.03, 0.05],
  waterMid: [0.16, 0.09, 0.08],
};

export const NIGHT: Atmosphere = {
  skyTop: [0.01, 0.015, 0.04],
  skyHorizon: [0.05, 0.08, 0.14],
  cloudColor: [0.08, 0.1, 0.14],
  cloudCover: 0.5,
  sunDir: [-0.3, -0.5, -0.4],
  sunColor: [0.25, 0.3, 0.5],
  sunIntensity: 1,
  fog: [0.04, 0.07, 0.12],
  fogStart: 500,
  fogEnd: 2400,
  waterDeep: [0.008, 0.02, 0.045],
  waterMid: [0.02, 0.05, 0.09],
};

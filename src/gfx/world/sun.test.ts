import { describe, expect, it } from 'vitest';
import { solarPosition, solarDeclination, hourAtElevation, TWILIGHT_ANGLE } from './sun';

const LAT = 0.35; // ~20N — the Caribbean
const DAY = 190; // mid-July

describe('the sun is real astronomy', () => {
  it('declination respects the seasons', () => {
    const solstice = 23.44 * (Math.PI / 180);
    expect(solarDeclination(172)).toBeCloseTo(solstice, 1); // summer solstice
    expect(solarDeclination(355)).toBeCloseTo(-solstice, 1); // winter solstice
    expect(Math.abs(solarDeclination(80))).toBeLessThan(Math.abs(solarDeclination(172)));
  });

  it('noon at the equator puts the sun overhead at the equinox', () => {
    const s = solarPosition(80, 0.5, 0);
    expect(s.elevation).toBeGreaterThan(1.55); // ~89 degrees
  });

  it('rises in the east and sets in the west', () => {
    const dawn = solarPosition(DAY, 0.23, LAT);
    const noon = solarPosition(DAY, 0.5, LAT);
    const dusk = solarPosition(DAY, 0.72, LAT);
    expect(dawn.azimuth).toBeLessThan(Math.PI / 2);
    expect(noon.elevation).toBeGreaterThan(dawn.elevation);
    expect(dusk.elevation).toBeLessThan(noon.elevation);
    expect(dusk.azimuth).toBeGreaterThan(Math.PI / 2);
  });

  it('is below the horizon at night', () => {
    expect(solarPosition(DAY, 0.95, LAT).elevation).toBeLessThan(0);
  });

  it('intensity follows the elevation', () => {
    expect(solarPosition(DAY, 0.5, LAT).intensity).toBeCloseTo(1, 1);
    expect(solarPosition(DAY, 0.95, LAT).intensity).toBe(0);
  });

  it('the inverted ephemeris reproduces the sun we ask for', () => {
    for (const elev of [0.1, 0.35, 0.8]) {
      const h = hourAtElevation(DAY, LAT, elev, true);
      const s = solarPosition(DAY, h, LAT);
      expect(s.elevation).toBeCloseTo(elev, 2);
      expect(h).toBeGreaterThan(0.5);
    }
  });

  it('the Caribbean noon sun passes overhead in July', () => {
    const s = solarPosition(DAY, 0.5, LAT);
    expect(s.elevation).toBeGreaterThan(Math.PI / 2 - 0.05);
  });

  it('the golden hour anchors are real times', () => {
    // Title: sun ~19 deg at 5pm-ish; battle: ~46 deg at 3pm-ish.
    const dusk = solarPosition(DAY, 0.714, LAT);
    const afternoon = solarPosition(DAY, 0.63, LAT);
    expect(dusk.elevation).toBeCloseTo(0.33, 1);
    expect(afternoon.elevation).toBeGreaterThan(0.7);
    expect(afternoon.elevation).toBeLessThan(0.95);
  });

  it('twilight angle is a real constant', () => {
    expect(TWILIGHT_ANGLE).toBeCloseTo(6 * (Math.PI / 180), 9);
  });
});

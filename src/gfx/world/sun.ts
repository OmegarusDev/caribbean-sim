/**
 * The sky is the clock — the sun is computed from real astronomy, not a
 * palette. Low-precision solar ephemeris (Cooper's equation for declination,
 * the standard hour-angle geometry): the same equations solar engineers
 * use. Elevation and azimuth fall out of latitude, day of year and time;
 * the world's light follows the sun because the sun follows the calendar.
 */

export interface SunState {
  /** Elevation above the horizon, radians. Negative below the horizon. */
  elevation: number;
  /** Azimuth clockwise from north, radians. */
  azimuth: number;
  /** Unit vector toward the sun (y = sin elevation). */
  dir: [number, number, number];
  /** Light level 0..1: full daylight above ~15 deg, night below ~-6 deg. */
  intensity: number;
}

const DEG = Math.PI / 180;

/** Cooper's approximation for the sun's declination, radians. */
export function solarDeclination(dayOfYear: number): number {
  return (23.44 * DEG) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
}

/** Civil twilight: sun 6 degrees below the horizon. */
export const TWILIGHT_ANGLE = 6 * DEG;
/** Full daylight from 15 degrees elevation. */
export const FULL_DAY_ANGLE = 15 * DEG;

/**
 * Solar position at a given day and time.
 * @param dayOfYear 1..365
 * @param hourFraction 0..1 — 0.5 is solar noon (the sun's highest point).
 * @param latitude radians (positive north; the Caribbean is ~+0.3-0.35)
 */
export function solarPosition(dayOfYear: number, hourFraction: number, latitude: number): SunState {
  const decl = solarDeclination(dayOfYear);
  // Hour angle: 0 at solar noon, negative before, positive after.
  const hourAngle = 2 * Math.PI * (hourFraction - 0.5);
  const sinElev =
    Math.sin(latitude) * Math.sin(decl) +
    Math.cos(latitude) * Math.cos(decl) * Math.cos(hourAngle);
  const elevation = Math.asin(Math.max(-1, Math.min(1, sinElev)));

  let azimuth: number;
  const cosAz =
    (Math.sin(decl) - Math.sin(latitude) * sinElev) /
    (Math.cos(latitude) * Math.cos(elevation));
  azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (hourAngle > 0) azimuth = 2 * Math.PI - azimuth;

  const dir: [number, number, number] = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ];

  const intensity = Math.max(
    0,
    Math.min(1, (Math.sin(elevation) - Math.sin(-TWILIGHT_ANGLE)) / (Math.sin(FULL_DAY_ANGLE) - Math.sin(-TWILIGHT_ANGLE))),
  );

  return { elevation, azimuth, dir, intensity };
}

/**
 * Invert the ephemeris: the hour of day at which the sun stands at the
 * given elevation (on the chosen date/latitude). Used to anchor the old
 * hand-tuned suns in real time so the world's look continues uninterrupted.
 * @param elevation radians — the sun's height to match.
 * @param afternoon prefer the afternoon crossing (true) or morning.
 */
export function hourAtElevation(dayOfYear: number, latitude: number, elevation: number, afternoon: boolean): number {
  const decl = solarDeclination(dayOfYear);
  const cosH =
    (Math.sin(elevation) - Math.sin(latitude) * Math.sin(decl)) /
    (Math.cos(latitude) * Math.cos(decl));
  const h = Math.acos(Math.max(-1, Math.min(1, cosH)));
  const hour = h / (2 * Math.PI);
  return afternoon ? 0.5 + hour : 0.5 - hour;
}

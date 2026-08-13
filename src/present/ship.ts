/**
 * Procedural ship renderer — every ship on screen draws its hull class,
 * damage state, team colours, and live pools. Side view, bow to +x,
 * rotated by heading in world space.
 */
import { HULL_CLASSES } from '../content/ships';
import type { ShipState } from '../sim/battle/types';
import type { DirectorCamera } from './camera';

export interface ShipDrawOpts {
  selected?: boolean;
  debugArcs?: boolean;
  showBars?: boolean;
  sinkT?: number;
  t: number;
}

export function drawShipWorld(
  ctx: CanvasRenderingContext2D,
  cam: DirectorCamera,
  ship: ShipState,
  windDir: number,
  opts: ShipDrawOpts,
): void {
  const cls = HULL_CLASSES[ship.hullClass];
  const L = cls.length;
  const s = cam.worldToScreen(ship.x, ship.y);
  const zoom = cam.zoom;
  currentZoom = zoom;

  const hullRatio = ship.hull / ship.maxHull;
  const sailRatio = ship.sails / ship.maxSails;
  const crewRatio = ship.crew / ship.maxCrew;
  const moraleRatio = Math.max(0, ship.morale / ship.maxMorale);

  ctx.save();
  ctx.translate(s.x, s.y);

  if (ship.sunk) {
    const sinkAmt = Math.min(1, (opts.sinkT ?? 0) / 12);
    ctx.translate(0, sinkAmt * L * 0.32 * zoom);
    ctx.rotate(ship.heading + sinkAmt * 0.5);
    ctx.globalAlpha = Math.max(0.15, 1 - sinkAmt * 0.8);
  } else {
    ctx.rotate(ship.heading);
  }
  ctx.scale(zoom, zoom);

  if (opts.selected) {
    ctx.strokeStyle = 'rgba(240, 201, 110, 0.85)';
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([6 / zoom, 5 / zoom]);
    ctx.beginPath();
    ctx.ellipse(0, 0, L * 0.62, L * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (opts.debugArcs && !ship.sunk) {
    drawArcs(ctx, ship, L, zoom);
  }

  drawHull(ctx, ship, L, zoom, hullRatio);
  drawMasts(ctx, ship, L, windDir, sailRatio);
  if (ship.onFire && !ship.sunk) drawFire(ctx, L, opts.t);
  if (ship.sunk) drawWreck(ctx, L);

  ctx.restore();

  if (!ship.sunk && (opts.showBars || opts.selected)) {
    drawLabels(ctx, cam, ship, L, zoom, hullRatio, sailRatio, crewRatio, moraleRatio);
  }
}

function drawHull(
  ctx: CanvasRenderingContext2D,
  ship: ShipState,
  L: number,
  zoom: number,
  hullRatio: number,
): void {
  const team0 = ship.team === 0;
  const base = team0 ? '#8a5a32' : '#6d4430';
  const dark = team0 ? '#5c3a20' : '#4a2c1e';
  const stripe = team0 ? '#2e7d8a' : '#c06655';

  const g = ctx.createLinearGradient(0, -L * 0.08, 0, L * 0.26);
  g.addColorStop(0, base);
  g.addColorStop(0.55, '#7a4d2a');
  g.addColorStop(1, dark);
  ctx.fillStyle = g;

  ctx.beginPath();
  ctx.moveTo(-L * 0.5, -L * 0.02);
  ctx.quadraticCurveTo(-L * 0.58, L * 0.12, -L * 0.34, L * 0.17);
  ctx.quadraticCurveTo(0, L * 0.26, L * 0.34, L * 0.17);
  ctx.quadraticCurveTo(L * 0.56, L * 0.12, L * 0.5, -L * 0.04);
  ctx.quadraticCurveTo(L * 0.42, -L * 0.09, L * 0.3, -L * 0.07);
  ctx.lineTo(-L * 0.4, -L * 0.07);
  ctx.quadraticCurveTo(-L * 0.5, -L * 0.06, -L * 0.5, -L * 0.02);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = stripe;
  ctx.lineWidth = Math.max(1.5, 3.5 / zoom);
  ctx.beginPath();
  ctx.moveTo(-L * 0.46, L * 0.03);
  ctx.lineTo(L * 0.44, L * 0.03);
  ctx.stroke();

  if (hullRatio < 0.45) {
    ctx.fillStyle = 'rgba(10, 12, 14, 0.85)';
    const holes = 3;
    for (let i = 0; i < holes; i++) {
      const hx = -L * 0.3 + i * L * 0.22;
      ctx.beginPath();
      ctx.arc(hx, L * 0.08, (3.5 + i) / zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const ports = Math.min(8, Math.max(2, Math.round((ship.hullClass === 'sloop' ? 5 : ship.hullClass === 'brig' ? 7 : ship.hullClass === 'frigate' ? 9 : 12) / 2)));
  ctx.fillStyle = 'rgba(12, 10, 8, 0.9)';
  for (let i = 0; i < ports; i++) {
    const px = -L * 0.34 + (i / Math.max(1, ports - 1)) * L * 0.68;
    ctx.fillRect(px - 1.5 / zoom, L * 0.1 - 2 / zoom, 3 / zoom, 4 / zoom);
  }

  ctx.strokeStyle = 'rgba(230, 220, 200, 0.25)';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  ctx.moveTo(-L * 0.48, -L * 0.04);
  ctx.lineTo(L * 0.48, -L * 0.04);
  ctx.stroke();

  ctx.strokeStyle = base;
  ctx.lineWidth = Math.max(1, 2.2 / zoom);
  ctx.beginPath();
  ctx.moveTo(-L * 0.46, -L * 0.06);
  ctx.lineTo(-L * 0.72, -L * 0.2);
  ctx.stroke();
}

function drawMasts(
  ctx: CanvasRenderingContext2D,
  ship: ShipState,
  L: number,
  windDir: number,
  sailRatio: number,
): void {
  const masts: Array<[number, number, number]> = [
    [-L * 0.34, L * 0.72, 2],
    [L * 0.02, L * 0.92, 2],
    [L * 0.38, L * 0.78, 1],
  ];

  const wlx = Math.cos(windDir - ship.heading);
  const wly = Math.sin(windDir - ship.heading);
  const billow = clamp01(wlx * 1.4 + 0.4);
  const bulgeX = -wlx * 0.1 * L * billow;
  const bulgeY = -wly * 0.08 * L * billow;

  for (const [mx, mh, tiers] of masts) {
    ctx.strokeStyle = '#4a3320';
    ctx.lineWidth = Math.max(1.2, 2.6 / currentZoom);
    ctx.beginPath();
    ctx.moveTo(mx, -L * 0.05);
    ctx.lineTo(mx, -mh);
    ctx.stroke();

    const tiersToDraw = sailRatio > 0.66 ? tiers : sailRatio > 0.33 ? 1 : 0;
    if (tiersToDraw === 0) continue;
    const tatters = 1 - sailRatio;
    for (let k = 0; k < tiersToDraw; k++) {
      const top = -mh + L * 0.06 + k * L * 0.3;
      const bottom = top + L * 0.27 * (1 - tatters * 0.5);
      const mid = (top + bottom) / 2;
      const w = L * 0.26;
      ctx.fillStyle = ship.team === 0 ? 'rgba(230, 221, 194, 0.95)' : 'rgba(214, 198, 170, 0.95)';
      ctx.beginPath();
      ctx.moveTo(mx - w * 0.5, top);
      ctx.quadraticCurveTo(mx + bulgeX - w * 0.85, mid + bulgeY, mx - w * 0.5, bottom);
      ctx.lineTo(mx + w * 0.5, bottom);
      ctx.quadraticCurveTo(mx + bulgeX + w * 0.75, mid + bulgeY * 0.6, mx + w * 0.5, top);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(120, 100, 70, 0.5)';
      ctx.lineWidth = 0.8 / currentZoom;
      ctx.stroke();
    }
  }

  const [fmx, fmh] = masts[1]!;
  ctx.fillStyle = ship.team === 0 ? '#2e7d8a' : '#c06655';
  ctx.beginPath();
  ctx.moveTo(fmx, -fmh);
  ctx.lineTo(fmx + L * 0.16, -fmh + L * 0.015);
  ctx.lineTo(fmx, -fmh + L * 0.045);
  ctx.closePath();
  ctx.fill();
}

function drawFire(
  ctx: CanvasRenderingContext2D,
  L: number,
  t: number,
): void {
  const flicker = 0.75 + 0.25 * Math.sin(t * 9 + 3.7);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L * 0.55);
  g.addColorStop(0, `rgba(255, 140, 40, ${0.35 * flicker})`);
  g.addColorStop(1, 'rgba(255, 140, 40, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, L * 0.55, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const fx = -L * 0.3 + i * L * 0.15 + Math.sin(t * 11 + i * 2.4) * 4;
    const fy = -L * 0.1 - Math.abs(Math.sin(t * 7 + i * 1.7)) * L * 0.12;
    ctx.fillStyle = `rgba(255, ${150 + i * 12}, 40, ${0.7 + 0.3 * Math.sin(t * 13 + i)})`;
    ctx.beginPath();
    ctx.arc(fx, fy, (3 + i * 0.8) / currentZoom, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWreck(ctx: CanvasRenderingContext2D, L: number): void {
  ctx.strokeStyle = 'rgba(200, 220, 225, 0.4)';
  ctx.lineWidth = 1.2 / currentZoom;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(0, 0, L * (0.3 + i * 0.12), 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawArcs(ctx: CanvasRenderingContext2D, ship: ShipState, L: number, zoom: number): void {
  const cls = HULL_CLASSES[ship.hullClass];
  const half = Math.PI / 2.6;
  ctx.strokeStyle = 'rgba(240, 201, 110, 0.35)';
  ctx.lineWidth = 1 / zoom;
  for (const side of [-1, 1]) {
    const center = ship.heading + side * (Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, cls.gunRange, center - half, center + half);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(240, 201, 110, 0.3)';
  ctx.beginPath();
  ctx.arc(0, 0, 3 / zoom, 0, Math.PI * 2);
  ctx.fill();
  void L;
}

function drawLabels(
  ctx: CanvasRenderingContext2D,
  cam: DirectorCamera,
  ship: ShipState,
  L: number,
  zoom: number,
  hullRatio: number,
  sailRatio: number,
  crewRatio: number,
  moraleRatio: number,
): void {
  const s = cam.worldToScreen(ship.x, ship.y - L * 0.72);
  const w = 64;
  ctx.textAlign = 'center';
  ctx.font = `600 ${Math.max(10, 11 * zoom)}px var(--font-ui)`;
  ctx.fillStyle = ship.team === 0 ? '#cfe4e6' : '#e6c2b8';
  ctx.fillText(ship.name, s.x, s.y - 6);

  const bars: Array<[number, string]> = [
    [hullRatio, '#8a5a32'],
    [sailRatio, '#e6ddc2'],
    [crewRatio, '#d94f4f'],
    [moraleRatio, '#d4a94f'],
  ];
  for (let i = 0; i < bars.length; i++) {
    const [ratio, color] = bars[i]!;
    const by = s.y + i * 4;
    ctx.fillStyle = 'rgba(6, 10, 12, 0.75)';
    ctx.fillRect(s.x - w / 2, by - 1.5, w, 3);
    ctx.fillStyle = color;
    ctx.fillRect(s.x - w / 2, by - 1.5, w * clamp01(ratio), 3);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

let currentZoom = 1;

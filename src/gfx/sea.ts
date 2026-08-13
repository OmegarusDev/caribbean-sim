/**
 * Procedural Caribbean sea backdrop — zero assets.
 * Dusk sky, sun glint, animated wave bands, and a sailing-ship silhouette
 * that bobs and rolls. Used by the title and placeholder scenes; the same
 * module becomes the overworld's water rendering in v0.3.
 */

export interface SeaOptions {
  night?: boolean;
  /** Ships near (main silhouette) or tiny (horizon depth). */
  mood?: 'day' | 'night';
}

const WAVE_COLORS = ['rgba(207, 228, 230, 0.10)', 'rgba(207, 228, 230, 0.16)', 'rgba(207, 228, 230, 0.22)', 'rgba(207, 228, 230, 0.30)'];
const NIGHT_WAVE_COLORS = ['rgba(160, 200, 210, 0.06)', 'rgba(160, 200, 210, 0.10)', 'rgba(160, 200, 210, 0.14)', 'rgba(160, 200, 210, 0.18)'];

export function drawSea(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  opts: SeaOptions = {},
): void {
  const night = opts.mood === 'night' || opts.night === true;
  const horizon = h * 0.42;

  drawSky(ctx, w, horizon, night);
  drawSun(ctx, w, horizon, night, t);
  drawClouds(ctx, w, h, horizon, night, t);
  drawWater(ctx, w, h, horizon, night, t);
  drawGlint(ctx, w, h, horizon, night, t);

  const s = h / 620;
  drawShip(ctx, w * 0.68, horizon + 10 * s, s * 1.15, t, { alpha: 1 });
  drawShip(ctx, w * 0.2, horizon + 3 * s, s * 0.34, t * 0.8, { alpha: 0.5, sway: 0.5 });
}

function drawSky(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  night: boolean,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  if (night) {
    g.addColorStop(0, '#04090e');
    g.addColorStop(0.6, '#081218');
    g.addColorStop(1, '#0e1c24');
  } else {
    g.addColorStop(0, '#0a1a28');
    g.addColorStop(0.55, '#1c4350');
    g.addColorStop(1, '#c98a4a');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, horizon);
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  w: number,
  horizon: number,
  night: boolean,
  t: number,
): void {
  const x = w * 0.5;
  const y = horizon - 4;
  const r = Math.min(w, horizon * 2) * 0.045;
  if (night) {
    ctx.fillStyle = 'rgba(220, 230, 235, 0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
  halo.addColorStop(0, 'rgba(255, 214, 150, 0.55)');
  halo.addColorStop(0.4, 'rgba(255, 190, 110, 0.18)');
  halo.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, r * 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 226, 170, 0.95)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  void t;
}

function drawClouds(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  night: boolean,
  t: number,
): void {
  const bands = [
    { y: 0.12, speed: 6, alpha: 0.10, len: 0.30, offset: 0.0 },
    { y: 0.22, speed: 9, alpha: 0.14, len: 0.24, offset: 0.35 },
    { y: 0.33, speed: 12, alpha: 0.10, len: 0.34, offset: 0.6 },
  ];
  for (const b of bands) {
    const y = horizon * b.y;
    const x0 = -((t * b.speed + b.offset * w) % (w * (1 + b.len))) + w * b.len * 0.4;
    const cw = w * b.len;
    ctx.fillStyle = night
      ? `rgba(200, 215, 220, ${b.alpha * 0.5})`
      : `rgba(255, 214, 170, ${b.alpha})`;
    ctx.beginPath();
    ctx.ellipse(x0, y, cw, h * 0.012, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x0 + cw * 0.4, y - h * 0.008, cw * 0.5, h * 0.008, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWater(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  night: boolean,
  t: number,
): void {
  const g = ctx.createLinearGradient(0, horizon, 0, h);
  if (night) {
    g.addColorStop(0, '#0a141b');
    g.addColorStop(1, '#050a10');
  } else {
    g.addColorStop(0, '#1d4a58');
    g.addColorStop(1, '#0a1a22');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, horizon, w, h - horizon);

  const colors = night ? NIGHT_WAVE_COLORS : WAVE_COLORS;
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const y = horizon + 14 + i * (h * 0.055);
    const amp = 2.5 + i * 1.8;
    const freq = 0.012 + i * 0.004;
    const speed = 0.6 + i * 0.25;
    const phase = i * 2.1;
    ctx.strokeStyle = colors[i]!;
    ctx.lineWidth = 1.2 + i * 0.35;
    ctx.beginPath();
    for (let x = -10; x <= w + 10; x += 6) {
      const yy = y + Math.sin(x * freq + t * speed + phase) * amp;
      if (x === -10) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

function drawGlint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  night: boolean,
  t: number,
): void {
  if (night) return;
  const x = w * 0.5;
  ctx.strokeStyle = 'rgba(255, 226, 170, 0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const gx = x + Math.sin(i * 3.7 + t * 1.3) * (4 + i * 6);
    const gy = horizon + 10 + i * (Math.min(h, horizon * 2) * 0.02);
    const len = 8 + i * 3;
    ctx.globalAlpha = 0.35 + 0.3 * Math.abs(Math.sin(t * 1.7 + i));
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + len, gy + 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

interface ShipOpts {
  alpha: number;
  sway?: number;
}

function drawShip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  t: number,
  opts: ShipOpts,
): void {
  const dark = '#0c1419';
  const sway = opts.sway ?? 1;
  ctx.save();
  ctx.globalAlpha = opts.alpha;
  ctx.translate(x, y + Math.sin(t * 1.1 * sway) * 2.5 * s);
  ctx.rotate(Math.sin(t * 0.6 * sway) * 0.03 * sway);
  ctx.fillStyle = dark;

  // hull — bow to the left
  ctx.beginPath();
  ctx.moveTo(-1.7 * s, 0);
  ctx.quadraticCurveTo(-1.9 * s, 0.42 * s, -0.7 * s, 0.55 * s);
  ctx.quadraticCurveTo(0.3 * s, 0.62 * s, 1.1 * s, 0.5 * s);
  ctx.quadraticCurveTo(1.6 * s, 0.4 * s, 1.45 * s, 0.12 * s);
  ctx.quadraticCurveTo(1.35 * s, -0.05 * s, 0.9 * s, -0.05 * s);
  ctx.lineTo(-1.25 * s, -0.05 * s);
  ctx.quadraticCurveTo(-1.6 * s, -0.05 * s, -1.7 * s, 0);
  ctx.fill();

  // bowsprit
  ctx.strokeStyle = dark;
  ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(-1.65 * s, -0.05 * s);
  ctx.lineTo(-2.5 * s, -0.32 * s);
  ctx.stroke();

  // masts
  const masts: Array<[number, number]> = [
    [-0.95 * s, 1.05 * s],
    [0.05 * s, 1.35 * s],
    [1.0 * s, 1.05 * s],
  ];
  for (const [mx, mh] of masts) {
    ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.beginPath();
    ctx.moveTo(mx, -0.05 * s);
    ctx.lineTo(mx, -mh);
    ctx.stroke();
  }

  // square sails, billowing toward the bow
  for (const [mx, mh] of masts) {
    const top = -mh + 0.12 * s;
    const bottom = -mh + 0.82 * s;
    const mid = (top + bottom) / 2;
    const w2 = 0.52 * s;
    ctx.beginPath();
    ctx.moveTo(mx - w2 * 0.55, top);
    ctx.quadraticCurveTo(mx - w2 * 0.95, mid, mx - w2 * 0.5, bottom);
    ctx.lineTo(mx + w2 * 0.42, bottom);
    ctx.quadraticCurveTo(mx + w2 * 0.52, mid, mx + w2 * 0.46, top);
    ctx.closePath();
    ctx.fill();
  }

  // pennant on the mainmast
  const [fmx, fmh] = masts[1]!;
  const wave = Math.sin(t * 2.2 * sway) * 0.08 * s;
  ctx.beginPath();
  ctx.moveTo(fmx, -fmh);
  ctx.lineTo(fmx + 0.55 * s, -fmh + 0.06 * s + wave);
  ctx.lineTo(fmx, -fmh + 0.18 * s);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

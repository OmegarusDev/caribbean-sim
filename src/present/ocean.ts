/**
 * World-space ocean renderer. Deep gradient, animated wave dashes, subtle
 * swells — all procedural, all relative to the director camera.
 */
import type { DirectorCamera } from './camera';

export function drawOcean(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cam: DirectorCamera,
  t: number,
): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#12313c');
  g.addColorStop(0.5, '#0c2330');
  g.addColorStop(1, '#081722');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const dashWorld = 64;
  const dashLen = 26;
  const wind = 0.4;
  const startWX = cam.screenToWorld(0, 0).x;
  const startWY = cam.screenToWorld(0, 0).y;
  const cols = Math.ceil(w / cam.zoom / dashWorld) + 2;
  const rows = Math.ceil(h / cam.zoom / dashWorld) + 2;

  ctx.lineWidth = Math.max(1, 1.1 * cam.zoom);
  for (let r = 0; r < rows; r++) {
    const seed = r * 31;
    for (let c = 0; c < cols; c++) {
      const wx = startWX + c * dashWorld + ((seed * 13) % 23);
      const wy = startWY + r * dashWorld + ((seed * 7) % 29);
      const phase = t * 1.4 + (seed % 5) * 0.4;
      const yOff = Math.sin(phase + wx * 0.02) * 3;
      const s = cam.worldToScreen(wx, wy);
      const alpha = 0.10 + 0.12 * Math.abs(Math.sin(phase * 0.6));
      ctx.strokeStyle = `rgba(190, 220, 228, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + yOff * cam.zoom);
      ctx.lineTo(s.x - dashLen * cam.zoom, s.y + yOff * cam.zoom + dashLen * 0.08 * cam.zoom);
      ctx.stroke();
    }
  }
  void wind;
}

/**
 * Director camera — follows the action, zooms to the fleet spread, hands
 * back to the director after ~8s of user silence. Manual: drag to pan,
 * wheel/pinch to zoom toward the cursor.
 */
import type { Input } from '../shell/input';

export interface CameraPoint {
  x: number;
  y: number;
}

const USER_HOLD_TICKS = 180;

export class DirectorCamera {
  x = 0;
  y = 0;
  zoom = 1;
  private sx = 0;
  private sy = 0;
  private sz = 1;
  private mode: 'director' | 'manual' = 'director';
  private userHold = 0;
  private interestX: number | null = null;
  private interestY: number | null = null;
  private interestLife = 0;
  private dragging = false;
  private dragMoved = false;
  private dragJustEnded = false;
  private dragSx = 0;
  private dragSy = 0;
  private pan0X = 0;
  private pan0Y = 0;
  private shakeAmp = 0;
  private viewW = 800;
  private viewH = 600;

  update(points: CameraPoint[], dt: number, input: Input): void {
    this.viewW = Math.max(1, this.viewW);
    if (this.mode === 'manual') {
      this.userHold++;
      if (this.userHold > USER_HOLD_TICKS) this.mode = 'director';
    }

    this.handleInput(input);

    if (this.mode === 'director') {
      const t = this.computeTarget(points);
      const spread = this.computeSpread(points);
      this.sx = t.x;
      this.sy = t.y;
      const fitZoom = clamp(Math.min(this.viewW, this.viewH) * 0.5 / Math.max(220, spread), 0.34, 1.5);
      this.sz = fitZoom;
    } else if (this.interestLife > 0) {
      this.sx = this.interestX ?? this.sx;
      this.sy = this.interestY ?? this.sy;
    }

    const k = 1 - Math.exp(-dt * 3.2);
    this.x += (this.sx - this.x) * k;
    this.y += (this.sy - this.y) * k;
    this.zoom += (this.sz - this.zoom) * k;

    if (this.shakeAmp > 0.2) {
      this.shakeAmp *= Math.exp(-dt * 5);
    } else {
      this.shakeAmp = 0;
    }

    if (this.interestLife > 0) this.interestLife -= dt;
    if (this.interestLife <= 0) {
      this.interestX = null;
      this.interestY = null;
    }
  }

  private handleInput(input: Input): void {
    if (input.wheelDelta !== 0) {
      const f = Math.exp(-input.wheelDelta * 0.0012);
      this.sz = clamp(this.sz * f, 0.3, 2.2);
      this.touch();
    }
    if (input.pinchDelta !== 0) {
      const f = Math.exp(-input.pinchDelta * 0.9);
      this.sz = clamp(this.sz * f, 0.3, 2.2);
      this.touch();
    }

    const p = input.pointer;
    const inView = p.x >= 0 && p.x <= this.viewW && p.y >= 0 && p.y <= this.viewH;
    if (p.down && !this.dragging && inView) {
      this.dragging = true;
      this.dragMoved = false;
      this.dragSx = p.x;
      this.dragSy = p.y;
      this.pan0X = this.sx;
      this.pan0Y = this.sy;
    }
    if (p.down && this.dragging) {
      const dx = (p.x - this.dragSx) / this.zoom;
      const dy = (p.y - this.dragSy) / this.zoom;
      if (Math.hypot(dx, dy) > 6 / this.zoom) this.dragMoved = true;
      if (this.dragMoved) {
        this.sx = this.pan0X - dx;
        this.sy = this.pan0Y - dy;
        this.touch();
      }
    }
    if (!p.down && this.dragging) {
      this.dragging = false;
      this.dragJustEnded = this.dragMoved;
    }
  }

  /** True if the just-finished drag moved beyond the click threshold. */
  consumeDragJustEnded(): boolean {
    const v = this.dragJustEnded;
    this.dragJustEnded = false;
    return v;
  }

  private touch(): void {
    this.mode = 'manual';
    this.userHold = 0;
  }

  private computeTarget(points: CameraPoint[]): { x: number; y: number } {
    const alive = points.length > 0 ? points : [{ x: this.x, y: this.y }];
    let x = 0;
    let y = 0;
    for (const p of alive) {
      x += p.x;
      y += p.y;
    }
    return { x: x / alive.length, y: y / alive.length };
  }

  private computeSpread(points: CameraPoint[]): number {
    if (points.length < 2) return 420;
    let max = 0;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const d = Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y);
        if (d > max) max = d;
      }
    }
    return max;
  }

  setInterest(x: number, y: number, life: number): void {
    this.interestX = x;
    this.interestY = y;
    this.interestLife = life;
  }

  shake(amount: number): void {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const shakeX = this.shakeAmp > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    const shakeY = this.shakeAmp > 0 ? (Math.random() - 0.5) * this.shakeAmp : 0;
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2 + shakeX,
      y: (wy - this.y) * this.zoom + this.viewH / 2 + shakeY,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

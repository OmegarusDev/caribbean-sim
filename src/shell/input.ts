/**
 * Keyboard + pointer input. Key state lives here (edge-triggered presses for
 * the current frame); the pointer maps to stage design coordinates.
 * Click-vs-drag is resolved by the caller (scenes that need it).
 */

export interface PointerState {
  x: number;
  y: number;
  down: boolean;
  clicked: boolean;
}

export class Input {
  readonly pointer: PointerState = { x: 0, y: 0, down: false, clicked: false };
  /** Accumulated wheel delta this frame (positive = scroll down). Cleared in endFrame. */
  wheelDelta = 0;
  /** Pinch zoom delta this frame (positive = zoom in). */
  pinchDelta = 0;
  /** Two-finger centroid drag this frame (CSS px). */
  orbitDx = 0;
  orbitDy = 0;
  private readonly keys = new Set<string>();
  private readonly keyPressed = new Set<string>();
  private detached: (() => void) | null = null;
  private pinchBaseDist = 0;
  private prevCentroidX = 0;
  private prevCentroidY = 0;
  private readonly activeTouches = new Map<number, { x: number; y: number }>();

  attach(
    stage: HTMLElement,
    toDesign: (cx: number, cy: number) => { x: number; y: number },
  ): void {
    const sync = (e: PointerEvent) => {
      const p = toDesign(e.clientX, e.clientY);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
    };
    const onMove = (e: PointerEvent) => sync(e);
    const onDown = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      if (e.pointerType === 'touch' && this.activeTouches.size >= 1) {
        sync(e);
        return;
      }
      try {
        stage.setPointerCapture(e.pointerId);
      } catch {
        // pointer already released; ignore
      }
      sync(e);
      this.pointer.down = true;
      this.pointer.clicked = true;
    };
    const onUp = (e: PointerEvent) => {
      if (e.cancelable) e.preventDefault();
      sync(e);
      this.pointer.down = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.keys.has(e.code)) this.keyPressed.add(e.code);
      this.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
      this.wheelDelta += e.deltaY;
    };

    const touchDist = (): number => {
      const pts = [...this.activeTouches.values()];
      if (pts.length < 2) return 0;
      const a = pts[0]!;
      const b = pts[1]!;
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    const touchCentroid = (): { x: number; y: number } => {
      const pts = [...this.activeTouches.values()];
      let x = 0;
      let y = 0;
      for (const p of pts) {
        x += p.x;
        y += p.y;
      }
      return { x: x / pts.length, y: y / pts.length };
    };
    const onTouchStart = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i)!;
        this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (this.activeTouches.size >= 2) {
        this.pinchBaseDist = touchDist();
        const c = touchCentroid();
        this.prevCentroidX = c.x;
        this.prevCentroidY = c.y;
        this.pointer.down = false;
        this.pointer.clicked = false;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i)!;
        this.activeTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      if (this.activeTouches.size >= 2) {
        const c = touchCentroid();
        this.orbitDx += c.x - this.prevCentroidX;
        this.orbitDy += c.y - this.prevCentroidY;
        this.prevCentroidX = c.x;
        this.prevCentroidY = c.y;
        if (this.pinchBaseDist > 8) {
          const d = touchDist();
          if (d > 8) {
            const ratio = d / this.pinchBaseDist;
            this.pinchDelta += (ratio - 1) * 0.85;
            this.pinchBaseDist = d;
          }
        }
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches.item(i)!;
        this.activeTouches.delete(t.identifier);
      }
      if (this.activeTouches.size < 2) this.pinchBaseDist = 0;
    };

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('lostpointercapture', onUp);
    stage.addEventListener('wheel', onWheel, { passive: false });
    stage.addEventListener('touchstart', onTouchStart, { passive: false });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd, { passive: false });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.detached = () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('lostpointercapture', onUp);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }

  detach(): void {
    this.detached?.();
    this.detached = null;
  }

  /** True only on the frame the key went down. */
  wasKeyPressed(code: string): boolean {
    return this.keyPressed.has(code);
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** True while two+ fingers are down on the stage (pinch in progress). */
  get isPinching(): boolean {
    return this.activeTouches.size >= 2;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pointer.clicked = false;
    this.wheelDelta = 0;
    this.pinchDelta = 0;
    this.orbitDx = 0;
    this.orbitDy = 0;
    this.keyPressed.clear();
  }
}

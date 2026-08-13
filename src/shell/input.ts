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
  private readonly keys = new Set<string>();
  private readonly keyPressed = new Set<string>();
  private detached: (() => void) | null = null;

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

    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('lostpointercapture', onUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.detached = () => {
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      stage.removeEventListener('lostpointercapture', onUp);
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

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pointer.clicked = false;
    this.keyPressed.clear();
  }
}

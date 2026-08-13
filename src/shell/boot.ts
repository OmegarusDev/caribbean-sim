/**
 * The presentation loop. Owns RAF, the fixed-step accumulator, and
 * visibility pausing. Sim clocks are driven from `onFixed` (or not at all —
 * action-driven clocks advance from the shell's scenes instead).
 */

const STEP = 1 / 60;
const MAX_DT = 0.05;

export interface LoopHooks {
  /** Per-frame, non-fixed. Presentation + scene logic. */
  update(dt: number): void;
  /** Per-frame. Render the current scene to the stage. */
  render(): void;
}

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  constructor(private readonly hooks: LoopHooks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** How many fixed steps are due this frame (for sim clocks). */
  fixedStepsDue(): number {
    return Math.floor(this.acc / STEP);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(MAX_DT, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= STEP) this.acc -= STEP;
    this.hooks.update(dt);
    this.hooks.render();
  };
}

/**
 * Scene stack with fade transitions (the Apex pattern).
 * push / replace / back; Esc semantics flow through `handleBack`.
 * Scenes own their DOM chrome (enter builds it, exit tears it down) and
 * render the shared stage canvas each frame.
 */

const FADE_MS = 150;

export interface Scene {
  enter?(): void;
  exit?(): void;
  update(dt: number): void;
  /** 2D canvas for fallback scenes; GL scenes ignore it and use their own context. */
  render(ctx: CanvasRenderingContext2D | null, w: number, h: number): void;
  /** Return true to consume the back action; false falls through to pop. */
  handleBack?(): boolean;
}

type TransitionKind = 'none' | 'fadeOut' | 'fadeIn';

interface PendingNav {
  action: 'push' | 'replace' | 'back';
  scene?: Scene;
}

export class SceneManager {
  private stack: Scene[] = [];
  private transition: TransitionKind = 'none';
  private transitionT = 0;
  private pending: PendingNav | null = null;

  get current(): Scene | null {
    return this.stack.length === 0 ? null : this.stack[this.stack.length - 1]!;
  }

  get depth(): number {
    return this.stack.length;
  }

  push(scene: Scene): void {
    if (this.transition !== 'none') {
      this.pending = { action: 'push', scene };
      return;
    }
    this.beginFadeOut({ action: 'push', scene });
  }

  replace(scene: Scene): void {
    if (this.transition !== 'none') {
      this.pending = { action: 'replace', scene };
      return;
    }
    this.beginFadeOut({ action: 'replace', scene });
  }

  back(): void {
    if (this.stack.length <= 1) return;
    if (this.transition !== 'none') {
      this.pending = { action: 'back' };
      return;
    }
    this.beginFadeOut({ action: 'back' });
  }

  handleBack(): boolean {
    const scene = this.current;
    if (scene?.handleBack !== undefined && scene.handleBack()) return true;
    if (this.stack.length > 1) {
      this.back();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    if (this.transition === 'fadeOut') {
      this.transitionT += dt;
      if (this.transitionT >= FADE_MS / 1000) {
        this.commitPending();
        this.transition = 'fadeIn';
        this.transitionT = 0;
      }
      return;
    }
    if (this.transition === 'fadeIn') {
      this.transitionT += dt;
      if (this.transitionT >= FADE_MS / 1000) {
        this.transition = 'none';
        this.transitionT = 0;
        if (this.pending !== null) {
          this.beginFadeOut(this.pending);
          return;
        }
      }
    }
    this.current?.update(dt);
  }

  render(ctx: CanvasRenderingContext2D | null, w: number, h: number): void {
    this.current?.render(ctx, w, h);
    if (this.transition === 'none' || !ctx) return;
    const alpha =
      this.transition === 'fadeOut'
        ? Math.min(1, this.transitionT / (FADE_MS / 1000))
        : Math.max(0, 1 - this.transitionT / (FADE_MS / 1000));
    if (alpha <= 0) return;
    ctx.save();
    ctx.fillStyle = `rgba(6, 10, 12, ${alpha})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  private beginFadeOut(nav: PendingNav): void {
    this.pending = nav;
    this.transition = 'fadeOut';
    this.transitionT = 0;
  }

  private commitPending(): void {
    const nav = this.pending;
    this.pending = null;
    if (nav === null) return;

    if (nav.action === 'push' && nav.scene !== undefined) {
      this.current?.exit?.();
      this.stack.push(nav.scene);
      this.safeEnter(nav.scene);
      return;
    }
    if (nav.action === 'replace' && nav.scene !== undefined) {
      const outgoing = this.stack.pop();
      outgoing?.exit?.();
      this.stack.push(nav.scene);
      this.safeEnter(nav.scene);
      return;
    }
    if (nav.action === 'back' && this.stack.length > 1) {
      const outgoing = this.stack.pop();
      outgoing?.exit?.();
      this.safeEnter(this.current);
    }
  }

  private safeEnter(scene: Scene | null): void {
    if (!scene) return;
    try {
      scene.enter?.();
    } catch (err) {
      console.error('[caribbean] scene.enter failed', err);
    }
  }
}

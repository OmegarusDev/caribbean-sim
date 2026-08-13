/**
 * WebGL2 context — the stage canvas, sized to CSS box × DPR.
 *
 * Robustness contract:
 *  - Context loss (mobile browsers recycle contexts on backgrounding) is
 *    handled: consumers register rebuilders; on restore every GL resource
 *    is recreated and the scene continues. Nothing is ever left dangling.
 */

export interface GlContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  cssW: number;
  cssH: number;
  dpr: number;
  lost: boolean;
  resize(cssW: number, cssH: number, dprIn?: number): void;
  /** Register a function called once when the context is restored. */
  onRestore(fn: () => void): void;
  dispose(): void;
}

export type GlHandle = WebGL2RenderingContext;

export function createGl(canvas: HTMLCanvasElement): GlContext | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.right = '0';
  canvas.style.bottom = '0';
  canvas.style.display = 'block';
  canvas.style.margin = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.touchAction = 'none';

  const restoreFns: Array<() => void> = [];

  const ctx: GlContext = {
    gl,
    canvas,
    cssW: 1,
    cssH: 1,
    dpr: 1,
    lost: false,
    resize(cssW, cssH, dprIn) {
      const dpr = Math.min(dprIn ?? window.devicePixelRatio ?? 1, 2);
      const bw = Math.max(1, Math.floor(cssW * dpr));
      const bh = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      gl.viewport(0, 0, bw, bh);
      ctx.cssW = cssW;
      ctx.cssH = cssH;
      ctx.dpr = dpr;
    },
    onRestore(fn) {
      restoreFns.push(fn);
    },
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    },
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    ctx.lost = true;
    console.warn('[caribbean] WebGL context lost — pausing render');
  };
  const onRestored = () => {
    ctx.lost = false;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    for (const fn of restoreFns) {
      try {
        fn();
      } catch (err) {
        console.error('[caribbean] context restore step failed', err);
      }
    }
    console.info('[caribbean] WebGL context restored');
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  // Flat XZ-world meshes are cull-sensitive; everything reads double-sided.
  gl.disable(gl.CULL_FACE);

  return ctx;
}

/** Dispose a list of GL resources safely (used on context loss paths). */
export function disposeAll(gl: GlHandle, items: Array<{ dispose(gl: GlHandle): void }>): void {
  for (const item of items) {
    try {
      item.dispose(gl);
    } catch {
      // already disposed or lost — safe to ignore
    }
  }
}

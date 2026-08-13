/** WebGL2 context wrapper — the stage canvas, sized to its CSS box × DPR. */

export interface GlContext {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  cssW: number;
  cssH: number;
  dpr: number;
  lost: boolean;
  resize(cssW: number, cssH: number, dprIn?: number): void;
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
    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    },
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    ctx.lost = true;
    console.warn('[caribbean] WebGL context lost');
  };
  const onRestored = () => {
    ctx.lost = false;
    console.info('[caribbean] WebGL context restored — reload recommended');
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.disable(gl.CULL_FACE);

  return ctx;
}

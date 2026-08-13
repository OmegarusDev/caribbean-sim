/**
 * Pin #app to the visualViewport so iOS URL-bar drift cannot desync hits.
 * The stage canvas is sized to its CSS box × DPR and passed to the GL
 * context — one render path, WebGL only.
 */
import type { GlContext } from '../gfx/core/context';

export interface AppShell {
  app: HTMLElement;
  chrome: HTMLElement;
  stageWrap: HTMLElement;
  stage: HTMLCanvasElement;
}

export function mountShell(): AppShell {
  const app = document.getElementById('app');
  const chrome = document.getElementById('chrome');
  const stageWrap = document.getElementById('stage-wrap');
  const stage = document.getElementById('stage');
  if (!(app instanceof HTMLElement)) throw new Error('#app not found');
  if (!(chrome instanceof HTMLElement)) throw new Error('#chrome not found');
  if (!(stageWrap instanceof HTMLElement)) throw new Error('#stage-wrap not found');
  if (!(stage instanceof HTMLCanvasElement)) throw new Error('#stage canvas not found');

  const pin = () => pinAppToVisualViewport(app);
  pin();
  window.addEventListener('resize', pin);
  window.addEventListener('orientationchange', pin);
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', pin);
    vv.addEventListener('scroll', pin);
  }

  return { app, chrome, stageWrap, stage };
}

export function pinAppToVisualViewport(app: HTMLElement): void {
  const vv = window.visualViewport;
  const w = vv && vv.width > 0 ? vv.width : window.innerWidth;
  const h = vv && vv.height > 0 ? vv.height : window.innerHeight;
  const left = vv?.offsetLeft ?? 0;
  const top = vv?.offsetTop ?? 0;
  app.style.width = `${Math.max(1, w)}px`;
  app.style.height = `${Math.max(1, h)}px`;
  app.style.left = `${left}px`;
  app.style.top = `${top}px`;
}

/** Resize the GL stage to its CSS box × DPR. Returns CSS dims. */
export function resizeStageCanvas(
  stage: HTMLCanvasElement,
  gl: GlContext,
): { cssW: number; cssH: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const wrap = stage.parentElement;
  const wrapRect = wrap?.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const cssW = Math.max(1, Math.round(wrapRect?.width || stageRect.width || window.innerWidth));
  const cssH = Math.max(1, Math.round(wrapRect?.height || stageRect.height || window.innerHeight));
  gl.resize(cssW, cssH, dpr);
  return { cssW, cssH };
}

/**
 * Skirmish sandbox placeholder — the v0.1 development home for the sea-battle
 * pure function (stepCombat) and its director. For now: moody night sea.
 */
import type { Scene } from '../shell/scenes';
import type { SceneManager } from '../shell/scenes';
import { btn, clear, el } from '../shell/ui/dom';
import { drawSea } from '../present/sea';

export interface SkirmishDeps {
  chrome: HTMLElement;
  scenes: SceneManager;
}

export class SkirmishScene implements Scene {
  private time = 0;

  constructor(private readonly deps: SkirmishDeps) {}

  enter(): void {
    const { chrome, scenes } = this.deps;
    clear(chrome);
    const screen = el('div', { className: 'screen' });
    const panel = el('div', { className: 'panel' });
    panel.append(el('h2', { text: 'Skirmish Sandbox' }));
    panel.append(
      el('p', {
        text:
          'Ship-to-ship combat charts here in v0.1 — wind, broadsides, capture, and the director.',
      }),
    );
    panel.append(
      el('p', {
        text: 'This sandbox is the home of the battle sim while the overworld is built.',
      }),
    );
    panel.append(
      btn('Back', {
        className: 'ghost',
        onClick: () => scenes.back(),
      }),
    );
    screen.append(panel);
    chrome.append(screen);
  }

  exit(): void {
    clear(this.deps.chrome);
  }

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    drawSea(ctx, w, h, this.time, { mood: 'night' });
  }

  handleBack(): boolean {
    return false;
  }
}

/**
 * Skirmish sandbox — the v0.1 home of the sea-battle sim. Pick a preset,
 * enter the battle; R restarts the seed, N rerolls it.
 */
import type { Scene } from '../shell/scenes';
import type { SceneManager } from '../shell/scenes';
import type { Input } from '../shell/input';
import type { Synth } from '../shell/audio';
import { btn, clear, el } from '../shell/ui/dom';
import { drawSea } from '../present/sea';
import { SKIRMISH_PRESETS } from '../content/skirmish';
import type { SkirmishPreset } from '../content/skirmish';
import { BattleScene } from './battle';

export interface SkirmishDeps {
  chrome: HTMLElement;
  scenes: SceneManager;
  input: Input;
  synth: Synth;
}

export class SkirmishScene implements Scene {
  private time = 0;

  constructor(private readonly deps: SkirmishDeps) {}

  enter(): void {
    const { chrome, scenes } = this.deps;
    clear(chrome);
    const screen = el('div', { className: 'screen' });
    const panel = el('div', { className: 'panel skirmish-panel' });
    panel.append(el('h2', { text: 'Skirmish Sandbox' }));
    panel.append(
      el('p', {
        text: 'Ship-to-ship combat — wind, broadsides, capture, strike. Pick a fleet action.',
      }),
    );

    const stack = el('div', { className: 'stack' });
    for (const preset of SKIRMISH_PRESETS) {
      stack.append(
        btn(preset.label, {
          className: 'ghost',
          title: preset.blurb,
          onClick: () => this.launch(preset),
        }),
      );
    }
    panel.append(stack);

    panel.append(
      el('p', {
        className: 'skirmish-note',
        text: 'In battle: 1/2/4 speed · P pause · R restart · N reroll · D arcs · click a ship to inspect',
      }),
    );
    panel.append(
      btn('Back', {
        className: 'quiet',
        onClick: () => scenes.back(),
      }),
    );
    screen.append(panel);
    chrome.append(screen);
  }

  private launch(preset: SkirmishPreset): void {
    this.deps.synth.ensure();
    const seed = (Date.now() >>> 0) || 1;
    this.deps.scenes.push(new BattleScene(this.deps, preset, seed));
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

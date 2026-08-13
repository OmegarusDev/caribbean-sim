/** Title screen — brand, voyage actions, skirmish sandbox, help. */
import type { Scene } from '../shell/scenes';
import type { SceneManager } from '../shell/scenes';
import type { Input } from '../shell/input';
import type { Synth } from '../shell/audio';
import type { SaveManager } from '../sim/save';
import type { GameState } from '../game/state';
import { createFreshGame } from '../game/state';
import { btn, clear, el } from '../shell/ui/dom';
import { confirmModal, panelModal } from '../shell/ui/modal';
import { toast } from '../shell/ui/toast';
import { SeaScene } from '../gfx/scene3d';
import type { GlContext } from '../gfx/gl/context';
import { SkirmishScene } from './skirmish';

export interface TitleDeps {
  chrome: HTMLElement;
  scenes: SceneManager;
  save: SaveManager<GameState>;
  input: Input;
  synth: Synth;
  gl: GlContext | null;
}

export const GAME_VERSION = 'v0.0.1';

export class TitleScene implements Scene {
  private time = 0;
  private scene3d: SeaScene | null = null;

  constructor(private readonly deps: TitleDeps) {}

  enter(): void {
    this.buildChrome();
  }

  exit(): void {
    clear(this.deps.chrome);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.scene3d) {
      this.scene3d.camera.smoothYaw += dt * 0.045;
      this.scene3d.camera.update([], dt, this.deps.input, null);
      this.scene3d.setParticles([]);
    }
  }

  render(w: number, h: number): void {
    const gl = this.deps.gl;
    if (!gl || gl.lost) return;
    if (!this.scene3d) {
      this.scene3d = new SeaScene(gl);
      this.scene3d.setWind(0.9, 0.8);
      this.scene3d.camera.smoothDolly = 820;
      this.scene3d.camera.smoothPitch = 0.5;
      this.scene3d.camera.smoothYaw = 0;
    }
    this.scene3d.camera.resize(w, h);
    this.scene3d.render(this.time);
  }

  handleBack(): boolean {
    return false;
  }

  private buildChrome(): void {
    const { chrome, save, scenes } = this.deps;
    clear(chrome);
    const screen = el('div', { className: 'screen title-screen' });

    const brand = el('div', { className: 'brand' });
    brand.append(
      el('div', { className: 'brand-mark', attrs: { 'aria-hidden': 'true' }, text: '⚓' }),
    );
    brand.append(el('h1', { text: 'CARIBBEAN' }));
    brand.append(el('p', { className: 'tagline', text: 'Piracy · Trade · Empire' }));
    screen.append(brand);

    const canContinue = save.hasSave();
    const stack = el('div', { className: 'stack' });

    if (canContinue) {
      stack.append(
        btn('Continue Voyage', {
          className: 'cta',
          onClick: () => {
            toast('Your voyage is saved — the Caribbean charts itself in v0.3.');
          },
        }),
      );
    }

    stack.append(
      btn('New Voyage', {
        className: canContinue ? undefined : 'cta',
        onClick: () => {
          if (canContinue) {
            confirmModal({
              title: 'New Voyage',
              body: 'Starting a new voyage replaces your current save.',
              confirmLabel: 'Set Sail',
              danger: true,
              onConfirm: () => this.newVoyage(),
            });
          } else {
            this.newVoyage();
          }
        },
      }),
      btn('Skirmish', {
        className: 'ghost',
        onClick: () =>
          scenes.push(
            new SkirmishScene({
              chrome,
              scenes,
              input: this.deps.input,
              synth: this.deps.synth,
              gl: this.deps.gl,
            }),
          ),
      }),
    );

    const row = el('div', { className: 'title-tools' });
    row.append(
      btn('How to Play', {
        className: 'quiet',
        onClick: () => this.showHelp(),
      }),
    );
    stack.append(row);
    screen.append(stack);

    const foot = el('p', {
      className: 'footer-note',
      text: `${GAME_VERSION} — the Skirmish sandbox charts next.`,
    });
    if (canContinue) {
      const state = save.getState();
      if (state) {
        foot.append(
          el('span', {
            className: 'footer-extra',
            text: `  ·  ${state.captainName} — ${new Date(state.createdAt).toLocaleDateString()}`,
          }),
        );
      }
    }
    screen.append(foot);

    chrome.append(screen);
  }

  private newVoyage(): void {
    this.deps.save.save(createFreshGame());
    toast('A new voyage begins. The sea is yours — in v0.3.');
    this.buildChrome();
  }

  private showHelp(): void {
    const body = el('div');
    body.append(
      el('p', {
        text:
          'Caribbean is a persistent-world pirate sim: sail a living sea, trade a simulated economy, fight ship-to-ship.',
      }),
    );
    const list = el('ul');
    const rows: Array<[string, string]> = [
      ['Esc', 'back / close menus'],
      ['New Voyage', 'begin a persistent run (world arrives v0.3)'],
      ['Skirmish', 'quick ship-to-ship combat (arrives v0.1)'],
    ];
    for (const [key, what] of rows) {
      list.append(el('li', { html: `<span class="key">${key}</span> — ${what}` }));
    }
    body.append(list);
    panelModal('How to Play', body);
  }
}

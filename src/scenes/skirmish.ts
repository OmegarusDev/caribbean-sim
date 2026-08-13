/**
 * Skirmish sandbox — ship select for 1v1 duels (live preview on the sea),
 * plus the fleet-action presets. R restarts a battle's seed, N rerolls it.
 */
import type { Scene } from '../shell/scenes';
import type { SceneManager } from '../shell/scenes';
import type { Input } from '../shell/input';
import type { Synth } from '../shell/audio';
import { btn, clear, el, segment } from '../shell/ui/dom';
import { SeaScene, toShipView } from '../gfx/scene3d';
import { makePreviewShip } from '../gfx/ship3d';
import type { GlContext } from '../gfx/gl/context';
import { HULL_CLASSES, HULL_CLASS_LIST } from '../content/ships';
import type { HullClassId } from '../content/ships';
import { SKIRMISH_PRESETS } from '../content/skirmish';
import type { SkirmishPreset } from '../content/skirmish';
import { makeDuelConfig, makeSkirmishConfig } from '../content/skirmish';
import { BattleScene, type BattleLaunch } from './battle';

export interface SkirmishDeps {
  chrome: HTMLElement;
  scenes: SceneManager;
  input: Input;
  synth: Synth;
  gl: GlContext | null;
}

type SelectMode = 'duel' | 'fleet';
type Side = 'player' | 'enemy';

export class SkirmishScene implements Scene {
  private playerClass: HullClassId = 'sloop';
  private enemyClass: HullClassId = 'sloop';
  private time = 0;
  private scene3d: SeaScene | null = null;
  private previewBuilt = false;
  private root: HTMLElement | null = null;
  private duelView: HTMLElement | null = null;
  private fleetView: HTMLElement | null = null;
  private playerStats: HTMLElement | null = null;
  private enemyStats: HTMLElement | null = null;

  constructor(private readonly deps: SkirmishDeps) {}

  enter(): void {
    this.buildChrome();
  }

  exit(): void {
    if (this.root) this.root.remove();
    this.root = null;
    this.previewBuilt = false;
  }

  update(dt: number): void {
    this.time += dt;
    if (this.scene3d) {
      this.scene3d.camera.update(
        [
          { x: -520, y: 30 },
          { x: 520, y: -30 },
        ],
        dt,
        this.deps.input,
        null,
      );
      this.scene3d.smoothPoses(dt, this.time);
      this.scene3d.setParticles([]);
    }
  }

  render(w: number, h: number): void {
    const gl = this.deps.gl;
    if (!gl || gl.lost) return;
    if (!this.scene3d) {
      this.scene3d = new SeaScene(gl);
      this.scene3d.setWind(0.6, 0.8);
      this.scene3d.camera.smoothDolly = 900;
      this.scene3d.camera.smoothPitch = 0.48;
      this.scene3d.camera.smoothYaw = 0;
    }
    if (!this.previewBuilt) {
      this.scene3d.setShips(this.previewViews());
      this.previewBuilt = true;
    }
    this.scene3d.camera.resize(w, h);
    this.scene3d.render(this.time);
  }

  private previewViews() {
    if (!this.scene3d) return [];
    const player = makePreviewShip(
      'p',
      0,
      `Your ${HULL_CLASSES[this.playerClass].name}`,
      this.playerClass,
      0,
    );
    const enemy = makePreviewShip(
      'e',
      1,
      `Enemy ${HULL_CLASSES[this.enemyClass].name}`,
      this.enemyClass,
      Math.PI,
    );
    player.x = -520;
    player.y = 30;
    enemy.x = 520;
    enemy.y = -30;
    return [toShipView(player, true), toShipView(enemy, false)];
  }

  handleBack(): boolean {
    return false;
  }

  private buildChrome(): void {
    const { chrome, scenes } = this.deps;
    clear(chrome);
    this.root = el('div', { className: 'screen skirmish-screen' });

    const head = el('div', { className: 'skirmish-head' });
    head.append(el('h2', { text: 'Skirmish Sandbox' }));
    head.append(
      segment(['Duel', 'Fleet Action'], 0, (i) => this.setMode(i === 0 ? 'duel' : 'fleet')),
    );
    this.root.append(head);

    this.duelView = el('div', { className: 'duel-view' });
    const grid = el('div', { className: 'select-grid' });

    const player = this.buildSide('player', 'Your Ship');
    const enemy = this.buildSide('enemy', 'Enemy Ship');
    grid.append(player.panel, el('div', { className: 'vs-mark', text: 'VS' }), enemy.panel);
    this.duelView.append(grid);

    this.duelView.append(
      btn('Set Sail', {
        className: 'cta sail-btn',
        onClick: () => this.launchDuel(),
      }),
    );
    this.root.append(this.duelView);

    this.fleetView = el('div', { className: 'fleet-view is-hidden' });
    const stack = el('div', { className: 'stack' });
    for (const preset of SKIRMISH_PRESETS) {
      stack.append(
        btn(preset.label, {
          className: 'ghost',
          title: preset.blurb,
          onClick: () => this.launchFleet(preset),
        }),
      );
    }
    this.fleetView.append(stack);
    this.root.append(this.fleetView);

    this.root.append(
      el('p', {
        className: 'skirmish-note',
        text: 'In battle: 1/2/4 speed · P pause · R restart · N reroll · D arcs · click a ship to inspect',
      }),
    );
    this.root.append(
      btn('Back', {
        className: 'quiet',
        onClick: () => scenes.back(),
      }),
    );

    chrome.append(this.root);
    this.refreshSide('player');
    this.refreshSide('enemy');
  }

  private buildSide(
    side: Side,
    label: string,
  ): { panel: HTMLElement; row: HTMLElement } {
    const panel = el('div', { className: 'select-side' });
    panel.append(el('div', { className: 'select-side-label', text: label }));
    const row = el('div', { className: 'select-row' });
    for (const cls of HULL_CLASS_LIST) {
      const b = btn(HULL_CLASSES[cls].name, {
        className: 'ghost select-btn',
        onClick: () => this.pick(side, cls),
      });
      b.dataset.side = side;
      b.dataset.cls = cls;
      row.append(b);
    }
    panel.append(row);
    const stats = el('div', { className: 'select-stats' });
    panel.append(stats);
    if (side === 'player') this.playerStats = stats;
    else this.enemyStats = stats;
    return { panel, row };
  }

  private pick(side: Side, cls: HullClassId): void {
    if (side === 'player') this.playerClass = cls;
    else this.enemyClass = cls;
    this.deps.synth.play('ui');
    this.refreshSide(side);
    this.previewBuilt = false;
  }

  private setMode(mode: SelectMode): void {
    this.duelView?.classList.toggle('is-hidden', mode !== 'duel');
    this.fleetView?.classList.toggle('is-hidden', mode !== 'fleet');
    this.deps.synth.play('ui');
  }

  private refreshSide(side: Side): void {
    if (!this.root) return;
    const cls = side === 'player' ? this.playerClass : this.enemyClass;
    const stats = side === 'player' ? this.playerStats : this.enemyStats;
    this.root.querySelectorAll<HTMLButtonElement>(`[data-side="${side}"]`).forEach((b) => {
      b.classList.toggle('is-active', b.dataset.cls === cls);
    });
    if (stats) stats.innerHTML = statBars(cls, side === 'player' ? '#2e7d8a' : '#c06655');
  }

  private launchDuel(): void {
    const player = this.playerClass;
    const enemy = this.enemyClass;
    const launch: BattleLaunch = {
      label: `${HULL_CLASSES[player].name} vs ${HULL_CLASSES[enemy].name}`,
      makeConfig: (seed) => makeDuelConfig(player, enemy, seed),
    };
    this.launch(launch);
  }

  private launchFleet(preset: SkirmishPreset): void {
    const launch: BattleLaunch = {
      label: preset.label,
      makeConfig: (seed) => makeSkirmishConfig(preset, seed),
    };
    this.launch(launch);
  }

  private launch(launch: BattleLaunch): void {
    this.deps.synth.ensure();
    const seed = (Date.now() >>> 0) || 1;
    this.deps.scenes.push(new BattleScene(this.deps, launch, seed));
  }
}

interface StatDef {
  label: string;
  value: number;
}

function statBars(clsId: HullClassId, color: string): string {
  const cls = HULL_CLASSES[clsId];
  const stats: StatDef[] = [
    { label: 'Hull', value: cls.maxHull },
    { label: 'Sails', value: cls.maxSails },
    { label: 'Crew', value: cls.maxCrew },
    { label: 'Guns', value: cls.guns },
    { label: 'Speed', value: cls.baseSpeed },
    { label: 'Turn', value: cls.turnRate },
    { label: 'Range', value: cls.gunRange },
    { label: 'Boarding', value: 1 + cls.boardingBonus },
  ];
  return stats
    .map((s) => {
      const ratio = s.value / MAX_STATS[s.label]!;
      const value = s.label === 'Boarding' ? (s.value * 100).toFixed(0) : String(Math.round(s.value));
      return `<div class="stat-row"><span class="stat-label">${s.label}</span><span class="stat-bar"><i style="width:${Math.round(ratio * 100)}%;background:${color}"></i></span><span class="stat-value">${value}</span></div>`;
    })
    .join('');
}

const MAX_STATS: Record<string, number> = (() => {
  const collect = (key: keyof (typeof HULL_CLASSES)['sloop']) =>
    Math.max(...HULL_CLASS_LIST.map((c) => HULL_CLASSES[c][key] as number));
  return {
    Hull: collect('maxHull'),
    Sails: collect('maxSails'),
    Crew: collect('maxCrew'),
    Guns: collect('guns'),
    Speed: collect('baseSpeed'),
    Turn: collect('turnRate'),
    Range: collect('gunRange'),
    Boarding: Math.max(...HULL_CLASS_LIST.map((c) => 1 + HULL_CLASSES[c].boardingBonus)),
  };
})();

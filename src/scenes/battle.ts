/**
 * The Skirmish battle scene — a live window onto the sea-battle domain.
 * Fixed-step sim (BATTLE_TICK) driven by the shell loop; events feed the
 * spectacle, story, audio, and FX. The world's spatial combat (v0.3) will
 * embed this same loop at high tick rate near the player.
 */
import type { Scene } from '../shell/scenes';
import type { SceneManager } from '../shell/scenes';
import type { Input } from '../shell/input';
import { type SoundKind, type Synth } from '../shell/audio';
import { BATTLE_TICK } from '../sim/battle/types';
import type { BattleConfig, BattleResult, ShipState } from '../sim/battle/types';
import { Battle } from '../sim/battle/battle';
import { SeededRng } from '../sim/rng';
import type { Camera3d } from '../gfx/core/camera';
import { projectToNdc, vec3 } from '../gfx/core/math';
import type { SimEvent } from '../sim/events';
import { SpectacleMeter } from '../director/spectacle';
import { eventLine } from '../director/story';
import { FxSystem } from '../gfx/core/fx';
import { WorldScene } from '../gfx/world/scene';
import {
  getRingMesh,
  getRingProgram,
  getShipMesh,
  getShipProgram,
  resetGpuCaches,
} from '../gfx/present/shipMesh';
import { ringEntity, shipToEntity } from '../gfx/present/shipViews';
import type { WorldEntity } from '../gfx/world/entities';
import type { GlContext } from '../gfx/core/context';
import { HULL_CLASSES, HULL_CLASS_LIST } from '../content/ships';
import { el } from '../shell/ui/dom';
import { FireControl, SailControl, WheelControl } from '../shell/ui/controls';

export interface BattleDeps {
  chrome: HTMLElement;
  scenes: SceneManager;
  input: Input;
  synth: Synth;
  gl: GlContext | null;
}

export interface BattleLaunch {
  label: string;
  makeConfig: (seed: number) => BattleConfig;
  mode?: 'auto' | 'captain';
}

type HudAction =
  | { type: 'NONE' }
  | { type: 'SPEED'; speed: number }
  | { type: 'PAUSE' }
  | { type: 'MUTE' }
  | { type: 'DEBUG' }
  | { type: 'RESTART' }
  | { type: 'REROLL' }
  | { type: 'LEAVE' }
  | { type: 'CONTINUE' };

export class BattleScene implements Scene {
  private readonly battle: Battle;
  private readonly launch: BattleLaunch;
  private readonly seed: number;
  private readonly mode: 'auto' | 'captain';
  private wheel: WheelControl | null = null;
  private sail: SailControl | null = null;
  private fireCtl: FireControl | null = null;
  private speed = 1;
  private paused = false;
  private finished = false;
  private simAcc = 0;
  private time = 0;
  private selectedId: string | null = null;
  private caption: string | null = null;
  private captionLife = 0;
  private story: string[] = [];
  private spectacle = new SpectacleMeter();
  private scene: WorldScene | null = null;
  private fx: FxSystem;
  private sinkTimers = new Map<string, number>();
  private result: BattleResult | null = null;
  private pending: HudAction = { type: 'NONE' };
  private hudDirty = true;
  private hudTick = 0;
  private root: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private ferocityEl: HTMLElement | null = null;
  private windEl: HTMLElement | null = null;
  private inspectEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private debugChip: HTMLElement | null = null;
  private debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';
  private probeBuf = new Uint8Array(4);
  private probe = '?';

  constructor(
    private readonly deps: BattleDeps,
    launch: BattleLaunch,
    seed: number,
  ) {
    this.launch = launch;
    this.seed = seed;
    this.mode = launch.mode ?? 'auto';
    this.battle = new Battle(launch.makeConfig(seed));
    const fxRng = new SeededRng(seed).split(0xfeed);
    this.fx = new FxSystem(() => fxRng.next());
    const first = this.battle.ships[0]!;
    this.firstShipX = first.x;
    this.firstShipY = first.y;
  }

  private firstShipX = 0;
  private firstShipY = 0;

  enter(): void {
    this.deps.synth.ensure();
    this.buildHud();
    if (this.mode === 'captain') {
      const player = this.playerShip();
      this.caption = player
        ? `You sail the ${player.name} — wheel to steer, slider to trim, FIRE to loose the broadside`
        : 'You sail — wheel to steer, slider to trim, FIRE to loose the broadside';
      this.captionLife = 4.5;
      this.hudDirty = true;
    }
  }

  exit(): void {
    if (this.root) this.root.remove();
    this.root = null;
    this.scene?.dispose();
    this.scene = null;
  }

  handleBack(): boolean {
    if (this.finished) {
      this.leave();
    } else {
      this.paused = !this.paused;
      this.hudDirty = true;
    }
    return true;
  }

  update(dt: number): void {
    this.time += dt;
    this.lastDt = dt;
    this.hudTick++;

    const key = this.handleKeys();
    if (key.type !== 'NONE') this.applyAction(key);
    const hud = this.pollHud();
    if (hud.type !== 'NONE') this.applyAction(hud);

    if (!this.paused && !this.finished) {
      if (this.mode === 'captain') this.applyPlayerInput();
      this.simAcc += dt * this.speed;
      let steps = 0;
      while (this.simAcc >= BATTLE_TICK && steps < 400) {
        this.battle.step();
        this.simAcc -= BATTLE_TICK;
        steps++;
        if (this.battle.phase !== 'ongoing') {
          this.finished = true;
          this.result = this.battle.buildResult();
          this.showBanner();
          break;
        }
      }
      if (this.simAcc > 1) this.simAcc = 0;
      this.handleEvents(this.battle.getRecentEvents());
      this.battle.clearRecentEvents();
    }

    if (this.captionLife > 0) this.captionLife -= dt;
    if (this.captionLife <= 0) {
      this.caption = null;
      this.hudDirty = true;
    }

    this.spectacle.tick(dt);

    this.fx.update(dt);
    for (const ship of this.battle.ships) {
      if (ship.sunk) {
        this.sinkTimers.set(ship.id, (this.sinkTimers.get(ship.id) ?? 0) + dt);
      }
    }

    this.handleClick();
    this.refreshHud();
    this.updateFireControl();
  }

  render(w: number, h: number): void {
    this.lastW = w;
    this.lastH = h;
    const gl = this.deps.gl;
    if (!gl || gl.lost) return;
    if (!this.scene) {
      this.scene = new WorldScene(gl);
      this.scene.setWind(this.battle.config.windDir);
      this.scene.onRebuild = () => {
        resetGpuCaches();
        this.registerShips(this.scene!);
      };
      this.scene.camera.setInterest(this.firstShipX, this.firstShipY, 2);
      this.scene.camera.targetX = this.firstShipX;
      this.scene.camera.targetZ = this.firstShipY;
      this.scene.camera.dolly = 760;
      this.registerShips(this.scene);
    }
    const scene = this.scene;
    scene.camera.resize(w, h);
    scene.controller.update(
      this.cameraPoints(),
      this.lastDt,
      this.deps.input,
      this.selectedPoint(),
    );
    scene.smoothPoses(this.lastDt);
    const entities: WorldEntity[] = [];
    for (const ship of this.battle.ships) {
      entities.push(
        shipToEntity(ship, {
          selected: this.selectedId === ship.id,
          time: this.time,
          windDir: this.battle.getWind().dir,
          sinkT: this.sinkTimers.get(ship.id) ?? 0,
        }),
      );
    }
    const sel = this.selectedId ? this.battle.ships.find((s) => s.id === this.selectedId) : null;
    if (sel && !sel.sunk) entities.push(ringEntity(sel));
    if (this.mode === 'captain') {
      const player = this.playerShip();
      if (player && !player.sunk) entities.push(ringEntity(player));
    }
    scene.setEntities(entities);
    scene.setParticles(this.fx.pool);
    scene.render(this.time);
    if (this.debug) this.probeFrame(scene);
  }

  /**
   * Render probe: read back a strip of pixels across the first ship's hull.
   * Hulls are wood-coloured (r > 60); water is near-black (r < 30). A
   * missing r means the entity pipeline drew nothing — a silent GPU bug
   * that gl.getError() can never catch. Reports entity and cull counts so
   * the failure point (data vs GPU) is identifiable from the phone.
   */
  private probeFrame(scene: WorldScene): void {
    const gl = this.deps.gl;
    if (!gl) return;
    const ship = this.battle.ships.find((x) => !x.sunk);
    if (!ship) {
      this.probe = 'no-ship';
      return;
    }
    projectToNdc(ndcScratch, vec3(ship.x, 6, ship.y), scene.camera.getViewProj());
    const px = ((ndcScratch[0]! + 1) * 0.5 * this.lastW) * gl.dpr;
    const py = ((1 - ndcScratch[1]!) * 0.5 * this.lastH) * gl.dpr;
    const bw = gl.gl.drawingBufferWidth;
    const bh = gl.gl.drawingBufferHeight;
    if (px < 0 || py < 0 || px >= bw || py >= bh) {
      this.probe = 'offscreen';
      return;
    }
    let maxR = 0;
    for (let k = -3; k <= 3; k++) {
      const x = Math.floor(px + k * 2 * gl.dpr);
      if (x < 0 || x >= bw) continue;
      gl.gl.readPixels(x, Math.floor(bh - py), 1, 1, gl.gl.RGBA, gl.gl.UNSIGNED_BYTE, this.probeBuf);
      maxR = Math.max(maxR, this.probeBuf[0]!);
    }
    this.probe = maxR < 40 ? 'EMPTY-SHIP!' : `ok(${maxR})`;
  }

  private registerShips(scene: WorldScene): void {
    const gl = this.deps.gl;
    if (!gl) return;
    for (const cls of HULL_CLASS_LIST) {
      scene.registerMesh(`ship:${cls}`, getShipMesh(gl, cls).mesh, getShipProgram(gl));
    }
    scene.registerMesh('ring', getRingMesh(gl), getRingProgram(gl), true);
  }

  private playerShip() {
    return this.battle.ships.find((x) => x.id === this.battle.config.playerShipId) ?? null;
  }

  private cameraPoints(): Array<{ x: number; y: number }> {
    const alive = this.battle.ships.filter((s) => !s.sunk);
    if (this.mode !== 'captain') return alive.map((s) => ({ x: s.x, y: s.y }));
    const player = this.playerShip();
    if (!player || player.sunk) return alive.map((s) => ({ x: s.x, y: s.y }));
    let nearest: ShipState | null = null;
    let best = Infinity;
    for (const s of alive) {
      if (s.id === player.id) continue;
      const d = Math.hypot(s.x - player.x, s.y - player.y);
      if (d < best) {
        best = d;
        nearest = s;
      }
    }
    const pts = [{ x: player.x, y: player.y }];
    if (nearest) pts.push({ x: nearest.x, y: nearest.y });
    return pts;
  }

  private applyPlayerInput(): void {
    const player = this.playerShip();
    if (!player || player.sunk || player.struck) return;
    if (this.wheel) player.rudder = this.wheel.value;
    if (this.sail) player.sailState = this.sail.value;
  }

  private fire(): void {
    if (this.paused || this.finished) return;
    const player = this.playerShip();
    if (!player || player.sunk || player.struck) return;
    const fired = this.battle.fireRequest(player.id);
    if (fired) this.fireCtl?.flashFired();
  }

  private updateFireControl(): void {
    if (!this.fireCtl) return;
    const player = this.playerShip();
    if (!player || player.sunk || player.struck) {
      this.fireCtl.el.classList.add('is-hidden');
      return;
    }
    this.fireCtl.el.classList.remove('is-hidden');
    const r = this.battle.shipReadiness(player.id);
    if (r) this.fireCtl.update(r.port, r.starboard);
  }

  private lastDt = 1 / 60;
  private lastW = 800;
  private lastH = 600;

  private selectedPoint(): { x: number; y: number } | null {
    if (this.selectedId === null) return null;
    const s = this.battle.ships.find((x) => x.id === this.selectedId);
    return s && !s.sunk ? { x: s.x, y: s.y } : null;
  }

  private handleKeys(): HudAction {
    const input = this.deps.input;
    if (input.wasKeyPressed('Digit1')) return { type: 'SPEED', speed: 1 };
    if (input.wasKeyPressed('Digit2')) return { type: 'SPEED', speed: 2 };
    if (input.wasKeyPressed('Digit4')) return { type: 'SPEED', speed: 4 };
    if (input.wasKeyPressed('KeyP')) return { type: 'PAUSE' };
    if (input.wasKeyPressed('KeyM')) return { type: 'MUTE' };
    if (input.wasKeyPressed('KeyR')) return { type: 'RESTART' };
    if (input.wasKeyPressed('KeyN')) return { type: 'REROLL' };
    if (this.mode === 'captain') {
      if (input.wasKeyPressed('Space') || input.wasKeyPressed('KeyF')) {
        this.fire();
        return { type: 'NONE' };
      }
      if (input.wasKeyPressed('ArrowRight') || input.wasKeyPressed('KeyD')) {
        this.wheel?.setValue(this.wheel.value + 0.2);
        return { type: 'NONE' };
      }
      if (input.wasKeyPressed('ArrowLeft') || input.wasKeyPressed('KeyA')) {
        this.wheel?.setValue(this.wheel.value - 0.2);
        return { type: 'NONE' };
      }
      if (input.wasKeyPressed('ArrowUp') || input.wasKeyPressed('KeyW')) {
        this.sail?.setValue(this.sail.value + 0.12);
        return { type: 'NONE' };
      }
      if (input.wasKeyPressed('ArrowDown') || input.wasKeyPressed('KeyS')) {
        this.sail?.setValue(this.sail.value - 0.12);
        return { type: 'NONE' };
      }
    }
    return { type: 'NONE' };
  }

  private pollHud(): HudAction {
    const a = this.pending;
    this.pending = { type: 'NONE' };
    return a;
  }

  private applyAction(action: HudAction): void {
    switch (action.type) {
      case 'NONE':
        return;
      case 'SPEED':
        this.speed = action.speed;
        this.hudDirty = true;
        this.deps.synth.play('ui');
        return;
      case 'PAUSE':
        this.paused = !this.paused;
        this.hudDirty = true;
        this.deps.synth.play('ui');
        return;
      case 'MUTE':
        this.deps.synth.toggleMute();
        this.hudDirty = true;
        return;
      case 'RESTART':
        this.deps.synth.play('ui');
        this.restart(this.seed);
        return;
      case 'REROLL':
        this.deps.synth.play('ui');
        this.restart(((this.seed * 2654435761) + 0x9e37) >>> 0);
        return;
      case 'LEAVE':
      case 'CONTINUE':
        this.leave();
        return;
    }
  }

  private restart(seed: number): void {
    this.deps.scenes.replace(new BattleScene(this.deps, this.launch, seed));
  }

  private leave(): void {
    this.deps.scenes.back();
  }

  private handleEvents(events: SimEvent[]): void {
    const names = new Map<string, string>();
    for (const s of this.battle.ships) names.set(s.id, s.name);
    const byId = (id?: string): string =>
      id != null ? (names.get(id) ?? 'A ship') : 'Someone';

    for (const ev of events) {
      this.spectacle.addEvent(ev);
      this.deps.synth.play(this.soundFor(ev));

      const line = eventLine(ev, byId);
      if (line) {
        this.caption = line;
        this.captionLife = 3.2;
        this.story.push(line);
        if (this.story.length > 3) this.story.shift();
        this.hudDirty = true;
      }

      const actor = this.battle.ships.find((s) => s.id === ev.actor);
      const target = ev.target ? this.battle.ships.find((s) => s.id === ev.target) : undefined;
      const cam = this.scene?.camera;
      if (!cam) continue;
      switch (ev.kind) {
        case 'broadside':
          if (actor) {
            const cls = HULL_CLASSES[actor.hullClass];
            this.fx.muzzleFlash(actor.x, actor.y, actor.heading, cls.length);
          }
          break;
        case 'broadsideHit':
          if (target) {
            this.fx.splinters(target.x, target.y);
            if (ev.detail === 'raked') {
              cam.setInterest(target.x, target.y, 1.4);
              cam.shake(7);
            } else {
              cam.shake(3.5);
            }
          }
          break;
        case 'fireStart':
          if (actor) this.fx.embers(actor.x, actor.y);
          break;
        case 'sink':
          if (actor) {
            this.fx.bubbles(actor.x, actor.y);
            cam.setInterest(actor.x, actor.y, 2.2);
            cam.shake(12);
          }
          break;
        case 'capture':
        case 'strike':
          cam.shake(5);
          break;
        default:
          break;
      }
    }
  }

  private soundFor(ev: SimEvent): SoundKind {
    switch (ev.kind) {
      case 'broadside':
        return 'cannon';
      case 'broadsideHit':
        return 'hit';
      case 'sailHit':
        return 'sail';
      case 'capture':
        return 'capture';
      case 'strike':
        return 'strike';
      case 'sink':
        return 'splash';
      case 'boardAttempt':
      case 'boardRepulse':
        return 'hit';
      default:
        return 'ui';
    }
  }

  private handleClick(): void {
    const input = this.deps.input;
    if (!input.pointer.clicked || !this.scene) return;
    if (this.scene.controller.consumeDragJustEnded()) return;
    const idx = pickShipScreen(
      this.scene.camera,
      this.battle.ships,
      input.pointer.x,
      input.pointer.y,
      this.lastW,
      this.lastH,
    );
    const id = idx >= 0 ? this.battle.ships[idx]?.id ?? null : null;
    if (id !== null && this.selectedId === id) this.selectedId = null;
    else this.selectedId = id;
    this.hudDirty = true;
  }

  private buildHud(): void {
    const { chrome } = this.deps;
    this.root = el('div', { className: 'battle-hud' });

    this.captionEl = el('div', { className: 'battle-caption', text: '' });
    this.root.append(this.captionEl);

    this.ferocityEl = el('div', { className: 'battle-ferocity' });
    this.ferocityEl.innerHTML =
      '<span class="chip-label">SPECTACLE</span><span class="chip-track"><i class="chip-fill"></i></span>';
    this.root.append(this.ferocityEl);

    const windEl = el('div', { className: 'battle-wind' });
    windEl.innerHTML =
      '<span class="chip-arrow" aria-hidden="true">➤</span><span class="chip-wind-label">Wind</span>';
    this.root.append(windEl);
    this.windEl = windEl;

    if (this.debug) {
      this.debugChip = el('div', { className: 'debug-chip', text: '' });
      this.root.append(this.debugChip);
    }

    if (this.mode === 'captain') {
      this.wheel = new WheelControl(() => {});
      this.sail = new SailControl(() => {});
      this.fireCtl = new FireControl(() => this.fire());
      this.wheel.el.classList.add('is-captain');
      this.sail.el.classList.add('is-captain');
      this.root.append(this.wheel.el, this.sail.el, this.fireCtl.el);
    }

    const bar = el('div', { className: 'hud-bar' });
    const left = el('div', { className: 'hud-group' });
    left.append(this.speedBtn(1), this.speedBtn(2), this.speedBtn(4));
    bar.append(left);
    const right = el('div', { className: 'hud-group' });
    right.append(
      this.hudBtn('Pause', 'P', () => this.emit({ type: 'PAUSE' })),
      this.hudBtn('Mute', 'M', () => this.emit({ type: 'MUTE' })),
      this.hudBtn('Restart', 'R', () => this.emit({ type: 'RESTART' })),
      this.hudBtn('Reroll', 'N', () => this.emit({ type: 'REROLL' })),
      this.hudBtn('Leave', 'Esc', () => this.emit({ type: 'LEAVE' })),
    );
    bar.append(right);
    this.root.append(bar);

    this.inspectEl = el('div', { className: 'inspect-card is-hidden' });
    this.root.append(this.inspectEl);

    this.bannerEl = el('div', { className: 'result-banner is-hidden' });
    this.root.append(this.bannerEl);

    chrome.append(this.root);
    this.hudDirty = true;
  }

  private speedBtn(speed: number): HTMLButtonElement {
    const b = el('button', {
      className: `hud-btn${this.speed === speed ? ' is-active' : ''}`,
      text: `${speed}×`,
      attrs: { 'data-speed': String(speed) },
    });
    b.addEventListener('click', () => this.emit({ type: 'SPEED', speed }));
    return b;
  }

  private hudBtn(label: string, key: string, onClick: () => void): HTMLButtonElement {
    const b = el('button', {
      className: 'hud-btn',
      html: `${label}<span class="hud-key">${key}</span>`,
    });
    b.addEventListener('click', onClick);
    return b;
  }

  private emit(action: HudAction): void {
    this.deps.synth.play('ui');
    this.pending = action;
  }

  private refreshHud(): void {
    if (!this.root) return;
    if (!this.hudDirty && this.hudTick % 20 !== 0) return;

    if (this.captionEl) {
      const text = this.caption ?? (this.paused ? 'Paused' : '');
      if (this.captionEl.textContent !== text) this.captionEl.textContent = text;
    }

    if (this.ferocityEl) {
      const ratio = Math.min(1, this.spectacle.score / 300);
      const fill = this.ferocityEl.querySelector<HTMLElement>('.chip-fill');
      if (fill) {
        fill.style.width = `${Math.round(ratio * 100)}%`;
        fill.style.background = ratio > 0.8 ? '#c06655' : '#d4a94f';
      }
    }

    if (this.windEl) {
      const arrow = this.windEl.querySelector<HTMLElement>('.chip-arrow');
      const wind = this.battle.getWind();
      if (arrow) {
        // '➤' points east (0 rad); sim angles run counter-clockwise from
        // +x, so a clockwise CSS rotation of -dir shows the true bearing.
        arrow.style.transform = `rotate(${(-wind.dir * 180) / Math.PI}deg)`;
      }
      const label = this.windEl.querySelector<HTMLElement>('.chip-wind-label');
      if (label) {
        label.textContent = `Wind ${Math.round(wind.strength * 100)}%`;
      }
    }

    const speedBtns = this.root.querySelectorAll<HTMLButtonElement>('[data-speed]');
    speedBtns.forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.speed) === this.speed);
    });

    if (this.debugChip && this.hudTick % 40 === 0) {
      const gl = this.deps.gl;
      let info = 'no-gl';
      if (gl && !gl.lost) {
        const err = gl.gl.getError();
        const renderer = String(gl.gl.getParameter(gl.gl.RENDERER) ?? '?');
        const cam = this.scene?.camera;
        info = `${renderer} · err:${err} · ${this.lastW}×${this.lastH} · dolly:${cam ? Math.round(cam.dolly) : 0} · ent:${this.battle.ships.length} · probe:${this.probe}`;
      } else if (gl?.lost) {
        info = 'CONTEXT LOST';
      }
      this.debugChip.textContent = info;
    }

    if (this.inspectEl) {
      const ship = this.selectedId
        ? this.battle.ships.find((s) => s.id === this.selectedId)
        : null;
      if (ship && !ship.sunk) {
        this.inspectEl.classList.remove('is-hidden');
        this.inspectEl.innerHTML = this.inspectHtml(ship);
      } else {
        this.inspectEl.classList.add('is-hidden');
      }
    }

    this.hudDirty = false;
  }

  private inspectHtml(ship: ShipState): string {
    const cls = HULL_CLASSES[ship.hullClass];
    const status = ship.grappledWith
      ? 'Boarded'
      : ship.onFire
        ? 'On fire'
        : ship.struck
          ? 'Struck'
          : ship.intention;
    const bars: Array<[string, number]> = [
      ['Hull', ship.hull / ship.maxHull],
      ['Sails', ship.sails / ship.maxSails],
      ['Crew', ship.crew / ship.maxCrew],
      ['Morale', Math.max(0, ship.morale / ship.maxMorale)],
    ];
    const barsHtml = bars
      .map(
        ([label, ratio]) =>
          `<div class="ib-row"><span>${label}</span><span class="ib-bar"><i style="width:${Math.round(ratio * 100)}%"></i></span></div>`,
      )
      .join('');
    return `
      <div class="ib-title">${ship.name} <span class="ib-class">${cls.name}</span></div>
      <div class="ib-status">${status}</div>
      ${barsHtml}
      <div class="ib-cap">${ship.captain.skill} skill · ${ship.captain.bravery} nerve · ${ship.captain.focus} focus</div>
    `;
  }

  private showBanner(): void {
    if (!this.bannerEl || !this.result) return;
    const win = this.result.winner === 0;
    const title = this.result.winner === 'DRAW' ? 'DRAW' : win ? 'VICTORY' : 'DEFEAT';
    const lines: string[] = [];
    if (this.result.endReason === 'escape') {
      const evader = this.result.escaped?.join(', ') ?? 'The ship';
      lines.push(`The chase broke — ${evader} slipped away with the wind.`);
    }
    if (this.result.captured.length)
      lines.push(`Captured: ${this.result.captured.join(', ')}`);
    if (this.result.sunk.length) lines.push(`Sunk: ${this.result.sunk.join(', ')}`);
    const b = this.bannerEl;
    b.classList.remove('is-hidden');
    b.innerHTML = `
      <div class="result-title ${win ? 'is-win' : ''}">${title}</div>
      <div class="result-lines">${lines.map((l) => `<div>${l}</div>`).join('')}</div>
      <button class="cta">Continue</button>
    `;
    b.querySelector('button')?.addEventListener('click', () => {
      this.deps.synth.play('ui');
      this.leave();
    });
  }
}

/** Nearest ship to a screen point, via projection (picking). */
function pickShipScreen(
  cam: Camera3d,
  ships: ShipState[],
  sx: number,
  sy: number,
  cssW: number,
  cssH: number,
  radius = 34,
): number {
  let best = -1;
  let bestD = radius * radius;
  for (let i = 0; i < ships.length; i++) {
    const s = ships[i]!;
    if (s.sunk) continue;
    projectToNdc(ndcScratch, vec3(s.x, 6, s.y), cam.getViewProj());
    const px = (ndcScratch[0]! + 1) * 0.5 * cssW;
    const py = (1 - ndcScratch[1]!) * 0.5 * cssH;
    const d = (px - sx) * (px - sx) + (py - sy) * (py - sy);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const ndcScratch = vec3();

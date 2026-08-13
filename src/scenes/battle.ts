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
import { Battle } from '../sim/battle/battle';
import type { BattleResult, ShipState } from '../sim/battle/types';
import { SeededRng } from '../sim/rng';
import type { SimEvent } from '../sim/events';
import { SpectacleMeter } from '../director/spectacle';
import { eventLine } from '../director/story';
import { DirectorCamera } from '../present/camera';
import { drawOcean } from '../present/ocean';
import { drawShipWorld } from '../present/ship';
import { HULL_CLASSES } from '../content/ships';
import type { SkirmishPreset } from '../content/skirmish';
import { makeSkirmishConfig } from '../content/skirmish';
import { el } from '../shell/ui/dom';

export interface BattleDeps {
  chrome: HTMLElement;
  scenes: SceneManager;
  input: Input;
  synth: Synth;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: 'flash' | 'smoke' | 'splinter' | 'ember' | 'bubble' | 'ring';
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
  private battle: Battle;
  private readonly preset: SkirmishPreset;
  private readonly seed: number;
  private speed = 1;
  private paused = false;
  private finished = false;
  private simAcc = 0;
  private time = 0;
  private shake = 0;
  private debugArcs = false;
  private selectedId: string | null = null;
  private caption: string | null = null;
  private captionLife = 0;
  private story: string[] = [];
  private spectacle = new SpectacleMeter();
  private camera = new DirectorCamera();
  private fxRng: SeededRng;
  private particles: Particle[] = [];
  private wakes = new Map<string, Array<{ x: number; y: number }>>();
  private sinkTimers = new Map<string, number>();
  private result: BattleResult | null = null;
  private pending: HudAction = { type: 'NONE' };
  private hudDirty = true;
  private hudTick = 0;
  private lastW = 0;
  private lastH = 0;
  private root: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private ferocityEl: HTMLElement | null = null;
  private inspectEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;

  constructor(
    private readonly deps: BattleDeps,
    preset: SkirmishPreset,
    seed: number,
  ) {
    this.preset = preset;
    this.seed = seed;
    this.battle = new Battle(makeSkirmishConfig(preset, seed));
    this.fxRng = new SeededRng(seed).split(0xfeed);
    this.camera.setInterest(this.battle.ships[0]!.x, this.battle.ships[0]!.y, 2);
    this.camera.zoom = 0.8;
    this.camera.x = this.battle.ships[0]!.x;
    this.camera.y = this.battle.ships[0]!.y;
  }

  enter(): void {
    this.deps.synth.ensure();
    this.buildHud();
  }

  exit(): void {
    if (this.root) this.root.remove();
    this.root = null;
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
    this.hudTick++;

    const key = this.handleKeys();
    if (key.type !== 'NONE') this.applyAction(key);
    const hud = this.pollHud();
    if (hud.type !== 'NONE') this.applyAction(hud);

    if (!this.paused && !this.finished) {
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
    this.camera.update(
      this.battle.ships
        .filter((s) => !s.sunk)
        .map((s) => ({ x: s.x, y: s.y })),
      dt,
      this.deps.input,
    );

    for (const ship of this.battle.ships) {
      const wake = this.wakes.get(ship.id) ?? [];
      wake.push({ x: ship.x, y: ship.y });
      if (wake.length > 34) wake.shift();
      this.wakes.set(ship.id, wake);
      if (ship.sunk) {
        this.sinkTimers.set(ship.id, (this.sinkTimers.get(ship.id) ?? 0) + dt);
      }
    }

    this.updateParticles(dt);
    this.handleClick();
    this.refreshHud();
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (w !== this.lastW || h !== this.lastH) {
      this.lastW = w;
      this.lastH = h;
      this.camera.resize(w, h);
    }
    drawOcean(ctx, w, h, this.camera, this.time);

    for (const ship of this.battle.ships) {
      this.drawWake(ctx, ship.id);
    }

    for (const ship of this.battle.ships) {
      drawShipWorld(ctx, this.camera, ship, this.battle.config.windDir, {
        selected: this.selectedId === ship.id,
        debugArcs: this.debugArcs,
        showBars: this.camera.zoom > 0.42,
        sinkT: this.sinkTimers.get(ship.id) ?? 0,
        t: this.time,
      });
    }

    this.drawParticles(ctx);
    this.drawWindIndicator(ctx, w);
    this.drawFerocity(ctx, w);
  }

  private handleKeys(): HudAction {
    const input = this.deps.input;
    if (input.wasKeyPressed('Digit1')) return { type: 'SPEED', speed: 1 };
    if (input.wasKeyPressed('Digit2')) return { type: 'SPEED', speed: 2 };
    if (input.wasKeyPressed('Digit4')) return { type: 'SPEED', speed: 4 };
    if (input.wasKeyPressed('KeyP')) return { type: 'PAUSE' };
    if (input.wasKeyPressed('KeyM')) return { type: 'MUTE' };
    if (input.wasKeyPressed('KeyD')) return { type: 'DEBUG' };
    if (input.wasKeyPressed('KeyR')) return { type: 'RESTART' };
    if (input.wasKeyPressed('KeyN')) return { type: 'REROLL' };
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
      case 'DEBUG':
        this.debugArcs = !this.debugArcs;
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
    this.deps.scenes.replace(new BattleScene(this.deps, this.preset, seed));
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
      switch (ev.kind) {
        case 'broadside':
          if (actor) this.muzzleFlash(actor);
          break;
        case 'broadsideHit':
          if (target) {
            this.splinters(target);
            if (ev.detail === 'raked') {
              this.camera.setInterest(target.x, target.y, 1.4);
              this.shake = Math.max(this.shake, 7);
            } else {
              this.shake = Math.max(this.shake, 3.5);
            }
          }
          break;
        case 'fireStart':
          if (actor) this.embers(actor);
          break;
        case 'sink':
          if (actor) {
            this.bubbles(actor);
            this.camera.setInterest(actor.x, actor.y, 2.2);
            this.shake = Math.max(this.shake, 12);
          }
          break;
        case 'capture':
        case 'strike':
          this.shake = Math.max(this.shake, 5);
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

  private muzzleFlash(ship: ShipState): void {
    const cls = HULL_CLASSES[ship.hullClass];
    const side = Math.random() < 0.5 ? -1 : 1;
    const lx = Math.cos(ship.heading) * cls.length * 0.5;
    const ly = Math.sin(ship.heading) * cls.length * 0.5;
    const px = -Math.sin(ship.heading) * side;
    const py = Math.cos(ship.heading) * side;
    const x = ship.x + lx + px * cls.length * 0.28;
    const y = ship.y + ly + py * cls.length * 0.28;
    this.spawn({ x, y, vx: 0, vy: 0, life: 0.22, maxLife: 0.22, size: 26, kind: 'flash' });
    for (let i = 0; i < 3; i++) {
      this.spawn({
        x,
        y,
        vx: this.fxRng.range(-24, 24),
        vy: this.fxRng.range(-24, 24),
        life: this.fxRng.range(0.8, 1.6),
        maxLife: 1.6,
        size: this.fxRng.range(10, 20),
        kind: 'smoke',
      });
    }
  }

  private splinters(ship: ShipState): void {
    for (let i = 0; i < 8; i++) {
      this.spawn({
        x: ship.x,
        y: ship.y,
        vx: this.fxRng.range(-70, 70),
        vy: this.fxRng.range(-70, 70),
        life: this.fxRng.range(0.3, 0.7),
        maxLife: 0.7,
        size: 2.5,
        kind: 'splinter',
      });
    }
  }

  private embers(ship: ShipState): void {
    for (let i = 0; i < 6; i++) {
      this.spawn({
        x: ship.x + this.fxRng.range(-30, 30),
        y: ship.y + this.fxRng.range(-30, 30),
        vx: this.fxRng.range(-8, 8),
        vy: this.fxRng.range(-30, -8),
        life: this.fxRng.range(0.6, 1.4),
        maxLife: 1.4,
        size: 3,
        kind: 'ember',
      });
    }
  }

  private bubbles(ship: ShipState): void {
    for (let i = 0; i < 12; i++) {
      this.spawn({
        x: ship.x + this.fxRng.range(-40, 40),
        y: ship.y + this.fxRng.range(-40, 40),
        vx: this.fxRng.range(-12, 12),
        vy: this.fxRng.range(-40, -10),
        life: this.fxRng.range(0.8, 1.8),
        maxLife: 1.8,
        size: this.fxRng.range(2, 5),
        kind: 'bubble',
      });
    }
    this.spawn({
      x: ship.x,
      y: ship.y,
      life: 1.2,
      maxLife: 1.2,
      size: 30,
      vx: 0,
      vy: 0,
      kind: 'ring',
    });
  }

  private spawn(p: Particle): void {
    this.particles.push(p);
    if (this.particles.length > 220) this.particles.shift();
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += 6 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      const s = this.camera.worldToScreen(p.x, p.y);
      switch (p.kind) {
        case 'flash': {
          ctx.fillStyle = `rgba(255, 226, 150, ${a})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * this.camera.zoom * (1.6 - a * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'smoke':
          ctx.fillStyle = `rgba(60, 62, 66, ${a * 0.35})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * this.camera.zoom, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'splinter':
          ctx.strokeStyle = `rgba(120, 80, 40, ${a})`;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x - p.vx * 0.04 * this.camera.zoom, s.y - p.vy * 0.04 * this.camera.zoom);
          ctx.stroke();
          break;
        case 'ember':
          ctx.fillStyle = `rgba(255, ${140 + Math.floor(a * 100)}, 40, ${a})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * this.camera.zoom, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'bubble':
          ctx.strokeStyle = `rgba(210, 235, 240, ${a * 0.7})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * this.camera.zoom, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'ring':
          ctx.strokeStyle = `rgba(220, 235, 238, ${a * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(s.x, s.y, p.size * this.camera.zoom * (1.6 - a), 0, Math.PI * 2);
          ctx.stroke();
          break;
      }
    }
  }

  private drawWake(ctx: CanvasRenderingContext2D, shipId: string): void {
    const wake = this.wakes.get(shipId);
    if (!wake || wake.length < 2) return;
    ctx.lineWidth = Math.max(1, 1.6 * this.camera.zoom);
    for (let i = 1; i < wake.length; i++) {
      const a = (i / wake.length) * 0.22;
      const p0 = this.camera.worldToScreen(wake[i - 1]!.x, wake[i - 1]!.y);
      const p1 = this.camera.worldToScreen(wake[i]!.x, wake[i]!.y);
      ctx.strokeStyle = `rgba(225, 242, 244, ${a})`;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }

  private drawWindIndicator(ctx: CanvasRenderingContext2D, w: number): void {
    const x = 36;
    const y = 34;
    const dir = this.battle.config.windDir;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(dir);
    ctx.strokeStyle = 'rgba(240, 240, 235, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(12, 0);
    ctx.stroke();
    ctx.fillStyle = 'rgba(240, 240, 235, 0.75)';
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(3, -6);
    ctx.lineTo(3, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.font = '11px var(--font-ui)';
    ctx.fillStyle = 'rgba(240, 240, 235, 0.6)';
    ctx.fillText(`Wind ${Math.round(this.battle.config.windStrength * 100)}%`, x - 24, y + 20);
    void w;
  }

  private drawFerocity(ctx: CanvasRenderingContext2D, w: number): void {
    const x = 14;
    const y = 62;
    const ratio = Math.min(1, this.spectacle.score / 300);
    ctx.fillStyle = 'rgba(10, 16, 20, 0.65)';
    ctx.fillRect(x, y, 96, 8);
    ctx.fillStyle = ratio > 0.8 ? '#c06655' : '#d4a94f';
    ctx.fillRect(x, y, 96 * ratio, 8);
    ctx.font = '11px var(--font-ui)';
    ctx.fillStyle = 'rgba(240, 240, 235, 0.6)';
    ctx.fillText('SPECTACLE', x, y - 4);
    void w;
  }

  private handleClick(): void {
    const input = this.deps.input;
    if (!input.pointer.clicked) return;
    if (this.camera.consumeDragJustEnded()) return;
    let bestId: string | null = null;
    let bestD = 30;
    for (const ship of this.battle.ships) {
      if (ship.sunk) continue;
      const s = this.camera.worldToScreen(ship.x, ship.y);
      const d = Math.hypot(input.pointer.x - s.x, input.pointer.y - s.y);
      if (d < bestD) {
        bestD = d;
        bestId = ship.id;
      }
    }
    if (bestId !== null && this.selectedId === bestId) this.selectedId = null;
    else this.selectedId = bestId;
    this.hudDirty = true;
  }

  private buildHud(): void {
    const { chrome } = this.deps;
    this.root = el('div', { className: 'battle-hud' });

    this.captionEl = el('div', { className: 'battle-caption', text: '' });
    this.root.append(this.captionEl);

    this.ferocityEl = el('div', { className: 'battle-ferocity' });

    const bar = el('div', { className: 'hud-bar' });
    const left = el('div', { className: 'hud-group' });
    left.append(this.speedBtn(1), this.speedBtn(2), this.speedBtn(4));
    bar.append(left);
    const right = el('div', { className: 'hud-group' });
    right.append(
      this.hudBtn('Pause', 'P', () => this.emit({ type: 'PAUSE' })),
      this.hudBtn('Mute', 'M', () => this.emit({ type: 'MUTE' })),
      this.hudBtn('Arcs', 'D', () => this.emit({ type: 'DEBUG' })),
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
      this.ferocityEl.textContent = `Spectacle ${Math.round(this.spectacle.score)}`;
    }

    const speedBtns = this.root.querySelectorAll<HTMLButtonElement>('[data-speed]');
    speedBtns.forEach((b) => {
      b.classList.toggle('is-active', Number(b.dataset.speed) === this.speed);
    });

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

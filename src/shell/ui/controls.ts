/**
 * Helm controls — the ship's wheel, the sail slider, and the fire button.
 *
 * The wheel is the shallow top arc of a HUGE wheel whose centre sits far
 * below the screen — it spans the whole bottom edge. Dragging (or scrolling)
 * rotates the spokes and grips exactly like a real helm: a big wheel turns
 * little for full lock, so a complete rudder is a modest sweep of the
 * visible spokes. The wheel stays where you leave it — no spring.
 *
 * Drawn from the anatomy of a real ship's wheel (teak/mahogany):
 *  - the rim is THREE stacked felloes — the after (rearmost), the middle
 *    (the layer each spoke runs through) and the facing (toward the
 *    helmsman) — each ring catching its own light, with dark seams;
 *  - baluster-shaped spokes (turned, swelling toward the rim);
 *  - the spokes protrude past the rim as handles, capped with turned
 *    elliptical knobs;
 *  - the king spoke carries banded grips a helmsman feels in the dark to
 *    find dead centre.
 *
 * The cast shadow is a SEPARATE layer, driven by the sun relative to the
 * ship's heading (setCast) — the plumbing is real, the effect stays simple.
 * Sail slider: vertical, top = full sail.
 */

const WHEEL_MAX_DEG = 55;
const WHEEL_CX = 400;
const WHEEL_CY = 700;
const WHEEL_SPOKES = 12;

export class WheelControl {
  readonly el: HTMLElement;
  value = 0; // -1..1 → rudder
  private spin: SVGElement | null = null;
  private shadow: SVGElement | null = null;
  private dragging = false;
  private readonly onChange: (v: number) => void;

  constructor(onChange: (v: number) => void) {
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'wheel-ctl';
    // The el is the wide drag surface (full deflection at the screen edge);
    // the graphic is the shallow arc of the huge wheel, centred inside it.
    this.el.innerHTML = `
      <div class="wheel-graphic">
        <svg viewBox="0 -40 800 196" aria-hidden="true">
          <defs>
            <radialGradient id="wheelRimWood" gradientUnits="userSpaceOnUse" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="692">
              <stop offset="0.925" stop-color="#241708"/>
              <stop offset="0.936" stop-color="#3f2a15"/>
              <stop offset="0.954" stop-color="#6a4522"/>
              <stop offset="0.965" stop-color="#2a1c0e"/>
              <stop offset="0.975" stop-color="#5a3a1c"/>
              <stop offset="0.985" stop-color="#8a5a2d"/>
              <stop offset="0.994" stop-color="#6a4522"/>
              <stop offset="1" stop-color="#241708"/>
            </radialGradient>
            <radialGradient id="wheelFarShade" gradientUnits="userSpaceOnUse" cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="692">
              <stop offset="0.9" stop-color="#000" stop-opacity="0"/>
              <stop offset="1" stop-color="#000" stop-opacity="0.42"/>
            </radialGradient>
            <radialGradient id="wheelCastShadow" gradientUnits="userSpaceOnUse" cx="${WHEEL_CX}" cy="134" r="300">
              <stop offset="0" stop-color="#000" stop-opacity="0.34"/>
              <stop offset="0.6" stop-color="#000" stop-opacity="0.16"/>
              <stop offset="0.85" stop-color="#000" stop-opacity="0.07"/>
              <stop offset="1" stop-color="#000" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <g class="wheel-shadow" data-wheel-shadow>
            <ellipse cx="${WHEEL_CX}" cy="134" rx="330" ry="16" class="wheel-cast"/>
          </g>
          <g class="wheel-spin">
            <g class="wheel-spokes">${this.spokes()}</g>
            <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="687" class="wheel-felloe-after"/>
            <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="671" class="wheel-felloe-middle"/>
            <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="650" class="wheel-felloe-facing"/>
            <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="692" class="wheel-far-shade"/>
            <g class="wheel-handles">${this.handles()}</g>
          </g>
          <polygon class="wheel-pointer" points="400,0 389,16 411,16"/>
          <line class="wheel-pointer-line" x1="400" y1="16" x2="400" y2="46"/>
        </svg>
      </div>`;
    this.spin = this.el.querySelector('.wheel-spin');
    this.shadow = this.el.querySelector('[data-wheel-shadow]');
    this.bind();
  }

  /**
   * The fake cast shadow, driven by the sun in the wheel's frame.
   * relAzimuth: the sun's bearing relative to the ship's heading (0 =
   * dead ahead). elevation: the sun's height above the deck. A low sun
   * throws a long shadow; a side sun pushes it across the deck.
   */
  setCast(relAzimuth: number, elevation: number): void {
    if (!this.shadow) return;
    const sx = Math.sin(relAzimuth) * 30;
    const sy = 10 + Math.max(0, 1 - elevation * 1.6) * 22;
    this.shadow.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
  }

  /** Baluster-shaped spokes, swelling toward the rim, mortised through it. */
  private spokes(): string {
    const out: string[] = [];
    for (let i = 0; i < WHEEL_SPOKES; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / WHEEL_SPOKES;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Turned profile: a shoulder under the rim, a waist, then widening
      // toward the hub (where it leaves the view).
      const profile: Array<[number, number]> = [
        [654, 7.5],
        [672, 8.6],
        [686, 9.6],
        [692, 8.0],
        [650, 6.5],
        [610, 5.6],
        [556, 7.0],
      ];
      const pt = (r: number, w: number): string =>
        `${(WHEEL_CX + ca * r - sa * w).toFixed(1)},${(WHEEL_CY - sa * r - ca * w).toFixed(1)}`;
      const fwd = profile.map(([r, w]) => pt(r, w));
      const back = [...profile].reverse().map(([r, w]) => pt(r, -w));
      const dark = [...profile]
        .slice(0, 4)
        .map(([r, w]) => pt(r, w + 1.4))
        .join(' ')
        .concat(
          ' ',
          [...profile].slice(0, 4).reverse().map(([r, w]) => pt(r, -w + 1.4)).join(' '),
        );
      out.push(
        `<polygon class="wheel-spoke-shadow" points="${dark}"/>`,
        `<polygon class="wheel-spoke" points="${fwd.join(' ')} ${back.join(' ')}"/>`,
      );
    }
    return out.join('');
  }

  /**
   * The spokes protrude past the rim as handles. Each handle is ONE line:
   * a droplet that pinches just past the rim, swells as it leaves the
   * centre, then rounds off — the silhouette of a turned wooden knob.
   */
  private handles(): string {
    const out: string[] = [];
    for (let i = 0; i < WHEEL_SPOKES; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / WHEEL_SPOKES;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Align the droplet's axis with the spoke's outward direction.
      const deg = (Math.atan2(-sa, ca) * 180) / Math.PI;
      // Seated inside the after felloe so the knob grows out of the wood.
      const hx = (WHEEL_CX + ca * 711).toFixed(1);
      const hy = (WHEEL_CY - sa * 711).toFixed(1);
      const king = i === 0 ? ' wheel-king' : '';
      out.push(
        `<path class="wheel-handle${king}" transform="rotate(${deg.toFixed(1)} ${hx} ${hy}) translate(${hx} ${hy})" d="M0,-3.4 C4,-3.3 7,-2.8 11,-4.4 C17,-6.4 26,-7.2 36,-4.4 C43,-2.6 45.5,-1.2 46,0 C45.5,1.2 43,2.6 36,4.4 C26,7.2 17,6.4 11,4.4 C7,2.8 4,3.3 0,3.4 Z"/>`,
      );
    }
    return out.join('');
  }

  private bind(): void {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.fromX(e.clientX);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.fromX(e.clientX);
    });
    el.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    el.addEventListener('pointercancel', () => {
      this.dragging = false;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setValue(this.value + (e.deltaY < 0 ? 0.15 : -0.15));
    });
  }

  private fromX(clientX: number): void {
    const r = this.el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    this.setValue(frac * 2 - 1);
  }

  setValue(v: number): void {
    this.value = clamp(v, -1, 1);
    if (this.spin) {
      this.spin.style.transform = `rotate(${(this.value * WHEEL_MAX_DEG).toFixed(1)}deg)`;
    }
    this.onChange(this.value);
  }
}

export class SailControl {
  readonly el: HTMLElement;
  value = 1; // 0..1 → sailState
  private thumb: HTMLElement | null = null;
  private dragging = false;
  private readonly onChange: (v: number) => void;

  constructor(onChange: (v: number) => void) {
    this.onChange = onChange;
    this.el = document.createElement('div');
    this.el.className = 'sail-ctl';
    this.el.innerHTML = `
      <div class="sail-track"><div class="sail-thumb"></div></div>
      <div class="sail-label">SAILS</div>`;
    this.thumb = this.el.querySelector('.sail-thumb');
    this.bind();
  }

  private bind(): void {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.fromY(e.clientY);
    });
    el.addEventListener('pointermove', (e) => {
      if (this.dragging) this.fromY(e.clientY);
    });
    el.addEventListener('pointerup', () => {
      this.dragging = false;
    });
    el.addEventListener('pointercancel', () => {
      this.dragging = false;
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.setValue(this.value + (e.deltaY < 0 ? 0.1 : -0.1));
    });
  }

  private fromY(clientY: number): void {
    const r = this.el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / Math.max(1, r.height)));
    this.setValue(1 - frac);
  }

  setValue(v: number): void {
    this.value = clamp(v, 0, 1);
    if (this.thumb) {
      this.thumb.style.top = `${((1 - this.value) * 100).toFixed(1)}%`;
    }
    this.onChange(this.value);
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * FireControl — the broadside trigger with a per-side readiness gauge.
 * Port readiness fills the left arc, starboard the right. A side is "ready"
 * when its guns are loaded AND an enemy sits in that arc; the button then
 * pulses red to invite the press. Pressing fires every qualified side —
 * the click always plays, but the red flash only lands when shots went off.
 * (Guns within the early-press grace still fire on a slightly-early press.)
 */

export interface FireReadiness {
  loadedFrac: number;
  hasTarget: boolean;
}

export class FireControl {
  readonly el: HTMLElement;
  private portFill: SVGPathElement | null = null;
  private starFill: SVGPathElement | null = null;
  private readonly onFire: () => void;

  constructor(onFire: () => void) {
    this.onFire = onFire;
    this.el = document.createElement('div');
    this.el.className = 'fire-ctl';
    this.el.innerHTML = `
      <svg viewBox="0 0 220 120" aria-hidden="true">
        <path class="fire-gauge" data-side="port" d="${arcPath(110, 60, 50, 155, 205)}"/>
        <path class="fire-gauge" data-side="star" d="${arcPath(110, 60, 50, -25, 25)}"/>
        <circle class="fire-btn" cx="110" cy="60" r="42"/>
        <text x="110" y="67" class="fire-label" text-anchor="middle">FIRE</text>
      </svg>`;
    this.portFill = this.el.querySelector('[data-side="port"]');
    this.starFill = this.el.querySelector('[data-side="star"]');
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onFire();
    });
  }

  /** Fraction of the gauge arc to show (0..1). */
  private static arcLen(spanDeg: number): number {
    return ((spanDeg * Math.PI) / 180) * 50;
  }

  update(port: FireReadiness, star: FireReadiness): void {
    const set = (fill: SVGPathElement | null, r: FireReadiness, span: number) => {
      if (!fill) return;
      const len = FireControl.arcLen(span);
      fill.style.strokeDasharray = `${(len * r.loadedFrac).toFixed(1)} ${len.toFixed(1)}`;
      fill.classList.toggle('is-ready', r.loadedFrac >= 0.99 && r.hasTarget);
      fill.classList.toggle('is-armed', r.loadedFrac > 0 && r.hasTarget);
      fill.classList.toggle('is-dark', !r.hasTarget);
    };
    set(this.portFill, port, 50);
    set(this.starFill, star, 50);
    const anyReady =
      (port.loadedFrac >= 0.99 && port.hasTarget) ||
      (star.loadedFrac >= 0.99 && star.hasTarget);
    this.el.classList.toggle('is-ready', anyReady);
  }

  /** One-shot red flash — call only when a press actually fired guns. */
  flashFired(): void {
    this.el.classList.remove('is-flash');
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add('is-flash');
    window.setTimeout(() => this.el.classList.remove('is-flash'), 380);
  }
}

/** SVG arc path (degrees, y-down, sweep 1). */
function arcPath(cx: number, cy: number, r: number, a1: number, a2: number): string {
  const rad = (a: number) => (a * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const x2 = cx + r * Math.cos(rad(a2));
  const y2 = cy + r * Math.sin(rad(a2));
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

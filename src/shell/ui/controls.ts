/**
 * Helm controls — the ship's wheel, the sail slider, and the fire button.
 *
 * The wheel is the shallow top arc of a HUGE wheel whose centre sits far
 * below the screen — it spans the whole bottom edge. Dragging (or scrolling)
 * rotates the spokes and pegs exactly like a real helm: a big wheel turns
 * little for full lock, so a complete rudder is a modest sweep of the
 * visible spokes. The wheel stays where you leave it — no spring.
 * Sail slider: vertical, top = full sail.
 */

const WHEEL_MAX_DEG = 55;
const WHEEL_CX = 400;
const WHEEL_CY = 700;
const WHEEL_R = 680;

export class WheelControl {
  readonly el: HTMLElement;
  value = 0; // -1..1 → rudder
  private spin: SVGElement | null = null;
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
        <svg viewBox="0 0 800 130" aria-hidden="true">
          <g class="wheel-spin">
            <circle cx="${WHEEL_CX}" cy="${WHEEL_CY}" r="${WHEEL_R + 18}" class="wheel-rim"/>
            ${this.spokes()}
          </g>
          <polygon class="wheel-pointer" points="400,4 391,18 409,18"/>
        </svg>
      </div>`;
    this.spin = this.el.querySelector('.wheel-spin');
    this.bind();
  }

  private spokes(): string {
    const out: string[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const x = WHEEL_CX + Math.cos(a) * WHEEL_R;
      const y = WHEEL_CY - Math.sin(a) * WHEEL_R;
      out.push(
        `<line class="wheel-spoke" x1="${WHEEL_CX}" y1="${WHEEL_CY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`,
        `<circle class="wheel-peg" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"/>`,
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

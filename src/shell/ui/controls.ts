/**
 * Helm controls — the ship's wheel and the sail slider.
 *
 * The wheel is a full 8-spoke wheel drawn in SVG and clipped to its top arc,
 * so dragging (or scrolling) spins the spokes exactly like a real helm viewed
 * from behind. The wheel stays where you leave it — a ship's wheel has no
 * spring. Sail slider: vertical, top = full sail.
 */

const WHEEL_MAX_DEG = 100;

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
    this.el.innerHTML = `
      <svg viewBox="0 0 240 150" aria-hidden="true">
        <g class="wheel-spin">
          <circle cx="120" cy="115" r="98" class="wheel-rim"/>
          <circle cx="120" cy="115" r="13" class="wheel-hub"/>
          ${this.spokes()}
        </g>
        <polygon class="wheel-pointer" points="120,4 113,16 127,16"/>
      </svg>`;
    this.spin = this.el.querySelector('.wheel-spin');
    this.bind();
  }

  private spokes(): string {
    const cx = 120;
    const cy = 115;
    const r = 88;
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      out.push(
        `<line class="wheel-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`,
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

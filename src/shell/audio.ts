/** Tiny Web Audio synth — zero assets. Mute persists across sessions. */
const MUTE_KEY = 'caribbean.muted';

export type SoundKind =
  | 'cannon'
  | 'hit'
  | 'sail'
  | 'splash'
  | 'capture'
  | 'strike'
  | 'ui';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Synth {
  private ctx: AudioContext | null = null;
  private muted = loadMuted();
  private lastCannon = 0;

  ensure(): void {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore
    }
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  play(kind: SoundKind): void {
    if (this.muted) return;
    const now = performance.now();
    if (kind === 'cannon' && now - this.lastCannon < 90) return;
    if (kind === 'cannon') this.lastCannon = now;
    this.ensure();
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    switch (kind) {
      case 'cannon':
        this.noiseBurst(ctx, t, 0.28, 220, 60);
        this.tone(ctx, t, 58, 32, 'sine', 0.35, 0.2);
        break;
      case 'hit':
        this.noiseBurst(ctx, t, 0.08, 2400, 300);
        this.tone(ctx, t, 190, 90, 'square', 0.08, 0.07);
        break;
      case 'sail':
        this.noiseBurst(ctx, t, 0.14, 900, 220);
        break;
      case 'splash':
        this.noiseBurst(ctx, t, 0.4, 500, 900, 'lowpass');
        break;
      case 'capture':
        this.tone(ctx, t, 330, 330, 'triangle', 0.12, 0.16);
        this.tone(ctx, t + 0.14, 440, 440, 'triangle', 0.12, 0.2);
        break;
      case 'strike':
        this.tone(ctx, t, 220, 130, 'sawtooth', 0.1, 0.5);
        break;
      case 'ui':
        this.tone(ctx, t, 640, 640, 'sine', 0.04, 0.05);
        break;
    }
  }

  private tone(
    ctx: AudioContext,
    at: number,
    f0: number,
    f1: number,
    type: OscillatorType,
    gain: number,
    dur: number,
  ): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  private noiseBurst(
    ctx: AudioContext,
    at: number,
    dur: number,
    cutoff0: number,
    cutoff1: number,
    type: BiquadFilterType = 'lowpass',
  ): void {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff0, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, cutoff1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(at);
  }
}

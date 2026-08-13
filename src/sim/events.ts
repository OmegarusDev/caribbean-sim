/**
 * Typed event ring — the only sim → presentation interface.
 *
 * The sim emits events; the director (spectacle, story, camera, audio) and the
 * shell (HUD, toasts) consume them. The sim never touches rendering or audio.
 *
 * Schema: stable string entity ids (never ints), a `seq` for ordering, and a
 * `severity` so story/alerts can filter uniformly (info | notable | major).
 */

export type EventSeverity = 'info' | 'notable' | 'major';

export interface SimEvent {
  kind: string;
  /** Stable string id of the actor (entity or subsystem). */
  actor?: string;
  /** Stable string id of the target, if any. */
  target?: string;
  detail?: string;
  tick: number;
  seq: number;
  severity: EventSeverity;
}

export class EventRing {
  private events: SimEvent[] = [];
  private head = 0;
  private seq = 0;

  constructor(readonly capacity = 128) {}

  get length(): number {
    return this.events.length;
  }

  push(event: Omit<SimEvent, 'seq'>): SimEvent {
    this.seq += 1;
    const ev: SimEvent = { ...event, seq: this.seq };
    if (this.events.length < this.capacity) {
      this.events.push(ev);
    } else {
      this.events[this.head] = ev;
      this.head = (this.head + 1) % this.capacity;
    }
    return ev;
  }

  /** Drain and clear — presentation consumes the latest slice each frame. */
  drain(): SimEvent[] {
    const out = [...this.events];
    this.events = [];
    this.head = 0;
    return out;
  }
}

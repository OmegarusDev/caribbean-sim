/**
 * The story ticker — events become lines. The Director's narrative layer;
 * the same shape will feed alerts and journal entries in later domains.
 */
import type { SimEvent } from '../sim/events';

export function eventLine(ev: SimEvent, names: (id?: string) => string): string | null {
  const actor = ev.actor ? names(ev.actor) : null;
  const target = ev.target ? names(ev.target) : null;
  switch (ev.kind) {
    case 'broadsideHit':
      if (ev.detail === 'raked') return `${actor} rakes ${target}'s stern!`;
      return `${actor}'s broadside tears into ${target}`;
    case 'sailHit':
      return `${target}'s rigging is shredded`;
    case 'crewHit':
      return `Splinters cut ${target}'s crew down`;
    case 'fireStart':
      return `Fire breaks out aboard ${actor}!`;
    case 'sink':
      return `${actor} goes to the deep!`;
    case 'strike':
      return `${actor} strikes her colours!`;
    case 'capture':
      return `${target} is taken by boarding!`;
    case 'boardAttempt':
      return `${actor} grapples ${target} — to the rail!`;
    case 'boardRepulse':
      return `${target}'s crew throws ${actor} back!`;
    default:
      return null;
  }
}

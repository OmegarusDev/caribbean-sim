/** Toast notifications — one-shot messages that fade themselves out. */
import { el } from './dom';

let hostEl: HTMLElement | null = null;
let current: HTMLElement | null = null;
let timer = 0;

function toastHost(): HTMLElement {
  if (!hostEl) {
    hostEl = el('div', { className: 'toast-layer' });
    document.body.append(hostEl);
  }
  return hostEl;
}

export function toast(text: string, lifeMs = 3200): void {
  const h = toastHost();
  if (current) {
    clearTimeout(timer);
    current.remove();
  }
  current = el('div', { className: 'toast', text });
  h.append(current);
  timer = window.setTimeout(() => {
    current?.classList.add('is-leaving');
    window.setTimeout(() => current?.remove(), 250);
    current = null;
  }, lifeMs);
}

export function dismissToast(): void {
  if (!current) return;
  clearTimeout(timer);
  current.remove();
  current = null;
}

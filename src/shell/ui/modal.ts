/** Shared modal layer — confirm dialogs, help panels. Esc dismisses. */
import { btn, clear, el } from './dom';

export interface ModalOpts {
  title: string;
  body: HTMLElement | string;
  danger?: boolean;
  confirmLabel?: string;
  onConfirm?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
}

let layer: HTMLElement | null = null;

function host(): HTMLElement {
  if (!layer) {
    layer = el('div', { className: 'modal-layer is-hidden' });
    document.body.append(layer);
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'Escape' && isModalOpen()) {
          e.stopPropagation();
          dismissModal();
        }
      },
      true,
    );
  }
  return layer;
}

export function isModalOpen(): boolean {
  return !!layer && !layer.classList.contains('is-hidden');
}

export function dismissModal(): void {
  if (!layer) return;
  layer.classList.add('is-hidden');
  clear(layer);
}

function open(panel: HTMLElement): void {
  const h = host();
  clear(h);
  h.append(panel);
  h.classList.remove('is-hidden');
  (panel.querySelector('button') as HTMLButtonElement | null)?.focus();
}

export function confirmModal(opts: ModalOpts): void {
  const panel = el('div', { className: 'modal-panel' });
  panel.append(el('h2', { text: opts.title }));
  panel.append(
    el(
      'div',
      typeof opts.body === 'string' ? { className: 'modal-body', text: opts.body } : {},
    ),
  );
  if (typeof opts.body !== 'string') {
    (panel.lastElementChild as HTMLElement).className = 'modal-body';
    panel.lastElementChild?.append(opts.body);
  }
  const row = el('div', { className: 'modal-row' });
  row.append(
    btn(opts.cancelLabel ?? 'Cancel', {
      className: 'ghost',
      onClick: () => {
        dismissModal();
        opts.onCancel?.();
      },
    }),
    btn(opts.confirmLabel ?? 'Confirm', {
      className: opts.danger ? 'danger' : 'cta',
      onClick: () => {
        dismissModal();
        opts.onConfirm?.();
      },
    }),
  );
  panel.append(row);
  open(panel);
}

export function panelModal(title: string, body: HTMLElement | string): () => void {
  const panel = el('div', { className: 'modal-panel' });
  panel.append(el('h2', { text: title }));
  const bodyEl = el(
    'div',
    typeof body === 'string' ? { className: 'modal-body', text: body } : {},
  );
  if (typeof body !== 'string') {
    bodyEl.className = 'modal-body';
    bodyEl.append(body);
  }
  panel.append(bodyEl);
  const row = el('div', { className: 'modal-row' });
  row.append(
    btn('Close', {
      className: 'ghost',
      onClick: () => dismissModal(),
    }),
  );
  panel.append(row);
  open(panel);
  return dismissModal;
}

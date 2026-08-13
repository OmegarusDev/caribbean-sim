/** Small DOM helpers for vanilla views. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: {
    className?: string;
    text?: string;
    html?: string;
    attrs?: Record<string, string>;
  },
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts?.className) node.className = opts.className;
  if (opts?.text != null) node.textContent = opts.text;
  if (opts?.html != null) node.innerHTML = opts.html;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function btn(
  label: string,
  opts?: {
    className?: string;
    disabled?: boolean;
    active?: boolean;
    title?: string;
    onClick?: () => void;
  },
): HTMLButtonElement {
  const b = el('button', { className: opts?.className, text: label });
  if (opts?.disabled) b.disabled = true;
  if (opts?.active) b.classList.add('is-active');
  if (opts?.title) b.title = opts.title;
  if (opts?.onClick) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      opts.onClick!();
    });
  }
  return b;
}

export function setActive(button: HTMLElement, active: boolean): void {
  button.classList.toggle('is-active', active);
}

export function segment(
  labels: string[],
  selected: number,
  onPick: (i: number) => void,
): HTMLDivElement {
  const row = el('div', { className: 'seg' });
  labels.forEach((lab, i) => {
    row.append(
      btn(lab, {
        active: i === selected,
        onClick: () => onPick(i),
      }),
    );
  });
  return row;
}

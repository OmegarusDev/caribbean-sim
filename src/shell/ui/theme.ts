/** Export palette + layout tokens into CSS :root once at boot. */
import { colors } from '../../content/palette';

export const fontDisplay =
  `"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif`;
export const fontUi =
  `"IBM Plex Sans","Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif`;

export const touchTarget = 44;
export const radius = { sm: 6, md: 10, lg: 16 } as const;
export const space = { xs: 4, sm: 8, md: 14, lg: 22, xl: 34 } as const;
export const typeScale = {
  eyebrow: 11,
  meta: 12,
  body: 15,
  label: 15,
  title: 22,
  display: 34,
  banner: 48,
} as const;

export function applyCssTokens(root: HTMLElement = document.documentElement): void {
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  const c = colors;

  set('--shell-bg', c.bg);
  set('--ink', c.ink);
  set('--ink-dim', c.inkDim);
  set('--parchment', c.parchment);
  set('--gold', c.gold);
  set('--gold-hot', c.goldHot);
  set('--sea-deep', c.seaDeep);
  set('--sea', c.sea);
  set('--sea-light', c.seaLight);
  set('--foam', c.foam);
  set('--wood', c.wood);
  set('--wood-light', c.woodLight);
  set('--sail', c.sail);
  set('--hull', c.hull);
  set('--crew', c.crew);
  set('--danger', c.danger);
  set('--accent', c.accent);
  set('--accent-hot', c.accentHot);
  set('--ally', c.ally);
  set('--foe', c.foe);
  set('--panel', c.panel);
  set('--panel-border', c.panelBorder);
  set('--rail', c.rail);
  set('--rail-border', c.railBorder);
  set('--button', c.button);
  set('--button-hot', c.buttonHot);
  set('--button-disabled', c.buttonDisabled);
  set('--button-text', c.buttonText);
  set('--muted', c.muted);
  set('--hairline', c.hairline);

  set('--font-display', fontDisplay);
  set('--font-ui', fontUi);
  set('--touch', `${touchTarget}px`);
  set('--radius-sm', `${radius.sm}px`);
  set('--radius-md', `${radius.md}px`);
  set('--radius-lg', `${radius.lg}px`);
  set('--space-xs', `${space.xs}px`);
  set('--space-sm', `${space.sm}px`);
  set('--space-md', `${space.md}px`);
  set('--space-lg', `${space.lg}px`);
  set('--space-xl', `${space.xl}px`);
  set('--type-eyebrow', `${typeScale.eyebrow}px`);
  set('--type-meta', `${typeScale.meta}px`);
  set('--type-body', `${typeScale.body}px`);
  set('--type-label', `${typeScale.label}px`);
  set('--type-title', `${typeScale.title}px`);
  set('--type-display', `${typeScale.display}px`);
  set('--type-banner', `${typeScale.banner}px`);

  set('--safe-top', 'env(safe-area-inset-top, 0px)');
  set('--safe-right', 'env(safe-area-inset-right, 0px)');
  set('--safe-bottom', 'env(safe-area-inset-bottom, 0px)');
  set('--safe-left', 'env(safe-area-inset-left, 0px)');
}

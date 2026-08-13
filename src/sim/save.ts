/**
 * Generic SaveManager — the Apex pattern, made engine-generic.
 *
 *  - Storage probe so private mode / quota failures degrade gracefully.
 *  - Migration hook: corrupt or unreadable saves are wiped and replaced with
 *    a fresh state, surfaced as a one-shot warning (toast on the title).
 *  - Three keys at the app level (options / run / legacy) are three instances
 *    of this manager with different keys and shapes.
 */

export type SaveWarning = 'storage_unavailable' | 'corrupt_reset';

export interface SaveManagerOptions<T> {
  /** localStorage key, versioned (e.g. 'caribbean.save.v1'). */
  key: string;
  /** Validate + migrate a parsed save into a usable T, or null if hopeless. */
  migrate(raw: unknown): T | null;
  /** Build a fresh state for corrupt-reset. */
  createFresh(): T;
}

export interface SaveLoadResult<T> {
  state: T | null;
  warning?: SaveWarning;
}

export class SaveManager<T> {
  private storageAvailable = true;
  private warning: SaveWarning | undefined;
  private state: T | null = null;

  constructor(private readonly opts: SaveManagerOptions<T>) {}

  get warningFlag(): SaveWarning | undefined {
    return this.warning;
  }

  /** Read and clear the one-shot warning (for the title toast). */
  consumeWarning(): SaveWarning | undefined {
    const w = this.warning;
    this.warning = undefined;
    return w;
  }

  getState(): T | null {
    return this.state;
  }

  hasSave(): boolean {
    if (this.state !== null) return true;
    if (!this.canUseStorage()) return false;
    try {
      return localStorage.getItem(this.opts.key) !== null;
    } catch {
      return false;
    }
  }

  load(): SaveLoadResult<T> {
    if (!this.canUseStorage()) {
      this.warning = 'storage_unavailable';
      return { state: this.state, warning: this.warning };
    }
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(this.opts.key);
    } catch {
      raw = null;
    }
    if (raw === null) return { state: null };

    try {
      const migrated = this.opts.migrate(JSON.parse(raw));
      if (migrated === null) return this.resetCorrupt();
      this.state = migrated;
      this.warning = undefined;
      return { state: migrated };
    } catch {
      return this.resetCorrupt();
    }
  }

  save(state: T): boolean {
    this.state = state;
    if (!this.canUseStorage()) {
      this.warning = 'storage_unavailable';
      return false;
    }
    try {
      localStorage.setItem(this.opts.key, JSON.stringify(state));
      this.warning = undefined;
      return true;
    } catch {
      this.storageAvailable = false;
      this.warning = 'storage_unavailable';
      return false;
    }
  }

  reset(): void {
    this.state = null;
    if (this.canUseStorage()) {
      try {
        localStorage.removeItem(this.opts.key);
      } catch {
        // ignore
      }
    }
  }

  private resetCorrupt(): SaveLoadResult<T> {
    this.warning = 'corrupt_reset';
    try {
      localStorage.removeItem(this.opts.key);
    } catch {
      // ignore
    }
    const fresh = this.opts.createFresh();
    this.state = fresh;
    this.save(fresh);
    return { state: fresh, warning: this.warning };
  }

  private canUseStorage(): boolean {
    if (!this.storageAvailable) return false;
    try {
      const probe = '__caribbean_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch {
      this.storageAvailable = false;
      return false;
    }
  }
}

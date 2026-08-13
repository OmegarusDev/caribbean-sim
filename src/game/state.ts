/**
 * Game-level state + save wiring.
 * The world domain (v0.3) replaces the shape here; the manager contract stays.
 */
import { SaveManager } from '../sim/save';

export interface GameState {
  version: 1;
  seed: number;
  captainName: string;
  createdAt: number;
  lastSeenAt: number;
}

export const GAME_SAVE_KEY = 'caribbean.save.v1';

export function createFreshGame(now = Date.now()): GameState {
  return {
    version: 1,
    seed: now >>> 0,
    captainName: 'Captain',
    createdAt: now,
    lastSeenAt: now,
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function migrateGame(raw: unknown): GameState | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;
  if (typeof raw.seed !== 'number' || !Number.isFinite(raw.seed)) return null;
  if (typeof raw.captainName !== 'string') return null;
  return {
    version: 1,
    seed: raw.seed,
    captainName: raw.captainName,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    lastSeenAt: typeof raw.lastSeenAt === 'number' ? raw.lastSeenAt : Date.now(),
  };
}

export function createGameSaveManager(): SaveManager<GameState> {
  return new SaveManager<GameState>({
    key: GAME_SAVE_KEY,
    migrate: migrateGame,
    createFresh: createFreshGame,
  });
}

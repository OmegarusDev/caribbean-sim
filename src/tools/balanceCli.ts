/**
 * Balance CLI — headless matchup matrix over the sea-battle domain.
 * npm run sim:balance
 */
import { matchupStats } from '../sim/battle/harness';
import { HULL_CLASSES } from '../content/ships';
import type { HullClassId } from '../content/ships';

const CLASSES: HullClassId[] = ['sloop', 'brig', 'frigate', 'galleon'];
const RUNS = 80;

function pad(s: string, n: number): string {
  return s.padEnd(n);
}

function row(pairing: { team0: HullClassId[]; team1: HullClassId[] }): void {
  const s = matchupStats(pairing, RUNS);
  const pct = (Math.round((s.wins0 / RUNS) * 1000) / 10).toFixed(1);
  const lossPct = (Math.round((s.wins1 / RUNS) * 1000) / 10).toFixed(1);
  const drawPct = (Math.round((s.draws / RUNS) * 1000) / 10).toFixed(1);
  const t0 = pairing.team0.map((c) => HULL_CLASSES[c].name).join('+');
  const t1 = pairing.team1.map((c) => HULL_CLASSES[c].name).join('+');
  console.log(
    `${pad(t0, 16)} vs ${pad(t1, 16)}  →  ${pad(pct + '%', 7)} win  ${pad(lossPct + '%', 7)} loss  ${pad(drawPct + '%', 6)} draw  ~${s.avgTicks / 20}s`,
  );
}

console.log(`Caribbean Sim — balance matrix (${RUNS} runs per pairing, deterministic seeds)\n`);
for (let i = 0; i < CLASSES.length; i++) {
  for (let j = i; j < CLASSES.length; j++) {
    row({ team0: [CLASSES[i]!], team1: [CLASSES[j]!] });
  }
}
console.log('');
console.log('Fleet actions:');
row({ team0: ['sloop', 'brig'], team1: ['sloop', 'brig'] });
row({ team0: ['sloop', 'brig', 'frigate'], team1: ['sloop', 'brig', 'frigate'] });
row({ team0: ['sloop', 'brig'], team1: ['frigate', 'galleon'] });

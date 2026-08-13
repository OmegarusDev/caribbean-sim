/** Boot: tokens → shell → save → scenes → loop. */
import './shell/ui/chrome.css';
import { applyCssTokens } from './shell/ui/theme';
import { mountShell, resizeStageCanvas } from './shell/viewport';
import { Input } from './shell/input';
import { Synth } from './shell/audio';
import { GameLoop } from './shell/boot';
import { SceneManager } from './shell/scenes';
import { createGl, type GlContext } from './gfx/gl/context';
import { createGameSaveManager } from './game/state';
import { toast } from './shell/ui/toast';
import { TitleScene } from './scenes/title';

function main(): void {
  applyCssTokens();

  const shell = mountShell();
  shell.stageWrap.classList.remove('is-hidden');

  const gl: GlContext | null = createGl(shell.stage);
  let ctx: CanvasRenderingContext2D | null = null;
  if (!gl) {
    ctx = shell.stage.getContext('2d');
    if (!ctx) throw new Error('Neither WebGL2 nor 2D canvas available');
  }

  const input = new Input();
  input.attach(shell.stage, (cx, cy) => {
    const r = shell.stage.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  });

  const synth = new Synth();

  const save = createGameSaveManager();
  const loaded = save.load();
  if (loaded.warning === 'corrupt_reset') {
    toast('Your save was corrupted — a fresh voyage has been begun.');
  } else if (loaded.warning === 'storage_unavailable') {
    toast('Save storage unavailable — progress cannot persist.');
  }

  const scenes = new SceneManager();

  const loop = new GameLoop({
    update(dt) {
      scenes.update(dt);
    },
    render() {
      const { cssW, cssH } = resizeStageCanvas(shell.stage, gl);
      scenes.render(ctx, cssW, cssH);
      input.endFrame();
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') scenes.handleBack();
  });

  scenes.replace(
    new TitleScene({ chrome: shell.chrome, scenes, save, input, synth, gl }),
  );
  loop.start();
}

try {
  main();
} catch (err) {
  console.error('[caribbean] boot failed', err);
  const app = document.getElementById('app');
  if (app) {
    app.innerHTML =
      '<div style="color:#d4a94f;font-family:serif;padding:2rem">Caribbean failed to start: ' +
      (err instanceof Error ? err.message : String(err)) +
      '</div>';
  }
}

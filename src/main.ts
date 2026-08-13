/** Boot: tokens → shell → save → scenes → loop. */
import './shell/ui/chrome.css';
import { applyCssTokens } from './shell/ui/theme';
import { mountShell, resizeStageCanvas } from './shell/viewport';
import { Input } from './shell/input';
import { GameLoop } from './shell/boot';
import { SceneManager } from './shell/scenes';
import { createGameSaveManager } from './game/state';
import { toast } from './shell/ui/toast';
import { TitleScene } from './scenes/title';

function main(): void {
  applyCssTokens();

  const shell = mountShell();
  shell.stageWrap.classList.remove('is-hidden');
  const ctx = shell.stage.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const input = new Input();
  input.attach(shell.stage, (cx, cy) => {
    const r = shell.stage.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  });

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
      const { cssW, cssH } = resizeStageCanvas(shell.stage);
      scenes.render(ctx, cssW, cssH);
      input.endFrame();
    },
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') scenes.handleBack();
  });

  scenes.replace(new TitleScene({ chrome: shell.chrome, scenes, save }));
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

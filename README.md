# Caribbean Sim

<p align="center">
  <a href="https://omegarusdev.github.io/caribbean-sim/">
    <img src="https://img.shields.io/badge/▶_PLAY_NOW-playable_in_browser-brightgreen?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Play Now" height="40" />
  </a>
</p>

<p align="center"><strong>No install.</strong> Works in the browser (desktop &amp; mobile).</p>

Persistent-world pirate sim — the ultralight engine's flagship game.

- **Zero assets.** All graphics procedural, all audio synthesized.
- **Seamless world.** Combat happens on the overworld; towns are Banished-lite region sub-sims.
- **Living economy.** Prices emerge from supply/demand + transport; NPC trade routes emerge, never pre-set.

Full design record: [`PLAN.md`](PLAN.md)

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:5300/
npm run typecheck
npm test
npm run build
```

## Layout

```
src/
  sim/       # deterministic headless core (rng, clock, events, save)
  shell/     # chrome: boot loop, input, viewport, scenes, DOM UI kit
  present/   # procedural renderers (sea backdrop → overworld in v0.3)
  scenes/    # game screens (title, skirmish sandbox)
  content/   # content-as-code (palette; commodities etc. land with the economy)
  game/      # game-level state + save wiring
```

## Timeline

- **v0.1** Skirmish sandbox — sea-battle pure function + director + balance harness
- **v0.2** The Fleet — hull classes, components, personalization
- **v0.3** The Sea — seamless Caribbean, spatial combat, tick-LOD, world save
- **v0.4+** Trade, crew RPG, colonies, full economy, fleet routing → **v1.0**

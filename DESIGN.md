# Caribbean — From-Scratch Design (v2)

> Status: **PLANNING**. This document re-plans the entire game and engine from
> scratch, learning from the prototype. The prototype proved the hard 20%
> (determinism, WebGL2, instancing, ship physics); this design writes the
> other 80% properly and re-homes the proven core inside it.
>
> Principle: **nothing in the prototype is sacred except the contracts that
> survived four rounds of scrutiny.** Those move verbatim. Everything else is
> rebuilt the way it would have been built with the full design brief.

---

## 1. Lessons from the prototype (the rules this design obeys)

1. **Build the world first; combat is a domain inside it.** The prototype built
   the battle before the world, so `BattleConfig` was designed in a vacuum and
   the world will have to wrap it. Inverted here: the World domain (spaces,
   entity model, tick scheduling, persistence) is the spine; the battle is one
   domain summoned from it.
2. **Events are a typed, registered catalog — never string-kind switches.**
   `kind: 'broadsideHit'` + ad-hoc `detail` strings forced spectacle/story/audio
   into untyped switch statements. Every event kind is registered with a
   validated payload; directors, story, audio, and HUD subscribe by kind.
3. **The Director is one object, not three files.** Camera, spectacle meter,
   story ticker, audio hooks and FX triggers were scattered across the battle
   scene. One `Director` per scene composes them and receives events once.
4. **Scenes are thin composition roots.** The 550-line `BattleScene`
   god-object (sim + camera + DOM + FX + flow) becomes
   `Domain + View + Hud + Director` wired in ~60 lines.
5. **Content is a registry, not loose modules.** Ships, commodities, hulls,
   names, presets: schema-validated content modules with boot-time checks —
   the pattern Apex proved, generalized.
6. **Sim data is data-oriented from day one.** SoA typed-array containers
   (the particle-pool lesson applied to settlers, agents, structures). No
   class-per-agent, no Map-of-objects, no GC churn.
7. **Storage is a backend, not a call.** localStorage is a ~5MB trap; the
   world state will be bigger. A storage interface with localStorage +
   IndexedDB backends, three keys (options / run / legacy), checkpoint
   snapshots, and a migration chain — before the world ships.
8. **Audio is a system.** Buses, an event→sound table, and an ambience layer —
   not seven one-shots hardwired into a scene.
9. **The UI kit is a kit.** Button, Panel, StatBar, List, Modal, Toast, Segment
   — built once, styled once via tokens, reused by every screen.
10. **The engine is a package, the game is a package.** Monorepo from day one:
    `packages/engine` (reusable) and `packages/caribbean` (the game). The
    "hundred genres" ambition is real only if the boundary is real.
11. **Every domain gets a harness.** Determinism fingerprint + headless runs +
    named gates. Combat has one; the economy gets invariants (prices bounded,
    no mass starvation, historical trade bands); the world gets one.
12. **GPU code is tested.** The three mobile rendering bugs were all
    untestable by unit tests. E2E GL tests (headless browser, SwiftShader)
    assert `gl.getError() === 0` and screenshot every scene from the start.
13. **Replay is a tool, not a dream.** Input-log recording + headless replay
    ships with the harness; bug reports become replay files.
14. **Keep the proven contracts verbatim:** seeded split-RNG, fixed integer
    ticks, event-stream sim boundary, snapshot-only state, deterministic
    headless cores, the instanced/culled/restorable GL layer, the steering
    physics, the balance discipline.

---

## 2. Repository structure

```
caribbean-sim/
  packages/
    engine/                        # reusable across every future genre
      src/
        sim/
          rng.ts                   # verbatim (proven)
          clock.ts                 # verbatim
          events.ts                # NEW: typed event registry + ring
          domain.ts                # NEW: the domain contract (below)
          storage.ts               # NEW: backend interface + managers
          world.ts                 # NEW: data-oriented containers
        director/
          director.ts              # NEW: unified per-scene director
          spectacle.ts             # rebuilt on the event registry
          story.ts                 # rebuilt on the event registry
          cameraController.ts      # verbatim from core/camera
          audioBridge.ts           # NEW: event → sound/bus table
        shell/
          boot.ts input.ts viewport.ts scenes.ts   # verbatim (proven)
          ui/                      # NEW: the kit (Button/Panel/StatBar/List/
                                   #      Modal/Toast/Segment/theme)
        gfx/
          core/                    # verbatim (math/camera/mesh/texture/
                                   #      particles/context/shader/fx3d)
          world/                   # verbatim (scene/atmosphere/water/sky/
                                   #      entities — with per-mesh layouts)
        present/                   # NEW: renderer-adapter boundary per genre
      engine.test.ts               # contract tests (determinism, math, kit)
    caribbean/                     # the game
      src/
        content/
          registry.ts              # NEW: validate-content-at-boot
          ships.ts commodities.ts economy.ts names.ts presets.ts ...
        domains/
          world/                   # NEW: the persistent world domain
            world.ts worldState.ts
            space/                 # graph (routes) + regions (towns)
            sailing.ts             # player ship movement + wind
            weather.ts             # storms, calms, day/night
            encounters.ts          # disposition → battle summoning
          battle/                  # migrated + re-homed (below)
            battle.ts captain.ts boarding.ts ...   # sim verbatim
            battleEvents.ts        # NEW: registered event catalog
          economy/
            goods.ts production.ts consumption.ts transport.ts market.ts
            economyHarness.ts      # invariants + historical bands
        director/                  # game-side director presets
        scenes/
          title.ts skirmish.ts battle.ts world.ts harbor.ts shipyard.ts
          # each: thin root over Domain + View + Hud + Director
        ui/                        # game screens built on the engine kit
        tools/
          balanceCli.ts replay.ts worldInspect.ts
      caribbean.test.ts
  DESIGN.md  PLAN.md  package.json (workspaces)
```

---

## 3. Engine contracts

### 3.1 The domain contract (the spine of the engine)

```ts
interface Domain<S, C, R> {
  create(config: C): S                 // seeded, pure
  step(state: S, out: EventWriter): void
  end(state: S): R | null              // terminal result, or null while ongoing
  fingerprint(state: S, rng: SeededRng): number
  serialize(state: S): Uint8Array
  deserialize(bytes: Uint8Array, config: C): S
}
```

Rules: every domain is seeded and headless; determinism fingerprints are part
of the contract; serialization is mandatory (checkpoint saves fall out for
free); harnesses are generated from the contract. The battle, the economy,
and the world are all domains. A domain may be **summoned** from another
(encounter → battle); the parent's clock pauses while a child runs.

### 3.2 The typed event registry

```ts
const battleEvents = defineEvents({
  broadsideHit: { raked: 'bool', amount: 'num', side: 'enum:port,starboard' },
  strike: {},
  capture: {},
  boardAttempt: {},
  // ...
})
```

- Kinds are validated at boot (a producer can't emit an unknown field).
- Consumers subscribe by kind; story lines and sound tables live next to the
  registry, not in switch statements.
- Every event carries `tick`, `seq`, `severity` as today.

### 3.3 Clocks & determinism

Verbatim: integer-tick `Clock`, the five drivers (wallClock / action /
scheduler / offline / fastForward), split RNG streams, no `Math.random` in
sim (enforced by a dev guard in `step`). Live world: input-log replay.

### 3.4 Storage

```ts
interface StorageBackend { get(key): string|null; set(key, value): void; delete(key): void }
// localStorage today; IndexedDB for the world (quota, async, binary).
```

Three keys per run: `options` / `run` / `legacy`. Checkpoint snapshots are
the primary save (never replay-from-zero). Migration chain is versioned and
tested with fixture saves from every prior version.

---

## 4. The World domain (Phase 1 — built first)

### 4.1 Spaces

- **Graph** — the overworld: ports (nodes), sea lanes (links), faction
  territory, weather cells. Geographic coordinates live on nodes for
  procedural rendering.
- **Plane** — battle regions: a sub-region of the graph's geography, where
  the 20Hz combat sim runs. (The prototype's arena.)
- **Regions (towns)** — sub-sims on their own hourly schedule: population
  (statistical), production buildings, storage, demand.

### 4.2 The entity model (data-oriented)

```ts
// SoA containers, not classes:
class AgentTable { /* typed arrays: x, y, type, needs, job, home, ... */ }
class StructureTable { /* id, region, kind, inputs, outputs, labor, stock */ }
class FleetTable { /* id, ships, route, cargo, cash, priceMemory */ }
```

- Settlers: seeded individuals (deterministic), ticked hourly in bulk,
  presented (rendered) only near the player — the LOD rule from the plan.
- Merchant fleets: bounded-information agents (price memory, risk profile);
  routes **emerge** from profit-seeking — never pre-set.
- The player's fleet is a market participant; every transaction moves prices.

### 4.3 Tick scheduling (LOD)

One world clock (1 tick = 1 in-game hour). Entities carry tick budgets:
ships near the player tick every frame's worth, mid-sea every few sim-minutes,
towns hourly, settlers hourly. The battle is a child domain at 20Hz; boarding
a child of that at 60Hz with tactical pause.

### 4.4 Persistence

World state = checkpoint snapshot + recent event log. Save on any scene
transition and every N sim-days; binary format once the snapshot exceeds a
few MB; IndexedDB backend from the start.

---

## 5. The Economy domain (Phase 4 — the 100% sim)

- **Goods**: commodities as registered content (sugar, rum, tobacco, indigo,
  cotton, timber, fish, salt, iron, gold/silver, food, water).
- **Production**: plantation/farm/mine → raw → processing → port → export.
  Each a ticked entity with inputs, labor, yield variance, storm exposure.
- **Consumption**: population, businesses (taverns, shipwrights), crews,
  Europe (elastic demand curves + convoy spawns + shocks).
- **Transport**: ships are the bloodstream — cargo is goods in motion;
  blockades and piracy bite through it.
- **Prices**: emergent from supply/demand + transport. Never scripted.
- **Harness**: run N headless years; assert prices bounded and mean-reverting,
  no stock explosions, no mass starvation without cause, trade volumes within
  historical tolerance bands, route shifts after scripted blockades.
- **The engine economy is genre-agnostic**: goods/production/market are engine
  concepts; the Caribbean commodity web is content. (Kenshi, space-mining,
  and idle-clickers reuse the same domain.)

---

## 6. The Battle domain (Phase 2 — migrated and re-homed)

The prototype's sim moves **verbatim** (`battle.ts`, `captain.ts`,
`boarding`, strike/flee/sink, the steering physics and its tests). What
changes:

1. Events go through the registry (`battleEvents`).
2. The Director owns camera/spectacle/story/audio — the scene no longer does.
3. `BattleConfig` is summoned by encounters from the world domain, not
   constructed by a preset screen.
4. The sandbox (skirmish) becomes a thin harness for the same domain —
   exactly as it is today, but as a test fixture + player lab.

---

## 7. The Director (unified)

```ts
class Director {
  constructor(scene: WorldScene, mood: Atmosphere, audio: AudioBus)
  ingest(events: SimEvent[]): void      // spectacle, story, camera, sound, fx
  update(dt: number): void              // camera controller, meters, caption
}
```

One object per scene. The battle's hit-stop/shake/interest/story/audio wiring
collapses into Director presets (`BattleDirector`, later `OverworldDirector`,
`StorytellerDirector` for events in the world). Rimworld-style alert feeds in
the overworld are the same object with a different story table.

---

## 8. Shell + UI kit

- Shell (boot/input/viewport/scenes): verbatim.
- UI kit: `Button, Panel, StatBar, List, Modal, Toast, Segment` + tokens.
  Every screen is composed from the kit; the HUD is a kit layout, not
  bespoke HTML. Screens: title, skirmish, battle HUD, world HUD, harbor,
  shipyard, crew, journal, options.
- Input: pointer/keyboard as today; add gamepad later if wanted (contract
  already shape-compatible).

---

## 9. Audio (system, not stub)

- `AudioBus`: master/music/ambience/effects buses with volumes persisted in
  `options`.
- Event→sound tables (registered per event kind, like story lines).
- Procedural layers: ocean ambience, cannon, boarding, and later sea-shanty
  music + crowd (for the arena mode of the future).

---

## 10. Game layer

- **Content registry**: every content module validated at boot
  (commodities reference valid production recipes, hull classes have sane
  stats, presets reference real ships). Fail-fast with a readable report.
- **Ship customization**: components (hull, battery, rigging, figurehead,
  quarters) feed the battle balance harness; visual layer (sails, paint,
  flags, name) via the existing instanced palette system; deck-plan grid
  stays a stretch goal (v0.5 decision).
- **RPG**: crew roster (traits, morale, injuries, aging, relationships),
  captain reputation, faction standing, privateer/pirate alignment, legacy
  across captains. Roster = the Lanista pattern, re-homed on the data-
  oriented containers.
- **Fleets**: multiple player fleets with autonomous trade routing.

---

## 11. Testing & quality gates

| Gate | What runs |
|---|---|
| Unit | math, camera, particle pool, save migration fixtures, content validation, director (spectacle/story tables) |
| Harness | combat balance matrix · economy invariants · world determinism fingerprints |
| E2E (CI, SwiftShader) | boot → title screenshot → enter battle → `gl.getError()===0` + screenshot → enter world → advance N days → save/load → screenshot |
| Determinism | every domain: same seed ⇒ identical fingerprint; input-log replay reproduces a session |
| Perf budget | frame time budget per quality tier; entity-count ceiling tests (10k settlers tick < 2ms) |

---

## 12. Platform

- **PWA** before v1.0: installable, offline, tiny (zero assets).
- **Quality tiers**: auto-detect on boot (particle cap, water grid, DPR cap,
  wave octaves), user-overridable.
- **Sim worker** (designed-in, enabled later): the world domain can run in a
  worker so the Caribbean lives while the tab is backgrounded; the renderer
  consumes snapshots. The domain contract makes this a transport change, not
  a rewrite.

---

## 13. Milestones (each shippable and playable)

| Version | Name | Delivers |
|---|---|---|
| **0.1** | The Spine | Monorepo, domain contract, event registry, storage backends, UI kit, director, E2E GL harness, replay tool. Battle domain re-homed inside it. Skirmish still playable. |
| **0.2** | The World | Graph space, ports, sailing + wind, world clock + LOD ticks, encounters, checkpoint saves, world HUD. The island test (Bahamas slice, 2 ports) with battles summoning from encounters. |
| **0.3** | The Fleet | Hull classes + components + visual layer + design store (prototype v0.2 work, re-homed). |
| **0.4** | The Trade | Economy v1: goods, markets, contracts, smuggling, provisioning. Economy harness green. |
| **0.5** | The Crew | Roster RPG, captain reputation, factions, alignment, legacy. |
| **0.6** | The Colonies | Economy v2: settlers, production chains, Europe frontier. Historical bands. |
| **0.7** | The Pirates | Multiple fleets, autonomous routing, storms + day/night, faction wars, exploration/treasure. |
| **1.0 RC** | The Caribbean | Integration, balance pass, PWA, quality tiers, procedural music, onboarding, legacy meta. Beta release candidate. |

---

## 14. Verbatim / rebuilt / deleted

**Verbatim (proven):** `sim/rng`, `sim/clock`, `sim/events` (ring mechanics),
`shell/*` (boot/input/viewport/scenes/save-manager shape), `gfx/core/*`,
`gfx/world/*` (with per-mesh layouts), battle sim internals + physics tests,
balance discipline, atmosphere data, procedural textures.

**Rebuilt properly:** event system (registered catalog), director
(unified object), scenes (thin composition), content (registry + validation),
storage (backend interface + IndexedDB + checkpoints), UI (kit), audio
(system), world + economy domains (new), tests (director/harness/e2e).

**Deleted:** the 550-line BattleScene god-object pattern, string-kind
switches in spectacle/story/audio, bespoke HUD HTML, the stub `GameState`,
the content-as-loose-modules approach.

---

## 15. Explicitly not doing (anti-YAGNI)

- WebGPU backend (boundary designed; backend deferred)
- Rust/WASM sim (revisit only at ~10⁵ entities)
- Full ECS (data-oriented containers suffice)
- Multiplayer (but determinism discipline keeps lockstep possible)
- Cloud saves / accounts / analytics
- i18n (text stays centralized in content for a later pass)
- Shadows / PBR (stylized world; fake blobs + AO suffice)
- The deck-plan grid (v0.5 decision, held deliberately)

---

## 16. Open decisions to lock before 0.1

1. Does the world clock **pause** during battles (Mount & Blade style) or
   keep running (battle as spatial sub-sim)? Lean: pause — the Rimworld
   pattern, simplest, keeps battle feel pure.
2. Town raids: nested skirmish domain (visible, proves nesting) or abstracted
   odds? Lean: abstract for 0.6, visible skirmish as a stretch.
3. IndexedDB from 0.1 (binary-ready) or localStorage until 0.2 proves size?
   Lean: backend interface from 0.1, IndexedDB backend when the world lands.
4. Sim worker: design the boundary now, enable at 0.7, or defer entirely?
   Lean: boundary now, enable at 0.7.

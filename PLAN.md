# Caribbean Sim — Pirate Game & Ultralight Engine Plan

> Status: **v0.1 SKIRMISH SANDBOX SHIPPED** — the engine skeleton, sea-battle
> domain, procedural WebGL rendering, director camera, synthesized audio, and the
> first playable mode (Auto Battle + Captain helm) are all in `main`, tested, and
> building. This is a working prototype, not a planning doc.
>
> Next horizon: **v0.3 The Sea** — a persistent Caribbean overworld where combat
> happens spatially and the skirmish domain is summoned from live encounters.

---

## 1. Design philosophy (non-negotiable)

- **Zero external assets.** All graphics procedural (WebGL2/Canvas), all audio synthesized (Web Audio).
- **Minimal design.** Thin chrome over a fat, honest simulation. One focused mechanic per layer.
- **Content is code.** Typed TS data modules validated at boot. No JSON schema files, no runtime asset loading.
- **The math is the game.** The economy and world must be mathematically alive regardless of feel.
- **Robust and adaptable above all.** This engine must flex to wildly different genres.
- **Bundle size is a soft ceiling.** The current production build is ~120 kB JS + ~14 kB CSS.

---

## 2. Current architecture

The codebase follows the planned engine spine, with one naming adjustment: the
rendering layer lives under `gfx/` (engine graphics core + game-specific
world/present modules) rather than the original `present/`.

```
src/
  sim/        # pure, deterministic, headless
    rng.ts          mulberry32 + split-stream API + state capture
    clock.ts        integer tick + driver abstraction
    events.ts       typed event ring
    save.ts         generic SaveManager
    battle/         SeaBattle domain
  director/   # spectacle
    spectacle.ts    event → entertainment score
    story.ts        event → commentary/alerts
  shell/      # thin chrome
    boot.ts         RAF loop, fixed-step accumulator
    input.ts        pointer/keyboard abstraction
    viewport.ts     visualViewport pinning, DPR resize
    scenes.ts       scene stack with fades
    audio.ts        synthesized sound buses
    ui/             DOM kit + controls + theme
  gfx/        # procedural rendering
    core/           engine graphics: context, shader, mesh, camera, math, particles, FX
    world/          game world rendering: sea, sky, sun, atmosphere, wakes
    present/        game entity presenters (ship mesh, ship views, culling)
  scenes/     # game screens
  content/    # content-as-code
  game/       # game-level state + save wiring
  tools/      # balance / smoke-test harnesses
```

### 2.1 The shared spine (proven in code)

1. **Deterministic headless sim core.**
   - `SeededRng` is the sole randomness source with splittable streams.
   - `Clock` is an integer counter advanced by a driver; the sim never sees wall time.
   - `Battle` runs without a DOM and can be driven to completion headlessly.

2. **Event stream as the only sim → presentation interface.**
   - Typed `SimEvent` via `EventRing`.
   - The sim never touches rendering, audio, or camera.
   - `BattleScene` consumes events → FX, audio, shake, story.

3. **The Director makes the sim watchable.**
   - `SpectacleMeter` scores spectacle from events.
   - `Camera3d` + `CameraController` auto-frames interest points.
   - `eventLine` turns events into a story ticker.

4. **Thin chrome.**
   - Content-as-code validated via tests.
   - Versioned localStorage saves with migration + corrupt-reset.
   - Hand-rolled DOM UI kit with theme tokens.

---

## 3. The engine core

### 3.1 The four abstractions

1. **Spaces** — where entities live, one contract (`nearest`, `withinRadius`):
   - `plane` — arena (sea battle, Lanista combat, Rimworld/Kenshi/Total War battlefields)
   - `curve` — track/racing line (Apex; rivers, convoy lanes, chases)
   - `grid` — hex/cell (Rimworld base building, Total War campaign)
   - `graph` — nodes/links (pirate overworld, Kenshi travel map, Total War provinces)

2. **Time scales** — nested, fixed-tick, deterministic:
   - campaign tick (1 per in-game day)
   - battle tick (watchable sim, e.g. sea battle at 20 Hz)
   - agent tick (cheap low-frequency loop for towns/colonies)

3. **Domains** — self-contained seeded sims:
   - `{ config (seeded) → headless sim → result }`, nothing leaks.
   - `Battle` is the first domain; the world (v0.3) will spawn battles from encounters.

4. **The Director** — genre-agnostic narrative layer with a pluggable audio hook.

### 3.2 Clocks, not time models

`Clock` is an integer counter. `advance(n)` is the only way time moves. A `Driver`
decides when to advance:

| Driver | Who advances | Example |
|---|---|---|
| `wallClock` | fixed-step accumulator from RAF dt | sea battle, sailing |
| `action` | only when the player resolves something | campaign menus |
| `scheduler` | at scheduled tick offsets | economy events, weather |
| `offline` | on save-load, catching up ticks | provisioning |
| `fastForward` | as many ticks as possible, headless | balance harness |

Rules:
- A domain is spawned from a parent with config + seed; runs on its own clock; returns a result.
- Every domain gets its own RNG stream (`rng.split(parentSeed, domainId)`).
- A domain's entire state is `config + seed + tick count`.
- Wall clock only ever touches presentation.

### 3.3 Determinism contract

- **Test harnesses** assert seed-replay determinism and fingerprint hashes.
- **Live world** uses input-log replay (`state snapshot + inputs + dt`).
- Sim boundary: snapshots only, string entity ids, typed event schema.

---

## 4. The pirate game — a fully persistent sim

**No separation between overworld and combat. Combat happens ON the overworld.
Towns are region sub-sims (lite Banished).**

### 4.1 The architecture

- **One world space** — a geographic plane (the Caribbean). Ships, fleets, convoys,
  patrols move continuously. Combat is spatial.
- **Combat as a pure function** — `stepCombat(state, input, dt)`. The same function
  powers the live world and the headless balance harness.
- **Tick-rate LOD, not nested worlds**:
  - Ships near player: ~20 Hz
  - Ships mid-sea: every few sim-seconds
  - Towns: hourly rollup
  - Crew skirmishes: 60 Hz fighter sim, **world tactically paused**
- **Towns as region sub-sims (Banished-lite)** — population, hunger, housing,
  production, storage, labor, on an hourly schedule.
- **The world never stops** — tab-away = pause; offline catch-up = the `offline`
  driver with a "While you were ashore…" note (capped).

### 4.2 Honest costs

1. Live-world determinism is input-log replay, not seed replay.
2. v0.3 grows the architecture but keeps scope tight (no towns, no raiding).
3. Save = world snapshot + event log.

### 4.3 Boarding

- Start **abstract** (crew-vs-crew odds) in v0.1. ✅ Done.
- Upgrade to a **visible nested Skirmish domain** as a tactical-pause sub-view in v0.5+.

---

## 5. The economy

### 5.1 Simulate the economics, let routes *emerge*. Never pre-set.

The historical trade web fell out of comparative advantage, geography, and demand.
**The simulation reproducing history (the sugar triangle emerging) is the test
that the math is right.**

NPC merchants are not omniscient:
- Each ship: cargo, cash, home port, **price memory**, risk profile.
- Routing = "best expected profit given what I believe," computed per departure with noise.
- Convoys form on profitable routes; routes shift under blockades; hurricanes wipe
  harvests → grain ships appear where never scripted.

The player is a market participant: buy sugar in Havana → price rises; raid the
convoy lane → Santo Domingo starves a little.

### 5.2 The abstraction line: "simulate flows, abstract frontiers"

**Fully simulated:** prices, production chains, transport, demand, labor, player feedback.

**Abstracted:** Europe (elastic demand frontier), settlers as a statistical
population, farming at plantation scale, businesses as consuming agents.

### 5.3 The economy harness

Run N headless years and assert invariants:
- Prices bounded and mean-reverting
- No stock explosions
- No mass starvation without cause
- Trade volumes within historical tolerance bands
- Route shifts after scripted blockades
- Closed loop verified

---

## 6. Full system list (the 1.0 vision)

### Overworld (World domain)
- Real Caribbean map: Florida → Mexico → NE South America. Coastlines as hand-tuned
  polygon data; procedural islands, shoals, minor keys fill in.
- Ports as nodes, sea lanes as links.
- Sailing with navigation (course, speed from wind), day/night, calms, trade winds, currents.
- NPC ships: merchants, patrols, convoys, other pirates — each with a **disposition**.
- **Weather domain**: hurricanes, storms, calms.
- **Exploration**: undiscovered islands, treasure charts, wrecks, reefs.
- **Faction territory and hostility**.

### Combat (SeaBattle — pure function)
- Ship-to-ship skirmish spawned from overworld disposition. ✅ v0.1
- Hull/sails/crew/morale pools; momentum, wind; broadside arcs; fires, sinking,
  striking, capture. ✅ v0.1
- Captain AI with intentions (CHASE / BREACH / EVADE / WHEEL / HOLD / STRIKE / MANUAL). ✅ v0.1
- Director: camera, spectacle meter, story ticker, audio. ✅ v0.1
- Repair-in-battle (crew to pumps/sails).

### Ships & customization
- Historical hull classes: sloop → brig → frigate → galleon. ✅ v0.1
- Layered customization: components with tradeoffs, personalization (name, sail
  patterns, paint, flags).
- Procedural ship mesh from hull class. ✅ v0.1
- Fleet management: multiple fleets with autonomous trade routing.

### Economy
- Commodities: sugar, rum, tobacco, indigo, cotton, timber, fish, salt, iron,
  gold/silver, food, water.
- Full production chains.
- Individual settlers with hunger and needs.
- Emergent price formation; smuggling as a parallel contraband market.
- Contracts, convoy missions, monopolies, blockades, prize courts.
- Provisioning: food/water per voyage, rations, scurvy.
- Upkeep: pay, repairs, ammunition, careening.

### RPG layer
- Crew roster with traits, temperament, skills, morale, injuries, aging, relationships.
- XP from battle spectacle.
- Captain: reputation, bounties, faction standing, **death = new captain with legacy carry**.
- Missions from governors, navy contracts, treasure charts, native alliances.
- Alignment: pirate / privateer / merchant.

### Meta systems
- Three-key save (options / run / legacy) with migration + corrupt-reset. ✅ v0.1 (run)
- Boot diagnostics. ✅ v0.1 (tests)
- Sandbox mode with reroll seeds. ✅ v0.1
- Onboarding hints + How-to-Play + captain's logbook.
- Options, mobile support, accessibility basics.
- Procedural sea-shanty audio.

---

## 7. Development strategy

The skirmish mode and the world's spatial combat are **the same pure function
with different shells**. No divergence risk, no duplicated code.

1. **v0.1 — the skirmish sandbox.** ✅ Done.
2. **v0.3A — the island test.** A corner of real geography with 2 ports, basic trade,
   NPC merchants, sailing, first spatial combat embedded in the world.
3. **v0.3B — grow it into Cuba**, then outwards. Every step is **content, not architecture**.
4. **v0.4+ — factions and economy accrete on the live world.**

Ordering discipline: **combat first**; **island test second**; **economy in stages**.
Every stage ships playable.

---

## 8. Version timeline to 1.0

| Version | Name | Status | Proves in the engine |
|---|---|---|---|
| **v0.1** | The Skirmish | ✅ Shipped | `stepCombat` pure function + harness + sandbox |
| **v0.2** | The Fleet | Future | Hull classes + components + personalization |
| **v0.3** | The Sea | In design | Seamless world: geography, sailing, spatial combat, tick-LOD, world save |
| **v0.3A** | The Island Test | Next milestone | Smallest proof of the persistent world |
| **v0.3B** | Cuba & Beyond | Future | Map growth is content, not architecture |
| **v0.4** | The Trade | Future | Economy v1: commodities, supply/demand, contracts, smuggling |
| **v0.5** | The Crew | Future | Full roster RPG: officers, skills, morale, XP, reputation, alignment |
| **v0.6** | The Colonies | Future | Economy v2 — settlers, hunger, production chains, emergent prices |
| **v0.7** | The Pirates | Future | Multiple fleets, autonomous routing, blockades, faction wars, exploration |
| **v1.0** | The Caribbean | Future | Integration, balance, onboarding, legacy meta, performance, mobile pass |

---

## 9. Future avenues (the engine's horizon)

| Future game | Engine pieces it leans on | The one new piece it needs |
|---|---|---|
| **Kenshi-like** | graph travel + agent ticks + economy + roster sims | agent needs/job system; grid space |
| **Rimworld clone** | colony = roster + buildings + events→story director | grid space + building entities + storyteller |
| **Total War** | campaign graph + battlefield plane domains | army-group entities; formations |
| **Idle clicker** | economy domain + campaign tick + offline idle | content only |
| **Football manager** | season loop + match domain + roster sims | abstract match sim |
| **Turn-based tactics** | plane space + entity pools + deterministic RNG | discrete action queue |
| **SWAT game** | plan-then-watch mission flow + roster sims | mission/plan domain |
| **Creature autobattler** | Lanista fight sim, nearly 1:1 | content only |
| **Navy autobattler** | sea battle domain, nearly 1:1 | content only |
| **Space mining strategy** | economy + fleet sim + encounter autobattles | content only |

**Design rules that keep every door open:**
1. Splittable RNG streams.
2. String entity ids; typed event schema with severity.
3. Snapshot-only sim boundary.
4. Every domain gets `runHeadless` + fingerprint determinism check + boot diagnostics.
5. Entities are typed data with pools.
6. The Director is separate with a pluggable audio-hook slot.
7. Nested domain summons are a normal call.

**Deliberately NOT built now:** hex grid, agent jobs, formations, TBS action queues, multiplayer.

---

## 10. Open decisions

| Decision | Lean | Notes |
|---|---|---|
| v0.3A factions? | **Yes, factions early** | Spanish vs English port proves disposition/relations |
| Boarding visible or abstract? | Abstract first; visible nested skirmish as v0.5 stretch | Visible proves nesting and is more fun |
| Deck-plan grid inventory | Stretch, Phase 2 decision | Signature-mechanic risk |
| Sea battle tick rate | ~20 Hz, 2–6 ships, up to 12 | Ships are slow; 60 Hz is wasted |
| Bundle size policy | 1 MB soft ceiling | Currently ~135 kB gzipped |
| Engine distribution | Copy-in folder or git subtree per game | Standalone GH-pages repos |

---

## 11. Technical health & maintenance notes

| Check | Status |
|---|---|
| `npm run typecheck` | ✅ Passes |
| `npm test` | ✅ 109 tests across 18 files |
| `npm run build` | ✅ ~119 kB JS + ~14 kB CSS |
| Git working tree | Clean; `main` is 13 commits ahead of `origin/main` |

**Known maintenance items:**
- `PLAN.md` was stale (this update fixes that).
- Local commits need to be pushed to keep `origin/main` in sync.
- The `gfx/` directory name differs from the original `present/` sketch; the engine
  spine is otherwise unchanged.
- `BattleScene` is large (~800 lines); it intentionally owns the battle HUD, input,
  camera, and FX in one place, but should be watched as features accrete.

---

## 12. Next steps

1. **Push the 13 local commits** to `origin/main` so the remote reflects the shipped v0.1.
2. **Design v0.3A — the Island Test:**
   - Draft the `World` entity model (pools, tick budgets, LOD rates).
   - Draft the overworld `Space` contract and the first `graph` + `plane` composition.
   - Define the first two ports, commodities, and NPC merchant dispositions.
3. **Keep v0.1 healthy:** add no new tech debt without a test or a PLAN note.

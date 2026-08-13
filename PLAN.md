# Caribbean Sim — Pirate Game & Ultralight Engine Plan

> Status: **PLANNING** — zero code written. This document is the complete design
> record from the planning sessions. The game (working title: a persistent-world
> pirate sim set in the historical Caribbean) is the flagship that will become
> the **new template** for a hundred other genres (Kenshi-like, Rimworld clone,
> Total War, idle clicker, football manager, creature autobattler, navy
> autobattler, space mining strategy, SWAT, trading sims…).

---

## 1. Design philosophy (non-negotiable)

- **Zero external assets.** All graphics procedural (WebGL2/Canvas), all audio synthesized (Web Audio).
- **Minimal design.** Thin chrome over a fat, honest simulation. One focused mechanic per layer.
- **Content is code.** Typed TS data modules (like `content/` in Lanista, `data/` in Apex) validated at boot. No JSON schema files, no runtime asset loading.
- **The math is the game.** "It's just basic maths — just LOADS of it." The economy and world must be mathematically alive regardless of feel.
- **Robust and adaptable above all.** This engine must flex to wildly different genres. Every abstraction decision below serves that.
- Bundle size: 1MB is a soft ceiling, not a religion. Zero-assets keeps a full Caribbean in the low single-digit MBs.

---

## 2. The two templates — what they already share

Both prototypes independently reinvented the same four-layer spine:

### 2.1 The shared spine

1. **Deterministic headless sim core.**
   - Mulberry32 as the sole randomness source (`SeededRNG` in Lanista, `mulberry32` in Apex — same algorithm).
   - Both sims run without a DOM: `Match.runToEnd()` + `balanceCli.ts` (Lanista), `runHeadless()` + `runDeterminismCheck()` with result fingerprint (Apex).
   - Both use **fixed timesteps** (Lanista 1/60 ticks, Apex `PHYSICS.dt` = 1/120) with speed multipliers and wall-clock dt capped at 0.05s.

2. **Event stream as the only sim → presentation interface.**
   - Typed events (`CombatEvent` via `recentEvents`; `RaceEvent` on a 128-slot ring in `race/eventRing.ts`).
   - The sim never touches rendering, audio, or camera. Presentation consumes events → FX, audio, shake, story.
   - Entities are exposed as read-only `snapshots()` (plain serializable data).

3. **The Director makes the sim watchable.**
   - Both have an **entertainment meter** scoring spectacle from events: `EntertainmentTracker` (actor/target score tables + crowd shouts) and `EntertainmentMeter` (impulse/drain + hype). Almost identical inventions, independently.
   - Both have an autonomous camera: `StageCamera.updateDirector(...)` with focus/interest/auto-recover-after-8s-idle (Lanista); race chase camera (Apex).
   - Both turn events into a story ticker.

4. **Thin chrome.**
   - Content-as-code validated at boot (`data/validate.ts`, kit tests).
   - Versioned localStorage saves with migration (`lanista.season.v2` / `apex-save-v1`).
   - Hand-rolled UI kits with theme tokens (DOM kit in Lanista `ui/dom.ts`; Canvas kit in Apex `ui/components.impl.ts`).
   - Both games are "autobattlers": the player is a meta-manager (lineup/doctrina/gear ↔ driver/parts/setup) plus one trivial live input.

### 2.2 Cross-port learnings (design debt to fix in greenfield)

**Lanista → Apex:**
- Director camera with interest points + auto-recover (Apex's spectating should be this good)
- Per-entity crowd favor 0–1 + live crowd shouts (Apex has one global hype number)
- RNG state snapshot/resume (`getSeedState()`) — enables checkpoints/replays
- Offline idle recovery with "While you were away…" notes
- Cross-season legacy meta (separate legacy save key)
- Live gear visuals on a mannequin (stats and looks separate systems on one entity)
- Lab mode with reroll seeds
- Balance CLI (`npm run sim:balance`)

**Apex → Lanista:**
- Robust SaveManager: storage probe, corrupt-reset with fresh state + one-shot toast warning, structural validation on load
- The full events → spectacle → audio loop (crowd synth driven by the entertainment meter)
- Scene stack with fades (push/replace/back) instead of a Mode union
- Boot diagnostics: registry validation + deferred determinism check
- Ghost/replay traces
- Onboarding hints with persisted flags (vs static help panel)
- Headless instant sim (speedMult up to 50×)
- Options scene (per-bus volumes)
- Charts for results/standings

**Top three overall (highest value):** SaveManager robustness, the spectator audio loop, splittable RNG streams.

---

## 3. The engine core

### 3.1 The four layers

```
src/
  sim/      # pure, deterministic, headless
    rng.ts          mulberry32 + split-stream API + state capture
    world.ts        entity container, tick loop, spawn specs, snapshots
    events.ts       typed event ring (kind, actor, target, detail, tick, seq)
    save.ts         versioned keys + migration helpers
  director/ # spectacle — consumes snapshots + events only
    camera.ts       framing/focus/interest/auto-recover (space-agnostic)
    spectacle.ts    event → score meter (the entertainment tables)
    story.ts        event → commentary/alerts
    feel.ts         hit-stop, shake, speed ramping
  shell/    # thin chrome
    boot.ts         RAF loop, fixed-step accumulator, visibility pause
    input.ts        pointer/keyboard abstraction, click-vs-drag
    viewport.ts     visualViewport pinning, DPR resize
    scenes.ts       scene/mode manager (stack, Esc semantics, fades)
    ui/             DOM kit: button, card, row, modal, toast, slider, chart
    theme.ts        CSS tokens
  present/  # per-game, not engine: renderer adapter + content + wiring
```

### 3.2 The four abstractions (what a "hundred genres" share)

1. **Spaces** — where entities live, one contract (spatial queries: `nearest`, `withinRadius`):
   - `plane` — arena (Lanista combat, sea battle, Rimworld, Kenshi, Total War battlefields)
   - `curve` — track/racing line (Apex; rivers, convoy lanes, chases)
   - `grid` — hex/cell (Rimworld base building, Total War campaign, creature tamer)
   - `graph` — nodes/links (pirate overworld, Kenshi travel map, Total War provinces, idle clickers, football fixtures)

2. **Time scales** — nested, all fixed-tick, all deterministic:
   - campaign tick (1 per in-game day — economy, offers, morale, aging, offline idle)
   - battle tick (the watchable sim — Lanista 60Hz, sea battle ~20Hz)
   - agent tick (cheap low-frequency loop for large populations — Kenshi towns, colonies)

3. **Domains** — self-contained seeded sims that compose:
   - `{ config (seeded) → headless sim → result }`, nothing leaks in or out.
   - Lanista's `createQuickMatch`/`Match` and Apex's `RaceConfig`/`RaceDirector` already *are* domains; composition is the new part.
   - Pirate example: sea battle contains a boarding skirmish; both summoned from the overworld encounter.

4. **The Director as the narrative layer** — genre-agnostic storytelling: Lanista crowd shouts, Rimworld alert feeds, Total War event popups, and the pirate battle narrator are the same module with different skins. Includes a pluggable audio-hook slot (ocean ambience + cannon crack for pirates; crowd synth for Lanista).

### 3.3 Clocks, not time models (the time unification)

**Both templates already run the same primitive — they differ only in who advances the counter.** Lanista's campaign `season.day` advances on player actions; Apex's race clock advances every frame via dt; both are *an integer clock advanced by a driver*.

```
Clock   — integer counter. advance(n). All the sim ever sees.
step(state, input) → state  — pure function. Time is just advance(1).
Driver  — decides WHEN to advance. Swappable per clock.
```

| Driver | Who advances | Example |
|---|---|---|
| `wallClock` | fixed-step accumulator from RAF dt | Apex race, Lanista fight, pirate sea travel |
| `action` | only when the player resolves something | Lanista campaign, menus |
| `scheduler` | at scheduled tick offsets | economy events, weather, faction wars |
| `offline` | on save-load, catching up ticks | Lanista `idle.ts` → pirate provisioning |
| `fastForward` | as many ticks as possible, headless | balance harness, auto-resolved trades |

**Rules that keep it robust:**
- A domain is spawned from a parent with config + seed; runs on its own clock; returns a result. Parent never touches child internals.
- **Every domain gets its own RNG stream** (`rng.split(parentSeed, domainId)`) — a battle never changes the economy's rolls.
- A domain's entire state is `config + seed + tick count` → replay/save-mid-battle is trivially rebuildable.
- Wall clock only ever touches presentation (the shell) — enforced by a dev guard ("no Math.random / Date.now in sim").

### 3.4 Determinism contract

- **Test harnesses** (synthetic battles, synthetic economies): seed-replay determinism, fingerprint hashes — this is where exact reproducibility lives.
- **Live world** (wall-clock driven): input-log replay (`state snapshot + inputs + dt` — the ghost-store pattern generalized). Gives "replay this day exactly."
- Sim boundary: snapshots only, no class instances, no Maps keyed by object identity, string entity ids (Apex's) over int ids (Lanista's), typed event schema `{kind, actor, target, detail, tick, seq}` + severity for story-tier filtering.

---

## 4. The pirate game — core design decision: a fully persistent sim

**No separation between overworld and combat. Combat happens ON the overworld. Towns are region sub-sims (lite Banished).**

Proven ancestors: Sid Meier's **Pirates! (2004)** (seamless sailing + combat + boarding), **Port Royale** (persistent Caribbean, production chains, fleets), **Rimworld** (persistent sim with tactical pause), **Banished** (the town sim, run at ~10% weight).

### 4.1 The architecture

- **One world space** — a geographic plane (the Caribbean). Ships, fleets, convoys, patrols move continuously. Combat is *spatial*: when dispositions bring ships together they fight where they meet. Camera dollies map-view → combat-view (a director job, not a loading screen).
- **Combat as a pure function** — `stepCombat(state, input, dt)`. In the world it's what runs at high tick rate near the player. The same function powers the headless balance harness with seeded synthetic encounters. Determinism for testing never depends on the live world.
- **Tick-rate LOD, not nested worlds** — one world clock; every entity has a tick budget:
  - Ships near player: ~20Hz
  - Ships mid-sea: every few sim-seconds
  - Towns: hourly rollup
  - Crew skirmishes: 60Hz fighter sim, **world tactically paused** (the Rimworld pause)
- **Towns as region sub-sims (Banished-lite)** — each settlement: population, hunger, housing, production buildings, storage, labor, on an hourly schedule. No pathfinding/jobs micro-sim. Interact by trading, hiring, raiding, building (later).
- **The world never stops** — tab-away = pause; offline catch-up = the `offline` driver with a "While you were ashore…" note (capped).

### 4.2 Honest costs (chosen knowingly)

1. **Live-world determinism is input-log replay**, not seed replay. Seed determinism moves to the test harnesses — where it's actually needed.
2. **v0.3 grows** (~1.5× the instanced design): spatial director, tick-LOD, continuous NPC fleet movement. Absorbed by keeping v0.3's scope tight (no towns, no raiding).
3. **Save = world snapshot + event log.** Made trivial by the snapshot-only sim boundary. (Rimworld proves this pattern.)

### 4.3 Boarding

- Start **abstract** (crew-vs-crew odds) in v0.1.
- Upgrade to a **visible nested Skirmish domain** (Lanista fighter engine) as a tactical-pause sub-view.
- The 60Hz crew fight over a live 20Hz sea battle is where complexity starts lying to you — keep boarding as a frozen-world moment.

---

## 5. The economy

### 5.1 Simulate the economics, let routes *emerge*. Never pre-set.

Pre-set routes are correct-looking and dead. The historical trade web fell out of comparative advantage, geography, and demand. **The simulation reproducing history (the sugar triangle emerging) is the test that the math is right.**

The trick: **bounded information.** NPC merchants are not omniscient:
- Each merchant ship: cargo, cash, home port, **price memory** (real prices for visited ports, rumor-level for others), risk profile (a Spanish merchant won't sail into Tortuga; a smuggler will).
- Routing = "best expected profit given what I believe," computed per departure with noise.
- Convoys form on profitable routes; routes shift under blockades (prices spike elsewhere); hurricanes wipe harvests → grain ships appear where never scripted; war → ships stop coming → smuggling surges.

The player is a market participant: buy 100 units of sugar in Havana → price rises; raid the convoy lane → Santo Domingo starves a little.

### 5.2 The abstraction line: "simulate flows, abstract frontiers"

**Fully simulated (the backbone):**
- **Prices** — emergent from supply/demand + transport, never scripted
- **Production chains** — plantation → raw → processing → port → export; ticked production entities with inputs, labor, yield variance, hurricane damage
- **Transport** — ships as the bloodstream; cargo is *goods in motion* (makes blockades and piracy bite)
- **Demand** — population, businesses (taverns, shipwrights), ship crews, Europe
- **Labor** — historical accuracy forces it in: enslaved / free / indentured labor differ in cost and productivity. Model the mechanic soberly as factors in the production function.
- **Player feedback** — every transaction moves a price

**Abstracted (deliberately):**
- **Europe** — the sink/source frontier: elastic demand curves for Caribbean goods, convoy spawn point, shock generator (war, embargoes). No population sim; but sinking a convoy makes Europe's demand respond and the system ripples.
- **Settlers as a statistical population** — each town is a seeded population distribution (count, demographics, needs) driving demand and labor. Individual settlers exist as deterministic agents with needs, ticked hourly in bulk (a million cheap ops per hourly tick is nothing), **presented** (rendered, lived-in) only when the camera is on their town. Mathematically 100% simulated; visually Banished-lite where you look.
- **Farming** — plantation-scale production entities, not per-plant.
- **Businesses** — consuming agents with input/output functions.

### 5.3 The economy harness

Same treatment as combat: run N headless years, assert invariants:
- Prices bounded and mean-reverting
- No stock explosions
- No mass starvation without cause
- Trade volumes within historical tolerance bands
- Route shifts after scripted blockades
- Closed loop verified: production → transport → consumption → prices → production/routing decisions

---

## 6. Full system list (the 1.0 vision)

### Overworld (World domain)
- Real Caribbean map: Florida → Mexico → NE South America, all islands. Coastlines as hand-tuned polygon data (content-as-code); procedural islands, shoals, minor keys fill in.
- Ports as nodes (capitals, minor settlements, pirate havens, native villages), sea lanes as links.
- Sailing with navigation (course, speed from wind), day/night, calms, trade winds, currents.
- NPC ships visible and moving: merchants, patrols, convoys, other pirates — each with a **disposition** (flee/engage/patrol/convoy-guard).
- **Weather domain**: hurricanes that sink fleets, storms forcing evasion checks, calms.
- **Exploration**: undiscovered islands, treasure charts, wrecks, reefs. The map starts partially unknown.
- **Faction territory and hostility**: Spanish Main vs neutral waters vs pirate havens.

### Combat (SeaBattle — pure function)
- Ship-to-ship skirmish, zoomed into a patch of ocean, spawned from overworld disposition.
- Ships: hull, sails, crew, morale pools; momentum, wind; broadside arcs and stern/bow fire; chain/grape/round shot; fires, sinking, striking, capture.
- Captain AI (Apex DriverBrain pattern: fallible autopilots with skill/bravery/focus/determination) driving Lanista-style intentions (CHASE / BREACH / EVADE / WHEEL).
- Boarding: abstract first, visible nested skirmish later (tactical pause).
- Director: sea camera, spectacle meter, story ticker, procedural ocean ambience + cannon/boarding audio.
- Repair-in-battle (crew to pumps/sails) — tactical spend.

### Ships & customization
- Historical hull classes: sloop → brig → schooner → frigate → galleon → man-o'-war (distinct size, guns, crew, speed, cargo).
- **Layered customization** (recommended):
  1. Pirates!-style components with real tradeoffs (hull, battery, rigging, figurehead, quarters — each feeds the balance harness like Apex parts feed mass/aero)
  2. Personalization layer: name, procedural sail patterns, paint, flags (Lanista armory/mannequin precedent)
  3. **Stretch — the deck-plan grid**: place batteries along the hull, affecting firing arcs and mass. Creative enough to be the signature mechanic; a design risk → Phase 2 decision, not a Phase 2 promise.
- **Procedural ship mesh from hull class + components** — every ship renders its loadout.
- Fleet management: multiple fleets with **autonomous trade routing** (assign routes, they earn while you play).

### Economy (the 100%-simulated endgame)
- Commodities: sugar, rum, tobacco, indigo, cotton, timber, fish, salt, iron, gold/silver, food, water.
- Full production chains: plantations/cattle → processing (sugar → molasses → rum) → storage → port → export.
- Individual settlers with hunger and needs (agent ticks).
- Emergent price formation; smuggling as a parallel contraband market.
- Contracts, convoy missions, monopolies, blockades, **prize courts** (legal capture-and-sell for privateering).
- **Provisioning**: food/water per voyage, rations, scurvy — a real survival loop between ports.
- Upkeep: pay, repairs, ammunition, careening.

### RPG layer
- Crew roster (Lanista roster pattern): officers + sailors with traits, temperament, skills, morale, injuries, aging, relationships.
- XP from battle spectacle (entertainment score → XP).
- Captain: reputation, bounties, faction standing (per-nation + pirate), **death = new captain with crew/ship legacy carry**.
- Missions from governors, navy contracts, treasure charts, native alliances (offers/contracts pattern).
- Alignment spectrum: pirate / privateer / merchant — changes who fights you and what you earn.

### Meta systems
- Three-key save (options / run / legacy) with migration + corrupt-reset (Apex SaveManager pattern).
- Boot diagnostics: content validation + determinism fingerprint per domain + headless smoke runs.
- Sandbox mode: instant sea battle with reroll seeds (Lanista lab mode).
- Onboarding hints (Apex pattern) + How-to-Play + **captain's logbook** (journey history, flavor, objectives).
- Options (audio buses, difficulty, game speed), mobile support, accessibility basics.
- Procedural sea-shanty audio for menus/voyages.

---

## 7. Development strategy: skirmish sandbox first, then grow outward

The skirmish mode and the world's spatial combat are **the same pure function with different shells** (exactly how Lanista's Instant-Match lab and campaign fights both call `createQuickMatch`). No divergence risk, no duplicated code.

1. **v0.1 — the skirmish sandbox.** 2 ships, wind, broadsides, capture/sink, director camera, audio, reroll seeds. Simultaneously: the dev harness, the balance-harness host, and the player-facing quick-battle mode. Combat is developed here, in isolation.
2. **v0.3A — the island test.** A *corner of the real geography* (Bahamas, or Cuba's north coast): 2 ports, basic trade menu, 2–3 NPC merchants with price memory, sailing between ports, first spatial combat embedded in the world. Proves: world clock, tick-LOD, encounters from disposition, dolly camera, world save.
3. **v0.3B — grow it into Cuba**, then outwards. **Every expansion step is content, not architecture**: coastline polygons, port definitions, commodity endowments, faction presence. The engine never changes; the data grows. Nothing is thrown away.
4. **v0.4+ — factions and economy accrete on the live world.**

Ordering discipline: **combat first** (the pure function everything embeds); **island test second** (smallest proof of the persistent world); **economy in stages** (its math only matters once transport exists to carry it). Every stage ships playable — a spiral of prototypes, not a canyon of infrastructure.

---

## 8. Version timeline to 1.0

| Version | Name | Delivered | Proves in the engine |
|---|---|---|---|
| **v0.1** | The Skirmish | `stepCombat` pure function + headless harness + skirmish sandbox (2–6 ships, wind, broadsides, strike/capture/sink, abstract boarding, director camera + spectacle + audio, reroll) | Second `plane` space with momentum; domain/pure-function contract |
| **v0.2** | The Fleet | Hull classes + components + personalization; design store; loadout-aware balance harness | Visual systems decoupled from stats; feel gates for loadouts |
| **v0.3** | The Sea | Seamless world: geography data, graph + rendering, continuous sailing, spatial combat, dispositions, weather, day/night, tick-LOD, camera dolly, world save | **Nested clocks** — the engine's core claim |
| **v0.3A** | The Island Test | Corner of real map, 2 ports, basic trade, NPC merchants, spatial combat | Smallest proof of the persistent world |
| **v0.3B** | Cuba & Beyond | Grow the map content-outward, factions + relations, disposition plumbing | Map growth is content, not architecture |
| **v0.4** | The Trade | Economy v1: commodities, port supply/demand, contracts, smuggling, provisioning, upkeep | Economy as a domain under the world clock |
| **v0.5** | The Crew | Full roster RPG: officers, skills, morale, injuries, aging, XP, reputation, faction standing, privateer/pirate alignment | Roster sims + legacy meta |
| **v0.6** | The Colonies | Economy v2 — the 100% sim: settlers, hunger, production chains, transport, emergent prices, historically accurate commodity web, Europe frontier | Agent ticks + needs pools (the Kenshi/Rimworld seed) |
| **v0.7** | The Pirates | Multiple fleets, autonomous trade routing, blockades, faction wars, pirate havens, exploration/treasure | Many concurrent worlds+domains; mid-encounter save |
| **v1.0** | The Caribbean | Integration, balance, onboarding, legacy meta, performance budgets, mobile pass, full save/load | The complete engine: proven adaptable |

---

## 9. Future avenues (the engine's horizon)

| Future game | Engine pieces it leans on | The one new piece it needs |
|---|---|---|
| **Kenshi-like** | graph travel + agent ticks + economy domain + roster sims | agent *needs* (hunger/sleep) as pools; job system; grid space for towns |
| **Rimworld clone** | colony = roster + buildings + events→story director; real-time-pause = fixed tick + speed control | grid space + building entities + the "storyteller" as a director variant |
| **Total War** | campaign graph + battlefield plane domains (nested, massively) | army-group entities on the graph; formations in the plane space; **many** concurrent domains |
| **Idle clicker** | economy domain + campaign tick + offline idle + headless fast-forward | nothing structural — just content (the engine's floor) |
| **Football manager** | Lanista season loop + match domain + roster sims | abstract match sim suffices (pitch space optional) |
| **Turn-based tactics** | plane space + entity pools + deterministic RNG | discrete action queue instead of continuous ticks (the sim contract hides this) |
| **SWAT game** | plan-then-watch mission flow + roster sims | mission/plan domain |
| **Creature autobattler** | Lanista fight sim, nearly 1:1 | content only |
| **Navy autobattler** | sea battle domain, nearly 1:1 | content only |
| **Space mining strategy** | economy + fleet sim + encounter autobattles | content only |

**Design rules that cost nothing now but keep every door open:**
1. Splittable RNG streams — never one shared stream.
2. String entity ids; typed event schema with severity.
3. Snapshot-only sim boundary.
4. Every domain gets `runHeadless` + fingerprint determinism check + boot diagnostics (scaffold rule, not afterthought).
5. Entities are typed data with pools, not game-specific classes — a ship, a fighter, a Kenshi citizen all have pools.
6. The Director is a separate module with a pluggable audio-hook slot.
7. Nested domain summons are a normal call (`campaign.spawnDomain(config)`) — Total War scale = spawn 40 in parallel.

**Deliberately NOT built now (anti-YAGNI):** hex grid, agent jobs, formations, TBS action queues, multiplayer. They are design contracts, not code.

---

## 10. Open decisions

| Decision | Lean | Notes |
|---|---|---|
| v0.3A factions? | **Yes, factions early** (e.g., Spanish vs English port, basic standing) | Cheap; proves disposition/relations plumbing on the smallest stage |
| Boarding visible or abstract? | Abstract first; visible nested skirmish as v0.1 stretch | Visible proves nesting and is more fun |
| Deck-plan grid inventory | Stretch, Phase 2 decision | Could be the signature mechanic; design risk |
| Sea battle tick rate | ~20Hz, 2–6 ships, designed for up to 12 | Ships are slow; 60Hz is wasted |
| Bundle size policy | 1MB soft ceiling, low single-digit MB target | Zero-assets philosophy keeps it lean |
| Engine distribution | Copy-in folder or git subtree per game | Both games are standalone GH-pages repos; version by content, not semver |

---

## 11. Next steps

1. Draft the `Clock` / `Driver` interfaces (wallClock / action / scheduler / offline / fastForward) — exact types that make nested clocks painless.
2. Draft the `World` entity model (pools, needs, tick budgets, LOD rates).
3. Draft the `SeaBattle` domain's config / state / event schema.
4. Scaffold the engine skeleton (`sim` / `director` / `shell` / `present`) with the skirmish sandbox as the first playable slice.

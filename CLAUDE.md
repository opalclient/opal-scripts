# CLAUDE.md — Working in opal-scripts

The AI-integration / AI-contribution guide for this repo. Goal: give an
assistant enough context to write a correct, idiomatic example script on the
first try. For a structured index of every file, also load [llms.txt](llms.txt).

## What this is

A public gallery of standalone `.js` example scripts for Opal, a Minecraft
utility client with a GraalVM JavaScript scripting engine. There is no build
step, no package.json, and no bundler — each file in `core/`, `character/`,
`world/`, `ui/`, and `combo/` is loaded directly by the running client. The
"stack" is: plain ES6+ JavaScript, plus the proxy globals the engine injects
(`client`, `player`, `world`, `movement`, `rotation`, `inventory`, `renderer`,
`overlay`, `esp`, `modules`, `notification`, `palette`, `mc`, `keys`, and a
few bound Java types like `BlockPos`/`Vec2f`/`MAIN_HAND`).

## The 30-second mental model

```javascript
const script = registerScript({ name: "MyScript", version: "1.0.0", authors: ["you"] });

script.registerModule({ name: "MyModule", description: "..." }, (module) => {
    // 1. Settings — declared synchronously, before any module.on(...) call.
    module.addBool("Enabled Thing", true);
    module.addNumber("Range", 24, 4, 64, 1);
    module.addMode("Style", ["A", "B"]);
    module.addGroup("Group Name", ["Enabled Thing", "Range"]);

    // 2. Lifecycle — fire once per toggle, no argument.
    module.on("enable", () => { /* spawn islands, reset state */ });
    module.on("disable", () => { /* tear down islands, restore state */ });

    // 3. Logic — 20/sec, before vanilla tick logic runs.
    module.on("preGameTick", (event) => {
        if (mc.player === null || mc.world === null) return; // ALWAYS first line
        // read module.getBool/getNumber/getMode(...) live, every tick
    });

    // 4. Rendering — only valid inside renderScreen / an island's render /
    //    a palette view's render. Colors ALWAYS via renderer.color(r,g,b[,a]).
    module.on("renderScreen", () => {
        renderer.roundedRect(10, 10, 100, 20, 4, renderer.color(20, 20, 28, 160));
    });
});
```

A single script can register any mix of: modules (ClickGUI feature toggles),
Dynamic Islands (`overlay.createIsland`), and command-palette views
(`palette.createView`, a full mini-app surface). Every example in this repo
does at least one of those three things end to end.

## The patterns that matter

- **Null-guard first, every time.** `mc.player`/`mc.world` are `null` in
  menus and loading screens. The first line of every `preGameTick` and most
  `renderScreen` handlers in this repo is
  `if (mc.player === null || mc.world === null) return;`.
- **Settings before handlers, always.** All `addBool`/`addNumber`/`addMode`
  calls happen synchronously at the top of the `registerModule` callback,
  before any `module.on(...)`. `addGroup` comes after the settings it groups.
- **Colors are built, never hex-literal.** `renderer.color(r, g, b[, a])`
  (channels 0-255) — **never** a raw `0xAARRGGBB` literal. JavaScript has one
  number type (a 64-bit double); a color literal with alpha ≥ `0x80` is
  larger than `2^31` and truncates to the wrong `int` when narrowed on the
  Java side. This is the single most common mistake a script can make, and
  every file in this repo builds colors through `renderer.color(...)` (or
  `renderer.withAlpha`/`applyOpacity`/`interpolate`/`darker`/`brighter`) for
  exactly that reason.
- **`Vec3d`/`Vec3i` are opaque — pass them, never read them.** A raw vector
  returned by `player.getEyePosition()`, `player.getVelocity()`, or
  `rotation.getRotationVector(...)` cannot have its `.getX()/.getY()/.getZ()`
  called from script-land (Fabric intermediary mappings rename them at
  runtime). Pass it straight into another proxy method
  (`rotation.getRotationFromPosition(pos)`, `esp.projectVec(pos, dt)`) or use
  `player.getBlockPosition()` instead, which returns a readable `BlockPos`.
  `character/AutoToolSwitcher.js` and `combo/GroundScanner.js` both exist
  specifically to demonstrate the block-arithmetic workaround this forces.
- **Edge-trigger, don't level-trigger, a tick-rate poll.** A condition
  checked 20 times a second will fire 20 toasts a second unless you track
  "have I already acted on this?" and only act on the transition. See
  `core/MilestoneToasts.js` and `combo/GroundScanner.js`.
- **A module owns what it disables.** If a module toggles a *different*
  module off (`core/ModuleGuard.js`, or `AutoSprintExample.js`/`AutoStew.js`
  in Opal's own bundled scripts), track whether *this script* was the one
  that turned it off before ever turning it back on — never assume ownership
  of a setting the player controls manually.
- **Palette views are their own render surface.** `palette.createView({ id,
  render(x, y, w, h, dt), keyPressed, ... })` gets a `dt` that is real
  wall-clock seconds (clamped to 0.1s), not a tick. Anything time-based in a
  palette view (`ui/ReactionTester.js`, `ui/StatsDashboard.js`) accumulates
  `dt`, it does not assume a fixed 1/20s step the way `preGameTick` logic can.

## Pitfalls to avoid

- Don't invent an API that isn't documented. If you're tempted to write
  `entity.getHealth()`, `world.getTargetedBlock()`, or a signed bearing/angle
  to another entity — none of these exist in the scripting API. Say so in the
  script's header comment and design around the gap (see `combo/CombatHud.js`
  and `character/AutoToolSwitcher.js` for the pattern: name the missing API,
  explain the workaround, ship something real instead of something that
  silently no-ops or throws at runtime).
- Don't call `setCancelled()` on a non-cancellable event (`attack`, `swing`,
  `postMove`, any render event) — it throws. Check the cancellable-events
  table in Opal's `events.mdx` before wiring a new event handler.
- Don't add a setting after the `addGroup` call that references it — a group
  member must already exist when `addGroup` runs, or it's silently dropped.
- Don't hardcode a personal filesystem path, a private repo URL, or any
  business/pricing fact about Opal into a script or doc in this repo — see
  `SECURITY.md`/`CONTRIBUTING.md` for what's in and out of scope.
- Don't skip the header comment on a new script. Every file needs: what it
  does, which globals/events it uses, and one honest gotcha — that's the
  entire value proposition of this repo.

## Conventions

- 4-space indentation, one script per file, header comment block at the top
  (see any existing file in `core/`, `character/`, `world/`, `ui/`, `combo/`
  for the shape).
- JSDoc on non-trivial helper functions (params + returns), matching the
  style already in the gallery.
- No lint/format tooling is wired up (no package.json) — `node --check
  path/to/Script.js` is the syntax gate CI runs; run it locally before
  committing a new script.
- Tests: `tests/` holds a real Node (`node:test`) suite, but it only covers
  what's testable outside the game engine — pure helper functions with no
  proxy-global dependencies (tick/clock math, damage formulas, string-keyword
  heuristics). `tests/opal-stub.js` installs minimal fakes of the engine
  globals so a script's top-level `registerScript(...)` call doesn't throw
  under plain Node; a script that wants to be testable exports its pure
  helpers with a guarded `if (typeof module !== "undefined" && module.exports)
  module.exports = { ... };` at the very bottom (see `DayCycleClock.js`,
  `FallWarning.js`, `AutoToolSwitcher.js` for the pattern). Render/tick logic
  that only makes sense inside a live Opal client is out of scope for this
  suite — that gets exercised by actually running the script in-game before
  opening a PR (see CONTRIBUTING.md). Run the suite with
  `node --test tests/*.test.js`.
- Commits: Conventional Commits, scoped to the folder when it helps
  (`feat(world): add ...`). **You own your commits, including code an AI
  wrote — no AI-attribution trailers.**

## Pointers

- [README.md](README.md) — install instructions + the full categorized script index.
- [llms.txt](llms.txt) — link-per-file index of this repo.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add a new script, PR workflow, commit policy.
- [CHANGELOG.md](CHANGELOG.md) — released and unreleased changes.

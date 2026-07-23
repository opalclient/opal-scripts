# CLAUDE.md — Working in scripts

The AI-integration / AI-contribution guide for this repo. Goal: give an
assistant enough context to write a correct, idiomatic script on the first
try. For a structured index of every file, also load [llms.txt](llms.txt).

## What this is

The official public home of scripts for Opal, a Minecraft utility client
with a GraalVM JavaScript scripting engine. It's a **bun workspace**, not a
loose pile of files:

```
scripts/<id>/            one folder per script — manifest.json, package.json,
                          src/<entry>, optional tests/
packages/
  opal-types/             opal-globals.d.ts — canonical ambient types for
                           every proxy global (single source of truth)
  stub/                   createOpalStub() — the shared sandbox stub tests
                          load a built script against
template/                 copy this to start a new TypeScript script
tools/                    build.mjs / validate-manifest.mjs /
                          publish-safety.mjs / test.mjs — the CLI machinery
                          behind the root `bun run` scripts
```

Each script's entry file (`.js` or `.ts`) is what actually runs in the
client — it's `esbuild`-bundled to a single IIFE (`dist/<id>.js`) that the
sandbox `eval`s directly, no ESM at runtime. The "stack" inside a script is
still: plain ES6+ (or typed TS, compiled away by the bundler), plus the proxy
globals the engine injects (`client`, `player`, `world`, `movement`,
`rotation`, `inventory`, `renderer`, `overlay`, `esp`, `modules`,
`notification`, `palette`, `storage`, `mc`, `keys`, and a few bound Java
types like `BlockPos`/`Vec2f`/`MAIN_HAND`).

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
        if (mc.getPlayer() === null || mc.getWorld() === null) return; // ALWAYS first line
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
(`palette.createView`, a full mini-app surface). [Chomp](scripts/chomp/) is
the extreme case — one script running as both a module and a palette view
off a shared engine.

## The patterns that matter

- **Null-guard first, every time.** There is no player or world in menus and
  loading screens. The first line of every `preGameTick` and most
  `renderScreen` handlers in this repo is
  `if (mc.getPlayer() === null || mc.getWorld() === null) return;`.
  **It is `mc.getPlayer()`, never `mc.player`.** The sandbox does no
  bean-property mapping, so the property form reads `undefined` — and
  `undefined === null` is `false`, which means a `mc.player === null` guard
  silently never fires. (Exported *fields* do read as properties, which is
  why `mc.interactionManager` is spelled without a call.)
- **Settings before handlers, always.** All `addBool`/`addNumber`/`addMode`
  calls happen synchronously at the top of the `registerModule` callback,
  before any `module.on(...)`. `addGroup` comes after the settings it groups.
- **Colors are built, never hex-literal.** `renderer.color(r, g, b[, a])`
  (channels 0-255) — **never** a raw `0xAARRGGBB` literal. JavaScript has one
  number type (a 64-bit double); a color literal with alpha ≥ `0x80` is
  larger than `2^31` and truncates to the wrong `int` when narrowed on the
  Java side. This is the single most common mistake a script can make, and
  every script in this repo builds colors through `renderer.color(...)` (or
  `renderer.withAlpha`/`applyOpacity`/`interpolate`/`darker`/`brighter`) for
  exactly that reason.
- **Vectors are `ScriptVec3` and are readable.** `player.getEyePosition()`,
  `player.getVelocity()`, and `rotation.getRotationVector(...)` hand back a
  `ScriptVec3` with real `getX()`/`getY()`/`getZ()`, plus `length()`,
  `distanceTo(v)`, `add(v)` and `subtract(v)`. You can still pass one straight
  into another proxy method (`rotation.getRotationFromPosition(pos)`,
  `esp.projectVec(pos, dt)`). Read components with the getters — **never**
  `.x`/`.y`/`.z`, which read `undefined`. `Vec3i` no longer exists; `BlockPos`
  is the integer-valued global.
- **Edge-trigger, don't level-trigger, a tick-rate poll.** A condition
  checked 20 times a second will fire 20 toasts a second unless you track
  "have I already acted on this?" and only act on the transition. See
  `scripts/milestone-toasts/` and `scripts/ground-scanner/`.
- **A module owns what it disables.** If a module toggles a *different*
  module off (`scripts/module-guard/`), track whether *this script* was the
  one that turned it off before ever turning it back on — never assume
  ownership of a setting the player controls manually.
- **Palette views are their own render surface.** `palette.createView({ id,
  render(x, y, w, h, dt), keyPressed, ... })` gets a `dt` that is real
  wall-clock seconds (clamped to 0.1s), not a tick. Anything time-based in a
  palette view (`scripts/reaction-tester/`, `scripts/stats-dashboard/`,
  `scripts/chomp/`) accumulates `dt`, it does not assume a fixed 1/20s step
  the way `preGameTick` logic can.
- **`storage` persists across sessions, per script.** `storage.set(key,
  value)` / `.get(key)` (returns `string | null` — `null` means never set,
  not `""`/`0`) / `.remove(key)` / `.keys()`. Storage is isolated per
  script — two scripts can never collide on the same key regardless of
  naming; a key prefix only matters for avoiding collisions between
  *multiple features inside one script* sharing a store. Caps: 32 keys, 8 KB
  per value, 64 KB total, keys ≤ 64 chars. See
  `packages/opal-types/opal-globals.d.ts` for the full jsdoc.

## Pitfalls to avoid

- Don't invent an API that isn't documented. Check against the proxy's
  `@HostAccess.Export` surface rather than guessing — a member without that
  annotation does not exist for scripts. If a capability is genuinely
  missing, say so in the script's header comment and design around the gap
  rather than shipping something that silently no-ops or throws at runtime.
- Don't call `cancel()` on a non-cancellable event (`attack`, `swing`,
  `postMove`, any render event) — it throws. Cancellation is `cancel()` /
  `isCancelled()`. Check the cancellable-events table in Opal's `events.mdx`
  before wiring a new handler.
- Don't give a render event handler a parameter. `renderScreen`, `renderWorld`
  and `renderBloom` pass a memberless record — every accessor on it throws.
  Take no arguments and use `client.getTickDelta()`.
- Don't add a setting after the `addGroup` call that references it — a group
  member must already exist when `addGroup` runs, or it's silently dropped.
- Don't hardcode a personal filesystem path, a private repo URL, or any
  business/pricing fact about Opal into a script or doc in this repo —
  `bun run validate` runs `tools/publish-safety.mjs`, which greps every
  tracked file for exactly this (see below).
- Don't skip the header comment on a new script. Every file needs: what it
  does, which globals/events it uses, and one honest gotcha.

## Manifest schema

Every `scripts/<id>/manifest.json` (checked by
`tools/validate-manifest.mjs`):

```json
{
  "id": "chomp",
  "name": "Chomp",
  "version": "1.1.0",
  "authors": ["trq"],
  "description": "Roguelite arcade game for the command palette.",
  "category": "ui",
  "entry": "src/Chomp.js"
}
```

- `id`: kebab-case, unique, **must equal the folder name**.
- `version`: semver — this is what a `<id>@<version>` release tag validates
  against (see `.github/workflows/release.yml`).
- `category`: one of `character | combo | core | ui | world`.
- `entry`: repo-relative path within the folder (`.js` or `.ts`); must exist.
- `template/` is a reserved id, always skipped by the validator — it is a
  scaffold, not a real script, and is never releasable.

## Tools and the test isolation model

- `tools/build.mjs` — bundles `manifest.entry` to `scripts/<id>/dist/<id>.js`
  via esbuild (`--bundle --format=iife --target=es2022`), enforcing a 1 MB
  cap. `bun run build` (no arg) builds every folder; `bun run build <id>`
  builds one; `node tools/build.mjs template` builds the template scaffold
  (never part of the bulk loop).
- `tools/test.mjs` — runs every `scripts/<id>/tests/*.test.{js,mjs}` (or a
  bare `tests/harness.{js,mjs}`, Chomp's shape) **in its own child process**,
  one `node <file>` per test file. This is deliberate, not incidental: every
  test installs the Opal globals onto `globalThis` via
  `createOpalStub().installGlobals()`, and an earlier whole-process runner
  let whichever file imported last silently overwrite every earlier file's
  globals before any test body ran. One process per file gives every file
  its own untouched `globalThis`, module cache, and (for Chomp) frozen
  `Date.now`/seeded `Math.random` — the isolation the stub's "one stub per
  test file" contract assumes.
- `tools/validate-manifest.mjs` — the manifest schema above, plus
  folder/`id` uniqueness.
- `tools/publish-safety.mjs` — see below.
- A gallery script's test `require()`s its `../src/<Entry>.js` directly
  (after `createOpalStub().installGlobals()`) — plain JS needs no build step
  to test. The template's TypeScript pattern is the exception: `main.ts`
  only exists as compiled output, so its test evals the **built bundle** via
  `createOpalStub().evalScript(path)`. Run `bun run build <id>` (or
  `check:template`) first for a TS script; `tools/test.mjs` itself has no
  build dependency — it just spawns whichever `tests/*.test.{js,mjs}` files
  already exist.

## Template copy-safety

`template/tsconfig.json` **inlines** every `compilerOptions` value from
`tsconfig.base.json` by hand instead of `"extends": "../tsconfig.base.json"`.
This is deliberate: `template/` is meant to be copied wholesale to
`scripts/<id>/`, and a relative `extends` path resolves against the copy's
new location, not the original — it breaks (`TS5083`, file not found) at any
depth other than where `template/` itself lives. If `tsconfig.base.json`
ever changes, mirror the change into `template/tsconfig.json` by hand. The
`"types": ["@opal-scripts/opal-types"]` entry does survive a copy unmodified
— package resolution is name-based (via the workspace symlink), not
path-based, so it re-links correctly once the copied `package.json`'s
`"name"` is renamed and `bun install` runs again.

## Publish-safety rules

This is a **public** repo; `tools/publish-safety.mjs` (part of
`bun run validate`) greps every git-tracked file for three things and fails
the build on a hit:

1. **Machine paths** — Windows drive-letter user paths, `/home/`, `/Users/`,
   `~/` followed by a real path segment. Never commit a personal filesystem
   path in a script, doc, or example.
2. **Credential-shaped tokens** — Stripe/AWS/GitHub/Slack key shapes, PEM
   private key headers, JWT-shaped strings.
3. **AI-attribution commit trailers** — a `Co-Authored-By:`-shaped line
   naming a well-known coding assistant, pasted verbatim into a tracked
   file. (This doc's own prose about the rule is written to not trip it.)

Also never mention internal infrastructure, product/pricing facts, or
anything beyond the technical, example-focused scope of this repo — see
[CONTRIBUTING.md](CONTRIBUTING.md)'s review criteria.

## Conventions

- 4-space indentation, one script per folder, header comment block at the
  top of the entry file (see any existing `scripts/<id>/src/` for the shape).
- JSDoc on non-trivial helper functions (params + returns), matching the
  style already in the gallery.
- `bun run lint` (Biome) covers `tools/`, `packages/`, and `template/`.
  Script folders under `scripts/` aren't Biome-linted individually today —
  match the existing style by hand.
- Tests: `packages/stub`'s `createOpalStub()` installs the sandbox globals
  onto `globalThis`. A script exports its pure helpers the same way as
  before — a guarded
  `if (typeof module !== "undefined" && module.exports) module.exports = { ... };`
  at the bottom of the source file — and its test at
  `scripts/<id>/tests/*.test.js` `require()`s that source module directly
  out of `src/`, right after installing the globals. TypeScript scripts
  (the template pattern) are the one exception: there's no `require()` path
  for a `.ts` file, so that test builds first and evals the built
  `dist/<id>.js` bundle through `stub.evalScript()` instead. Render/tick
  logic that only makes sense inside a live Opal client is out of scope for
  this suite — that gets exercised by actually running the script in-game
  before opening a PR. Run one folder's tests with `bun run test <id>`, or
  everything with `bun run test`.
- Commits: Conventional Commits, scoped to the script id when it helps
  (`feat(scripts): add ...`). **You own your commits, including code an AI
  wrote — no AI-attribution trailers.**

## Pointers

- [README.md](README.md) — install instructions, layout, and the full script table.
- [llms.txt](llms.txt) — link-per-file index of this repo.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to add a new script, PR workflow, review criteria, commit policy.
- [CHANGELOG.md](CHANGELOG.md) — released and unreleased changes.

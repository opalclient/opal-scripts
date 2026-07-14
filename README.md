# opal-scripts

> A curated gallery of example scripts for [Opal](https://opal.wtf)'s GraalVM
> JavaScript scripting engine: real, runnable, well-commented `.js` files you
> can copy from and remix, organized so you can find "the thing closest to
> what I want to build."

## What this is

Opal's scripting engine loads plain `.js` files from an `opal/scripts/`
folder and exposes a curated set of proxy globals (`client`, `player`,
`world`, `renderer`, `palette`, ...) onto the running Minecraft client. This
repo is the "read the source to learn" corpus for that engine. Think of it
like the WordPress Plugin Directory or a script-repository site for a game
utility client: every file here is a complete, working example, not a
snippet fragment.

Every script has a header comment explaining what it does, which globals and
events it uses, and any gotcha worth knowing before you copy the pattern.

## What this is not

- Not the scripting engine itself, and not the full API reference. That
  lives in Opal's own docs (linked from each script's header where relevant).
- Not a place for one-off snippets. Every file here is a complete, working
  module you could actually enable.
- Not a source of product/pricing/business facts about Opal. This repo is
  purely technical and example-focused.

## Quickstart

```
1. Pick a script from the table below.
2. Copy the .js file into your Opal install's opal/scripts/ folder.
3. In-game, run:  .script reload
4. Open the ClickGUI (Scripts category) and enable the module.
```

Scripts downloaded from the public gallery through Opal's own dashboard land
in a quarantine folder, `opal/scripts/pending/`, which the loader skips
entirely: nothing there executes until you explicitly **Trust & run** it
in-game, at which point it moves into `opal/scripts/` and loads normally.
Files copied straight from this repo onto disk go directly into
`opal/scripts/` (there is no repo-to-client automation here; you're reading
the source and choosing to run it, which is the point).

<!-- prettier-ignore -->
> [!NOTE]
> Opal scripts run sandboxed: the engine grants access only to the documented
> proxy API, with no filesystem access, no thread creation, and no reflection
> into the wider client. Community scripts still stay quarantined until you
> Trust & run them, since sandboxing limits what a script can *do*, not
> whether it should be running on your account at all. Read a script before
> you run it, including the ones in this repo.

## Structure

```
opal-scripts/
├── core/         client, notification, overlay, and modules proxies
├── character/    player, movement, rotation, and inventory proxies
├── world/        world and esp proxies
├── ui/           renderer and palette (command-palette view) proxies
├── combo/        scripts that deliberately wire several proxies together
└── tests/        Node test-runner suite for the pure, engine-independent
                  helper functions a few scripts export (see CLAUDE.md)
```

Run the test suite with `node --test tests/*.test.js`. No install step needed;
it uses Node's built-in test runner.

## Examples

### core/: client, notifications, overlay, modules

| Script | What it shows |
|---|---|
| [MilestoneToasts.js](core/MilestoneToasts.js) | Toast notifications for fall survival, low/full health, and sprint streaks, with edge-triggered state tracking so each milestone fires once, not every tick. |
| [SessionIsland.js](core/SessionIsland.js) | A Dynamic Island showing session playtime and live enabled-module count, with an 8-dot "alive" ring animation. |
| [ModuleGuard.js](core/ModuleGuard.js) | A configurable version of the docs' "disable Flight when KillAura is active" pattern: pick any Watch/Guard module pair, with auto-restore. |

### character/: player, movement, rotation, inventory

| Script | What it shows |
|---|---|
| [AutoToolSwitcher.js](character/AutoToolSwitcher.js) | Silently switches to the best hotbar tool for the block you're facing, and documents exactly why a real crosshair raycast isn't reachable from script-land. |
| [SprintSpeedHud.js](character/SprintSpeedHud.js) | A corner HUD panel with a live speed number, sprint indicator, and a fixed-timestep sparkline history. |
| [LookAssist.js](character/LookAssist.js) | Smooth-looks at the nearest living entity in an FOV cone, composing the rotation proxy's anti-detection helpers (`patchConstantRotation`) on top of `setSmooth`. |
| [FallWarning.js](character/FallWarning.js) | Warns before a fall lands if the (deliberately approximate) estimated damage looks dangerous, with a pulsing screen-edge vignette. |

### world/: world, esp

| Script | What it shows |
|---|---|
| [NameTagEsp.js](world/NameTagEsp.js) | Floating nameplate-pill ESP tags (name + distance) that fade toward the edge of their range, instead of a bounding-box outline. |
| [DayCycleClock.js](world/DayCycleClock.js) | A Dynamic Island clock that converts `world.getTimeOfDay()` ticks into a real 24h/12h time, with a day/night gradient progress bar. |

### ui/: renderer, palette

| Script | What it shows |
|---|---|
| [HudPanelShowcase.js](ui/HudPanelShowcase.js) | A pure renderer-proxy showcase: gradients, the Path API, composite glow/shadow/blur effects, and the color helper functions. No gameplay logic at all. |
| [ReactionTester.js](ui/ReactionTester.js) | **Flagship palette view #1.** A reflex-timing mini-game: wait for green, react fast, track your best and rolling average. |
| [StatsDashboard.js](ui/StatsDashboard.js) | **Flagship palette view #2.** A live, read-only stat-tracking dashboard: health, position, dimension, FPS, and speed, with rolling sparkline graphs. |

### combo/: several proxies wired together

| Script | What it shows |
|---|---|
| [CombatHud.js](combo/CombatHud.js) | A combat-awareness HUD combining `esp` + `player` + `world` + `rotation`: target box, distance, an FOV-offset gauge, and your own crit/weapon status. Also explains why there's no target health bar. |
| [GroundScanner.js](combo/GroundScanner.js) | Scans straight down from your feet for the nearest solid block using plain `BlockPos` arithmetic, warning before you step over a dangerous drop. |

## For AI agents

This repo is structured so an AI coding assistant can work in it in a single
pass:

- **[CLAUDE.md](CLAUDE.md)**: the mental model. What a script looks like,
  the settings/event conventions, the color-construction gotcha, and the
  pitfalls the scripting API's constraints invite.
- **[llms.txt](llms.txt)**: a structured, link-per-file index of every
  script and doc in this repo.
- Every script's header comment is written to be self-contained: read the
  header before reading the body, and you'll know which globals/events it
  touches and why it's built the way it is.

If you're an agent: load `CLAUDE.md` and `llms.txt` before writing a new
script. Follow the commit policy in [CONTRIBUTING.md](CONTRIBUTING.md):
Conventional Commits, and you own your commits (no AI-attribution trailers).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a new example script.
This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md); please report vulnerabilities privately.

## License

MIT, see [LICENSE](LICENSE).

# scripts

> The official public home of [Opal](https://opal.wtf) scripts: a curated
> gallery, a TypeScript template to build your own, and a PR-based
> contribution pipeline with CI gates — managed like a script marketplace,
> Raycast-extensions-style.

## What this is

Opal's scripting engine loads plain `.js` files from an `opal/scripts/`
folder and exposes a curated set of proxy globals (`client`, `player`,
`world`, `renderer`, `palette`, `storage`, ...) onto the running Minecraft
client. This repo is where every official script is built, tested, and
released from: one folder per script, a canonical set of API typings, a
shared test stub, and CI that has to go green before anything merges.

Every script has a manifest (name, category, description) and a header
comment explaining what it does, which globals and events it uses, and any
gotcha worth knowing before you copy the pattern.

## What this is not

- Not the scripting engine itself, and not the full API reference. That
  lives in Opal's own docs (linked from each script's header where relevant).
- Not a place for one-off snippets. Every folder here is a complete,
  installable script.
- Not a source of product/pricing/business facts about Opal. This repo is
  purely technical and example-focused.

## Layout

```
scripts/<id>/            one folder per script
  manifest.json           client-facing metadata (name, version, category, entry, ...)
  package.json            workspace member, "@opal-scripts/<id>"
  src/                     entry point per manifest.entry (.js or .ts)
  tests/                   optional; runs against packages/stub in CI
packages/
  opal-types/             canonical opal-globals.d.ts — single source of truth
                           for the scripting API's ambient types
  stub/                   shared sandbox stub (createOpalStub) that lets a
                           test load and drive a built script outside a live client
template/                 copy this folder to start a new TypeScript script —
                           typechecked, bundled, and tested the same as every
                           other folder
tools/                    build.mjs / validate-manifest.mjs / publish-safety.mjs / test.mjs
                          — the CLI machinery behind the root `bun run` scripts
```

`category` is a manifest field (`character | combo | core | ui | world`), not
a folder — every script lives at `scripts/<id>/` regardless of what it's
categorized as.

## Installing a script

1. **Download a release bundle** — every tagged release (`<id>@<version>`)
   attaches a single built file, `<id>.js`, to its GitHub Release. Grab it
   and drop it into your Opal install's `opal/scripts/` folder.
2. **Or build it yourself** — clone the repo, run `bun install`, then
   `bun run build <id>` to produce `scripts/<id>/dist/<id>.js`, and copy that
   file into `opal/scripts/` the same way.

Either way, run `.script reload` in-game, then enable the script from the
ClickGUI's Scripts category (or open it from the command palette, for
scripts that ship a palette view — like [Chomp](scripts/chomp/)).

<!-- prettier-ignore -->
> [!NOTE]
> Opal scripts run sandboxed: the engine grants access only to the
> documented proxy API, with no filesystem access, no thread creation, and no
> reflection into the wider client. Scripts downloaded through Opal's own
> in-client dashboard still land in a quarantine folder
> (`opal/scripts/pending/`) that the loader skips entirely until you
> explicitly **Trust & run** them — sandboxing limits what a script can *do*,
> not whether it should be running on your account at all. Read a script
> before you run it, including the ones in this repo.

## Creating a script

1. **Copy the template**: `cp -r template scripts/my-cool-script` (kebab-case,
   matching your script's `id`).
2. **Rename the manifest and package**: `scripts/my-cool-script/manifest.json`
   (`id`, `name`, `version`, `authors`, `description`, `category`) and
   `scripts/my-cool-script/package.json` (`"name": "@opal-scripts/my-cool-script"`).
3. **Install and write it**: `bun install`, then edit `src/main.ts`. Every
   Opal global is typed ambiently by `@opal-scripts/opal-types` — nothing to
   import. Prefer plain JavaScript? Copy any existing `scripts/<id>/` folder
   instead and drop the `tsconfig.json` — the build/test tools work with either.
4. **Typecheck, build, and test**:
   ```bash
   bunx tsc --noEmit -p scripts/my-cool-script   # if you kept the tsconfig
   bun run build my-cool-script                   # -> dist/my-cool-script.js
   bun run test my-cool-script                     # runs tests/*
   ```
5. **Open a PR** — see [CONTRIBUTING.md](CONTRIBUTING.md) for the full
   checklist and review criteria.

See [template/README.md](template/README.md) for the full copy-folder
walkthrough.

## CI gates

Every pull request and every push to `main` runs, in this order:
`validate` (manifest schema + publish-safety) → `lint` (Biome) →
`typecheck` (the template scaffold, plus any script folder that carries its
own `tsconfig.json`) → `build` (every script bundles via esbuild, 1 MB cap
each) → `test` (every `scripts/<id>/tests/*`, isolated per file) →
`check:template` (the template scaffold, built/typechecked/tested end to
end). All six have to pass before human review. See
[.github/workflows/ci.yml](.github/workflows/ci.yml).

Tagging `<id>@<version>` (matching that script's manifest version) builds
and publishes a GitHub Release with the bundle attached — see
[.github/workflows/release.yml](.github/workflows/release.yml).

### What the test suite cannot tell you

`packages/stub` fakes the scripting globals so a built script can be loaded
and driven under plain Node/Bun. **It cannot prove a sandbox denial** — it
involves no host object and no GraalVM context. A member the stub answers
may still be completely unreachable in-game. The real gate for API *shape*
is the sandbox test in the `opal` client repo, which evals through a live
Graal context against real host objects under the actual `HostAccess.EXPLICIT`
policy. The stub models the real contract — collections are `ScriptList`-shaped,
there are no bean properties, and reading an unexported member throws — but
that only narrows the gap, it does not close it. When you add a script,
check the method you are calling against
[`packages/opal-types`](packages/opal-types/opal-globals.d.ts) (the
canonical ambient types, jsdoc'd per member) and the client's own in-app
scripting documentation, not against the stub's behavior alone.

## Scripts

**[Chomp](scripts/chomp/)** is the flagship: a full roguelite arcade
micro-game (rounds, perks, elites, mutators, meta progression) that doubles
as a teaching example for every scripting surface at once, backed by a
deterministic 326-check test harness. See its own
[README](scripts/chomp/README.md) for controls and systems.

| ID | Name | Category | What it does |
|---|---|---|---|
| [`chomp`](scripts/chomp/) | Chomp ★ | ui | Roguelite arcade micro-game for the command palette. |
| [`milestone-toasts`](scripts/milestone-toasts/) | Milestone Toasts | core | Pops a toast for fall survival, low/full health, and sprint streaks. |
| [`packet-no-fall`](scripts/packet-no-fall/) | Packet No Fall | character | Spoofs `onGround` in the movement packet while falling, so the server never sees a fall landing. |
| [`reaction-tester`](scripts/reaction-tester/) | Reaction Tester | ui | A reflex-timing mini-game hosted in the command palette. |

## For AI agents

This repo is structured so an AI coding assistant can work in it in a single
pass:

- **[CLAUDE.md](CLAUDE.md)**: the mental model — layout, tools, the test
  isolation model, the manifest schema, and the scripting API's pitfalls.
- **[llms.txt](llms.txt)**: a structured, link-per-file index of every
  script and doc in this repo.
- Every script's header comment is self-contained: read the header before
  the body, and you'll know which globals/events it touches and why it's
  built the way it is.

Key commands: `bun run validate`, `bun run lint`, `bun run build [id]`,
`bun run test [id]`, `bun run check:template`. Load `CLAUDE.md` and
`llms.txt` before writing a new script, then follow the commit policy in
[CONTRIBUTING.md](CONTRIBUTING.md): Conventional Commits, and you own your
commits (no AI-attribution trailers).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add a new script or fix an
existing one. This project follows the
[Contributor Covenant 2.1](CODE_OF_CONDUCT.md).

## Security

See [SECURITY.md](SECURITY.md); please report vulnerabilities privately.

## License

MIT, see [LICENSE](LICENSE).

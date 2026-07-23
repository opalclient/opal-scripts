# Template — TypeScript script scaffold

Copy this whole folder to start a new Opal script written in TypeScript,
type-checked against `@opal-scripts/opal-types` and bundled with the rest of
this repo's tooling. (Prefer plain JavaScript? Copy `scripts/milestone-toasts/`
instead and drop the `tsconfig.json` — the build/test tools work with either.)

## Quickstart

1. **Copy the folder**, naming it after your script's kebab-case id:

   ```bash
   cp -r template scripts/my-cool-script
   ```

2. **Rename the manifest.** Edit `scripts/my-cool-script/manifest.json`:
   - `id` → `"my-cool-script"` (must equal the folder name)
   - `name` → your script's display name
   - `version`, `authors`, `description` → yours
   - `entry` stays `"src/main.ts"` unless you also rename the file

3. **Rename the package.** Edit `scripts/my-cool-script/package.json`'s
   `"name"` to `"@opal-scripts/my-cool-script"`. Keep the
   `@opal-scripts/opal-types` and `@opal-scripts/stub` dependencies.

4. **Install and write your script.** From the repo root:

   ```bash
   bun install
   ```

   Then edit `src/main.ts`. Every Opal global (`registerScript`, `player`,
   `renderer`, `storage`, `keys`, ...) is typed ambiently by
   `@opal-scripts/opal-types` — there is nothing to import. The starter file's
   comments walk through the three basics: a settings-backed module, a
   `renderScreen` draw, and a `storage`-persisted value.

5. **Typecheck, build, and test:**

   ```bash
   bunx tsc --noEmit -p scripts/my-cool-script     # typecheck
   bun run build my-cool-script                    # -> dist/my-cool-script.js
   bun run test my-cool-script                      # runs tests/*
   ```

6. **Write a test.** Copy `tests/main.test.js` into your folder, point
   `DIST_PATH` at your own `dist/<id>.js`, and rewrite the assertions for
   your module's own settings, handlers, and storage keys. Like this
   template, your test needs a build first, since there's no `require()`
   path for a `.ts` file — it evals the *built* bundle via
   `stub.evalScript`, not the TypeScript source. (Gallery `.js` scripts test
   differently: their tests `require()` `../src/<Entry>.js` directly, no
   build needed. `tools/test.mjs` itself just runs whichever
   `scripts/*/tests/*` files exist — it has no build step of its own.)

## Verifying the template itself

Before copying, `bun run check:template` (from the repo root) builds the
template, typechecks it, and runs its own test end-to-end — the one command
a change to `template/` itself should stay green under.

## Before opening a pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full checklist (manifest
accuracy, tests for nontrivial logic, publish-safety, testing in a real Opal
client). CI runs `validate`, `lint`, a per-folder `tsc --noEmit`, `build`, and
`test` on every pull request.

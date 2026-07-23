# Contributing to scripts

Thanks for considering a contribution. Bug reports, feature requests, new
scripts, and docs improvements are all welcome.

## Quick start

```bash
git clone https://github.com/opalclient/scripts.git
cd scripts
bun install
bun run validate && bun run lint && bun run build && bun run test
```

That's most of the gate CI runs — CI also typechecks every `tsconfig.json`
in the repo (`bunx tsc --noEmit -p <dir>`, template included) and runs
`bun run check:template` to build/typecheck/test the template scaffold end
to end; run both locally too if you touched TypeScript or `template/`. See
[CLAUDE.md](CLAUDE.md) for the repo's mental model and
[Opal's scripting docs](https://opal.wtf/docs/scripting) for the full API
reference.

## Ways to contribute

| Kind | Process |
|------|---------|
| Bug report | Open an issue using the *Bug report* template. |
| Feature request / new script idea | Open a *Feature request* issue describing the script. |
| Security vulnerability | **Do not open a public issue.** See [SECURITY.md](SECURITY.md). |
| Pull request (new script or fix) | Fork, branch off `main`, open a PR. See below. |

## Adding a new script

1. **Copy `template/`** to `scripts/<your-id>/` (kebab-case, matching the
   `id` you'll put in the manifest) — the fastest path to a typechecked,
   bundled, tested TypeScript script. Prefer plain JavaScript? Copy any
   existing `scripts/<id>/` folder instead and drop the `tsconfig.json`; the
   build/test tools work with either. See [template/README.md](template/README.md)
   for the full copy-folder walkthrough.
2. **Fill in `manifest.json`**: `id` (equals the folder name), `name`,
   `version` (semver, start at `1.0.0`), `authors`, `description`, `category`
   (one of `character | combo | core | ui | world`), `entry` (repo-relative
   path to your entry file within the folder).
3. **Rename `package.json`**'s `"name"` to `"@opal-scripts/<your-id>"`. Keep
   `private: true`.
4. **One script, one purpose.** Keep it focused — the gallery works because
   each folder is a clean answer to "how do I do X".
5. **Every script needs:**
   - A header comment block: what it does, which globals/events it uses, and
     any gotcha a reader should know before copying the pattern.
   - A settings block where it makes sense (`addBool` / `addNumber` /
     `addMode` / `addGroup`) — a realistic, configurable module, not a toy.
   - Null-guards before touching `player` / `world` / `inventory`:
     `if (mc.getPlayer() === null || mc.getWorld() === null) return;` — the
     call form, never `mc.player`, which reads `undefined` and never guards.
   - Colors built with `renderer.color(r, g, b[, a])` — never a raw
     `0xAARRGGBB` literal (see [CLAUDE.md](CLAUDE.md) for why).
   - `authors` in both `registerScript({ ... })` and `manifest.json` set to
     your name/handle.
6. **Write a test for nontrivial logic.** If your script has a genuinely
   pure helper function (math, string formatting, keyword matching) or a
   render/tick handler worth asserting on, add a test under `tests/` that
   builds against `@opal-scripts/stub` (see `scripts/*/tests/` for the
   pattern, or `template/tests/main.test.js` for a from-scratch one). A
   script that is only ever manually smoke-tested is a harder review.
7. **Test it in a real Opal client** before opening a PR — a script that only
   typechecks and bundles but has never actually run in-game is not ready.
8. **Update the README** — add a row to the script table.
9. **Update `llms.txt`** — add a link-per-file entry for your script.
10. **Update `CHANGELOG.md`** under `[Unreleased]`.

## Pull request workflow

1. **Discuss first** for anything beyond a typo or one-line fix — open an
   issue describing the script idea and which proxies it exercises.
2. **Fork** and create a branch: `feat/short-description` or
   `fix/short-description`.
3. **Run the local gate** before pushing:
   ```bash
   bun run validate && bun run lint && bun run build <your-id> && bun run test <your-id>
   ```
   If you touched the template, also run `bun run check:template`.
4. **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/)
   (see below).
5. **PR description**: explain *why*, not just *what*. Link the issue
   (`Fixes #123`) if there is one.
6. **CI has to be green** — `validate`, `lint`, `typecheck`, `build`, `test`,
   and `check:template` all run on every PR (see
   [.github/workflows/ci.yml](.github/workflows/ci.yml)).
7. **Human review** — every PR needs a review from CODEOWNERS
   (`@trqlmao`) before merge.
8. **One script (or one logical change) per PR** when reasonable.

### Review criteria

A reviewer is checking for:

- **Sandbox-API-only.** The script only touches the documented proxy globals
  — no attempt to reach an un-exported member, `Java.type(...)`, or anything
  outside `HostAccess.EXPLICIT`. See [SECURITY.md](SECURITY.md) for the
  sandbox model.
- **No obfuscated code.** Reviewers, and downstream users learning from your
  script, need to read it plainly. Minified or deliberately unreadable code
  is rejected regardless of what it does.
- **Tests for nontrivial logic.** Pure helpers and anything asserting on
  render/tick output need a test under `tests/`; a script's header comment
  is not a substitute for CI catching a regression.
- **Manifest accuracy.** `id`, `category`, `version`, and `description`
  actually describe the script — this is what the README table and
  tagged releases are built from.
- **Publish-safe.** No machine paths, no real secrets/tokens/account IDs, no
  invented product/pricing/business facts about Opal, no AI-attribution
  commit trailers. `bun run validate` runs the same publish-safety grep CI
  does; run it locally first.

## Commit messages

Every commit subject **must** follow Conventional Commits:

```
<type>(<optional scope>): <imperative summary, lowercase, no period>

<optional body — wrap at ~72 chars — explain the why>

<optional Fixes #123 or BREAKING CHANGE: ... footer>
```

### Accepted types

`feat`, `fix`, `docs`, `style`, `fmt`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`.

A new script is typically `feat(scripts): add <id>` (or a scope matching its
category, e.g. `feat(world): add day-cycle-clock`).

### Hard rules

- Subject under ~72 chars; body wrapped at ~72 chars per line.
- Lowercase after the colon (`feat: add foo`, not `feat: Add foo`).
- No trailing period in the subject; imperative mood (`add`, not `added`).
- One logical change per commit; split if multiple types fit.
- Breaking changes add `!` after the type/scope and a `BREAKING CHANGE:` footer.
- **You own every commit, including code an AI wrote.** Do **not** add a
  `Co-Authored-By: Claude …` (or any AI-attribution) trailer. AI assistance is
  a tool, not a co-author — you are accountable for the code you ship.

## Coding conventions

- Match the style already in the gallery: a header comment block, settings
  declared before any `module.on(...)` calls, JSDoc on non-trivial helper
  functions, and 4-space indentation (see `.editorconfig`).
- TypeScript scripts (anything with a `tsconfig.json`) typecheck under the
  strict compiler options in `tsconfig.base.json` — the per-folder
  `tsc --noEmit` has to pass. `bun run lint` (Biome) covers `tools/`,
  `packages/`, and `template/` only; `scripts/**` isn't Biome-linted
  individually today, so match the existing style by hand there.
- No obfuscation — reviewers (and downstream users learning from your script)
  need to read the code plainly.
- No network calls, no filesystem access outside what the Opal APIs expose,
  and nothing that does anything a reader wouldn't expect from the header
  comment. See [SECURITY.md](SECURITY.md).
- Do not invent product/pricing/business facts about Opal in comments or
  descriptions — keep everything technical and example-focused.

## Local commands

```bash
bun install                     # install the workspace
bun run validate                # manifest schema + publish-safety
bun run lint                    # Biome
bun run build [id]              # bundle one script, or every script
bun run test [id]                # run one script's tests, or every script's
bun run check:template           # build + typecheck + test template/ end to end
bunx tsc --noEmit -p scripts/<id>   # typecheck a script that has a tsconfig.json
```

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By
participating, you agree to abide by it.

## License

By contributing, you agree that your contributions are licensed under the
project's [LICENSE](LICENSE) (MIT).

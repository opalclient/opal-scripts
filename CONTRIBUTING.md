# Contributing to opal-scripts

Thanks for considering a contribution. Bug reports, feature requests, new
example scripts, and docs improvements are all welcome.

## Quick start

```bash
git clone https://github.com/opalclient/opal-scripts.git
cd opal-scripts
# Try a script: copy one file into your Opal install's scripts/ folder,
# then run `.script reload` in-game. See README.md for the full walkthrough.
```

There is no build step. Every example is a standalone `.js` file loaded
directly by Opal's GraalVM scripting engine — see [CLAUDE.md](CLAUDE.md) for
the mental model and [Opal's scripting docs](https://opal.wtf/docs/scripting)
for the full API reference.

## Ways to contribute

| Kind | Process |
|------|---------|
| Bug report | Open an issue using the *Bug report* template. |
| Feature request / new example idea | Open a *Feature request* issue describing the script and which folder it belongs in. |
| Security vulnerability | **Do not open a public issue.** See [SECURITY.md](SECURITY.md). |
| Pull request (new script or fix) | Fork, branch off `main`, open a PR. See below. |

## Adding a new example script

1. **Pick the right folder** by the primary proxy it teaches: `core/` (client,
   notification, overlay, modules), `character/` (player, movement, rotation,
   inventory, interaction), `world/` (world, esp), `ui/` (renderer, palette),
   or `combo/` (scripts that deliberately combine several proxies).
2. **One script, one purpose.** Keep it focused — the gallery works because
   each file is a clean answer to "how do I do X".
3. **Every script needs:**
   - A header comment block: what it does, which globals/events it uses, and
     any gotcha a reader should know before copying the pattern.
   - A settings block where it makes sense (`addBool` / `addNumber` /
     `addMode` / `addGroup`) — a realistic, configurable module, not a toy.
   - Null-guards before touching `player` / `world` / `inventory`:
     `if (mc.getPlayer() === null || mc.getWorld() === null) return;` — the
     call form, never `mc.player`, which reads `undefined` and never guards.
   - Colors built with `renderer.color(r, g, b[, a])` — never a raw
     `0xAARRGGBB` literal (see [CLAUDE.md](CLAUDE.md) for why).
   - `authors` in `registerScript({ ... })` set to your name/handle.
4. **If your script has a genuinely pure helper function** (math, string
   formatting, keyword matching — anything with no `player`/`world`/`renderer`
   dependency), export it with a guarded
   `if (typeof module !== "undefined" && module.exports) module.exports = { ... };`
   at the bottom of the file and add a matching test under `tests/`. See
   `world/DayCycleClock.js` + `tests/DayCycleClock.test.js` for the pattern,
   and [CLAUDE.md](CLAUDE.md) for why this is the testable slice of a script.
5. **Test it in a real Opal client** before opening a PR — a script that only
   compiles but has never actually been run in-game is not ready.
6. **Update the README** — add a row to the category table for your script.
7. **Update `llms.txt`** — add a link-per-file entry for your script.

## Pull request workflow

1. **Discuss first** for anything beyond a typo or one-line fix — open an
   issue describing the script idea and which proxies it exercises.
2. **Fork** and create a branch: `feat/short-description` or
   `fix/short-description`.
3. **Run `node --check path/to/YourScript.js`** locally — this is the same
   syntax gate CI runs, and it's the fastest way to catch a typo before push.
   If you added or changed a pure helper, also run
   `node --test tests/*.test.js`.
4. **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/)
   (see below).
5. **PR description**: explain *why*, not just *what*. Link the issue
   (`Fixes #123`) if there is one.
6. **One script (or one logical change) per PR** when reasonable.

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

A new example script is typically `feat(examples): add <ScriptName>` (or a
scope matching its folder, e.g. `feat(world): add NameTagEsp`).

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
- No obfuscation — reviewers (and downstream users learning from your script)
  need to read the code plainly.
- No network calls, no filesystem access outside what the Opal APIs expose,
  and nothing that does anything a reader wouldn't expect from the header
  comment. See [SECURITY.md](SECURITY.md).
- Do not invent product/pricing/business facts about Opal in comments or
  descriptions — keep everything technical and example-focused.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). By
participating, you agree to abide by it.

## License

By contributing, you agree that your contributions are licensed under the
project's [LICENSE](LICENSE) (MIT).

<!--
Thanks for the pull request! Please read CONTRIBUTING.md first.
For anything beyond a typo or one-line fix, open an issue first to agree on the
approach.
-->

## What

<!-- One or two sentences describing the change (new script? fix to an existing one? governance update?). -->

## Why

<!-- The motivation. Link the issue (`Fixes #123`) if there is one. -->

## How

<!-- Brief notes on the approach, especially anything non-obvious. -->

## Checklist

- [ ] Every new/changed script has a header comment (what it does, which globals/events it uses, gotchas)
- [ ] Colors are built with `renderer.color(...)`, never raw `0xAARRGGBB` literals
- [ ] `mc.getPlayer()` / `mc.getWorld()` results are null-checked (the call form — never the `mc.player` property, which is not exposed)
- [ ] The script has a realistic settings block (`addBool`/`addNumber`/`addMode`/`addGroup`) where it makes sense
- [ ] `manifest.json` is accurate (`id` equals the folder name, `category`, `version`, `description`)
- [ ] `bun run validate && bun run lint && bun run build <id> && bun run test <id>` passes locally
- [ ] A test was added under `tests/` for any nontrivial pure helper or asserted render/tick output
- [ ] The README's script table is updated if a script was added, renamed, or removed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No machine paths, real secrets/account IDs, or personal info in the diff
- [ ] Commits follow Conventional Commits with no AI-attribution trailer

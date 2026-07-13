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

- [ ] Every new/changed `.js` file has a header comment (what it does, which globals/events it uses, gotchas)
- [ ] Colors are built with `renderer.color(...)`, never raw `0xAARRGGBB` literals
- [ ] `mc.player` / `mc.world` are null-guarded before use
- [ ] The script has a realistic settings block (`addBool`/`addNumber`/`addMode`/`addGroup`) where it makes sense
- [ ] `node --check path/to/Script.js` passes locally
- [ ] The README's table of contents is updated if a script was added, renamed, or removed
- [ ] `CHANGELOG.md` updated under `[Unreleased]`
- [ ] No machine paths, real secrets/account IDs, or personal info in the diff
- [ ] Commits follow Conventional Commits with no AI-attribution trailer

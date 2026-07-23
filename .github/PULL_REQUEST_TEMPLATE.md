<!--
This template doubles as a submission wizard. Fill in the ONE section below
that matches your change and delete the other two, then work through the
gate checklist before requesting review.

For anything beyond a typo or one-line fix, open an issue first (the
"Submit a script" form is fine for this) to agree on the approach.
-->

## What kind of change is this?

<!-- Keep one of the three sections below, delete the other two. -->

### New script?

- Script id / folder: `scripts/<id>`
- Category: character / combo / core / ui / world
- One-line description:
- What it uses from the Opal API:

### Update?

- Script id: `scripts/<id>`
- What changed and why:
- Version bump: `<old>` → `<new>` (in both `manifest.json` and `package.json`)

### Tooling / docs / CI change?

- What changed and why:
- Anything downstream that needed updating alongside it (README table,
  `llms.txt`, `CLAUDE.md`, CHANGELOG):

## Gate checklist

This mirrors what CI runs, in order — check each box after running it
locally (see [CONTRIBUTING.md](../CONTRIBUTING.md#local-commands)):

- [ ] **validate** — `bun run validate` passes (manifest schema + the
      publish-safety grep: no machine paths, no real secrets/account IDs)
- [ ] **lint** — `bun run lint` (Biome) is clean
- [ ] **typecheck** — if this touches TypeScript: `bunx tsc --noEmit -p
      scripts/<id>` passes, and the `tsconfig.json` is copied from
      `template/tsconfig.json` unmodified (self-contained, not
      `extends`-based — see the comment in that file for why)
- [ ] **build** — `bun run build <id>` succeeds and the bundle stays under
      the 1 MB cap
- [ ] **tests** — `bun run test <id>` passes; any nontrivial pure helper or
      asserted render/tick output has a test under `tests/`
- [ ] **manifest accurate** — `id` equals the folder name, and
      `category`/`version`/`description`/`entry` are all correct
- [ ] `bun run check:template` passes, if `template/` was touched
- [ ] README's script table / `llms.txt` / `CHANGELOG.md` updated, if a
      script was added, renamed, or removed
- [ ] No machine paths, real secrets/account IDs, or personal info in the diff
- [ ] Commits follow Conventional Commits, no AI-attribution trailer

## What the bot comment means

Once CI finishes, a sticky comment on this PR lists each gate above as
pass/fail/skipped. It's a convenience summary, not a substitute for the
checks themselves — merge still needs every required check green plus a
CODEOWNERS review. On PRs from forks the comment may not show up (the
default token is read-only there); the checks still run and still gate the
merge either way.

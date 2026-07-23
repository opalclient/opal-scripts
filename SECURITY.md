# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.** Report it
privately via [Opal's private security advisory](https://github.com/opalclient/scripts/security/advisories/new)
for this repository. If advisories are unavailable, use the private contact in
the org's support channel.

If you have leaked your own credentials while using this project, rotate them
at the provider immediately, then let us know so we can help.

## What counts as a vulnerability here

This repo is a **static gallery of example scripts** for Opal's GraalVM
scripting engine. There is no server and no credential handling of its own.
It does have a build pipeline — a bun workspace that esbuild-bundles each
`scripts/<id>/` folder to a single IIFE, gated by CI (validate, lint,
typecheck, build, test) on every pull request — but that pipeline only
produces the same plain `.js` a script author could hand-write; it does not
change the trust model below. The relevant reports are:

- A script in this gallery that does something its header/description does
  not disclose (hidden network calls, credential harvesting, obfuscated
  logic, or anything that would surprise a user who read the file before
  running it).
- A documented API pattern in a script here that is actually unsafe or
  misleading in a way that could cause a downstream user harm if copied.
- A dependency CVE in the workspace's own tooling deps (`@biomejs/biome`,
  `esbuild`, `typescript` — tracked in `bun.lock`) that affects contributors
  running these scripts locally.
- A **sandbox escape** — a script reaching a host member, a class, or the
  filesystem that the policy below is supposed to deny. That is a bug in the
  engine rather than in this gallery, so report it against Opal itself, but
  report it: it is the highest-severity class here.

## How the scripting sandbox actually works

Scripts do **not** run full-trust. Opal's engine runs GraalVM JS under a
default-deny policy, and this is what makes a public gallery of scripts safe
to offer at all:

- **`HostAccess.EXPLICIT`** — a host member is reachable from a script only
  if it is annotated `@HostAccess.Export`. Nothing else is visible, including
  members of raw Minecraft types handed to a script.
- **`allowHostClassLookup(name -> false)`** — `Java.type(...)` is denied, so
  a script cannot reach arbitrary Java classes. The only class globals are
  host-curated (`Color`, `Vec3d`, `BlockPos`, `Vec2f`).
- **`IOAccess.NONE`** — no filesystem access.

Java imports being off is the deliberate design, not a limitation to work
around: it is the property that lets a stranger's script from this gallery be
run without handing it the JVM. A script that needs a capability it lacks
wants a new `@HostAccess.Export` proxy method in Opal, not a way past the
policy.

## What is *not* a security issue here

- The sandbox denying a script something — no `Java.type(...)`, no
  filesystem, no members on un-exported types. That is the intended policy
  described above, working, not a bug.
- Normal bug reports about a script not working on a given Opal build —
  open a regular issue instead.
- Disagreement with documented behavior.

## Disclosure handling

We aim to acknowledge a report within **7 days** and ship a fix (or pull the
affected script) within **30 days** for confirmed issues. Severe issues move
faster.

## Supported versions

Each `scripts/<id>/manifest.json` carries its own semver `version`, and a
release tags that exact `<id>@<version>` pair (see
`.github/workflows/release.yml`). Beyond the latest tagged release per
script, treat the `main` branch as the only supported version.

| Version | Supported |
|---------|-----------|
| `main`  | :white_check_mark: |
| older commits | :x: |

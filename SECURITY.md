# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.** Report it
privately via [Opal's private security advisory](https://github.com/opalclient/opal-scripts/security/advisories/new)
for this repository. If advisories are unavailable, use the private contact in
the org's support channel.

If you have leaked your own credentials while using this project, rotate them
at the provider immediately, then let us know so we can help.

## What counts as a vulnerability here

This repo is a **static gallery of example `.js` scripts** for Opal's
GraalVM scripting engine. There is no server, no build pipeline, and no
credential handling of its own, so the relevant reports are:

- A script in this gallery that does something its header/description does
  not disclose (hidden network calls, credential harvesting, obfuscated
  logic, or anything that would surprise a user who read the file before
  running it).
- A documented API pattern in a script here that is actually unsafe or
  misleading in a way that could cause a downstream user harm if copied.
- A dependency CVE in the optional lint tooling (if a `package.json` is
  ever added) that affects contributors.

## What is *not* a security issue here

- The fact that Opal scripts run full-trust with no sandbox — that is a
  documented, intentional property of the scripting engine itself (see
  [Opal's scripting docs](CLAUDE.md)), not a bug in this repository.
- Normal bug reports about a script not working on a given Opal build —
  open a regular issue instead.
- Disagreement with documented behavior.

## Disclosure handling

We aim to acknowledge a report within **7 days** and ship a fix (or pull the
affected script) within **30 days** for confirmed issues. Severe issues move
faster.

## Supported versions

This repo does not use semantic versioning per script; treat the `main`
branch as the only supported version.

| Version | Supported |
|---------|-----------|
| `main`  | :white_check_mark: |
| older commits | :x: |

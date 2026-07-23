# Chomp

A roguelite arcade micro-game that runs entirely inside Opal — no new client
APIs, no assets, one self-contained script. Steer a chomper through a fresh maze
every round, hoover up the pellets, dodge (or, when the power pellet pops, eat)
the ghosts, then draft a perk and dive into the next, faster maze.

It plays in two places from one shared engine:

- **Command palette view** — search the palette for **Chomp**, press Enter, and
  play a canvas-backed view that draws itself and reads the keyboard each frame.
- **Fullscreen overlay module** — enable the **Chomp** module to play over the
  HUD; it draws on the screen render pass and steers from key-press events.

It doubles as the flagship teaching example for the scripting APIs: all copy
lives in one `TEXT` table, all per-round tuning in `difficulty()`, and all colour
in the `THEMES` set, so the source reads as a catalogue of the `palette`,
`renderer`, and `storage` APIs rather than a tangle.

## Controls

| Key | Action |
| --- | --- |
| Arrow keys / WASD | Steer |
| Space or Enter | Start · confirm a perk pick |
| P | Pause / resume |
| R (twice) | Restart the run |
| Left / Right (in a draft) | Move the highlight between the three perk cards |

## Systems

- **Rounds & mazes** — every round generates a fresh, random,
  mirror-symmetric maze with four corner power pellets and wrap-around side
  tunnels. Generation is seeded, so any failure the test harness finds replays
  deterministically. A round clears when the last pellet is eaten.
- **Themes** — 14 colour themes (10 available from the start, 4 unlocked
  through meta progression). The theme rolls from a shuffle bag each round.
- **Difficulty** — one `difficulty(round)` function is the single source of
  every per-round scaling number (ghost/chomper speed, fright duration, scatter
  time, ghost-AI mistake rate). Ghost speed climbs monotonically; fright,
  scatter, and mistakes taper to zero over the first several rounds.
- **Perks & curses** — clearing a round opens a three-card draft. A pick nudges
  a run knob (speed, score multiplier, pellet value, crate luck, a shield
  charge, a tunnel toll, a once-per-round wall-chew, and more). Some cards are
  *cursed*: the perk applies twice but a curse rides along (halved pellets,
  faster ghosts, and the like).
- **Elite affixes** — from the mid rounds on, ghosts can roll an elite affix
  (tank, splitter, and others). Affixes are round-scoped: a mid-round death
  restores each ghost to the same affix it had.
- **Mutators** — later rounds can layer a board-wide mutator (asymmetric
  "funhouse" mazes, a fifth "swarm" ghost, fog/blackout overlays, and more).
- **Pickups** — resolved crates drop timed power-ups: speed, shield, double
  score, magnet, freeze, sticky, and (round 8+) reversed controls.
- **Meta progression** — runs earn **crumbs**, a persistent currency that
  claims ordered unlocks (extra perks and themes). A capped, sorted high-score
  board and lifetime stats persist across sessions.

## Storage keys

Persistence goes through a feature-detected `storage` wrapper — if `storage` is
unavailable the game runs fine, session-only, and writes nothing.

| Key | Contents |
| --- | --- |
| `chomp.meta` | Lifetime stats, crumb balance, and claimed unlocks |
| `chomp.highscores` | The capped, sorted high-score board |

## Testing

`tests/harness.js` is a deterministic plain-script harness — **326 checks** —
that boots the engine outside the client against `@opal-scripts/stub` with a
frozen clock and seeded `Math.random`, so its output is identical run to run. It
covers 300 seeded mazes (reachability, mirror symmetry, pellet floors, power
pellets), engine liveness, the difficulty curve, pickups, elites, mutators,
drafts, meta persistence, and a multi-seed stress run — plus four permanent
source-audit gates (no banned strings, storage stays behind the wrapper, the
difficulty curve is written once, no raw hex colour reaches a draw call).

```bash
bun run test chomp
```

It proves engine correctness only, never sandbox reachability — that gate lives
in the client repo's sandbox test.

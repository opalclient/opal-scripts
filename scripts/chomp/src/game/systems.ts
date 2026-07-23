// =============================================================================
//  game/systems.ts — effects, events, spawns, interactables, collision helpers.
// =============================================================================
//
//  Everything that ticks on a schedule and everything Chomp can bump into: the
//  Chomp-effect stack + its derived multipliers, the ghost-event scheduler, the
//  fruit/crate/runner spawners, the teleport pads, the pellet magnet, and the
//  per-life clear. One ticking path (updateEffects / updateSpawns) so a timed
//  value is decremented in exactly one place. Every seeded roll comes off
//  game.fx, kept OFF Math.random so the ghost-AI randomness the harness replays
//  is untouched — the numbers and their order are the original's, verbatim.
// =============================================================================

import { type Cell, COLS, inPen, maze, ROWS } from "../engine/grid";
import { canStep, DIRS, type Dir, isOpposite, move, tileOf } from "../engine/movement";
import type { VfxSystem } from "../engine/vfx";
import { sqDist } from "./ai";
import { active, TEXT } from "./config";
import { EVENTS, type GameEvent, type Knobs, PICKUPS, type Pickup } from "./content";
import type { GameState, Ghost, RunnerSpawn } from "./state";

// Spawner cadences + lifetimes, event/banner timing, pad + magnet knobs — the
// Task-6 numbers the difficulty curve does not own. Module-level so state.ts can
// read the handful it needs (applyPerks baselines, reset timers, the test hook).
export const FRUIT_EVERY = 18;
export const FRUIT_LIFE = 9;
export const CRATE_EVERY = 25;
export const CRATE_LIFE = 12;
export const RUNNER_EVERY = 45;
export const RUNNER_LIFE = 15;
export const RUNNER_ROUND = 4;
export const RUNNER_SPEED = 0.85;
export const EVENT_MIN = 20;
export const EVENT_SPAN = 10;
export const EVENT_ROUND = 2;
export const PADS_ROUND = 6;
export const PAD_COOLDOWN = 0.5;
export const BANNER_TIME = 1.8; // per-banner dwell; queued one-at-a-time, never stacked
export const MAGNET_RADIUS = 2;
export const CHILL_FREEZE = 2;

export function createSystems(game: GameState, vfx: VfxSystem) {
    // ---- Effects: one ticking path, current-multiplier helpers ----------------
    // Task 7 perks stack onto exactly these knobs (speedMult / scoreMult / shield
    // cap / crateLuck) instead of adding a parallel system.
    function hasEffect(id: string): boolean {
        for (const e of game.effects) if (e.id === id) return true;
        return false;
    }

    function recomputeMultipliers(): void {
        let sp = 1;
        if (hasEffect("speed")) sp *= 1.25;
        if (hasEffect("sticky")) sp *= 0.6;
        game.speedMult = sp;
        // The DOUBLE pickup composes multiplicatively with the folded scoreMult knob.
        const km = game.knobs ? game.knobs.scoreMult : 1;
        game.scoreMult = (hasEffect("double") ? 2 : 1) * km;
    }

    function addEffect(id: string, time: number): void {
        const ex = game.effects.find((e) => e.id === id);
        if (ex)
            ex.timeLeft = Math.max(ex.timeLeft, time); // refresh, never stack duplicates
        else game.effects.push({ id, timeLeft: time });
        recomputeMultipliers();
    }

    // A power pellet was eaten. The two event one-shots are consumed HERE, each
    // exactly once: frenzy replaces the fright with a score burst, chill adds a
    // 2 s ghost freeze on top of the normal fright.
    function triggerFright(): void {
        if (game.frenzyArmed) {
            game.frenzyArmed = false; // consumed — this pellet scores instead of frightening
            game.score += Math.round(100 * game.round * game.scoreMult);
            return;
        }
        const chill = game.chillArmed;
        game.chillArmed = false; // consumed whether or not a fright follows
        let ft = (game.knobs as Knobs).frightTime; // Long Dread / the dim curse fold in here
        if ((game.knobs as Knobs).vampire) ft += Math.floor(game.pelletsEaten / 50); // Pellet Vampire bonus
        if (ft > 0) {
            game.frightTimer = ft;
            game.eatChain = 0;
            for (const g of game.ghosts) {
                if (g.mode !== "eyes") {
                    g.mode = "fright";
                    g.tankBites = 0; // a fresh fright resets the Tank's bite counter
                    g.eatCd = 0;
                    // Classic reverse on fright.
                    g.dir = { x: -g.dir.x, y: -g.dir.y };
                    g.want = g.dir;
                }
            }
        }
        if (chill) addEffect("freeze", CHILL_FREEZE); // COLD SNAP freezes even past the fright cutoff
    }

    // Apply a resolved pickup by id. Timed entries land in game.effects; the two
    // instant ones (shield charge, and any future perk) branch by id. Guarded so a
    // late-round-only effect (reversed) can never apply below its minRound.
    function applyPickup(id: string): void {
        const entry = PICKUPS.good.find((p) => p.id === id) || PICKUPS.bad.find((p) => p.id === id);
        if (!entry) return;
        if (entry.minRound && game.round < entry.minRound) return;
        if (id === "shield") game.shield = Math.min(2, game.shield + 1);
        else addEffect(id, entry.time);
        queueBanner(entry.name, active.theme.accent);
    }

    // A mystery crate rolls good against the crateLuck knob (baseline 0.5, 0.75
    // with Loaded Dice) then a uniform effect from that column, filtered by
    // minRound so DIZZY only ever appears from round 8.
    function rollCrate(): string {
        const good = game.fx() < (game.knobs as Knobs).crateLuck;
        let col = (good ? PICKUPS.good : PICKUPS.bad).filter((p) => !p.minRound || game.round >= p.minRound);
        if (col.length === 0) col = PICKUPS.good; // bad column is empty before round 8
        return (col[(game.fx() * col.length) | 0] as Pickup).id;
    }

    function queueBanner(text: string, color: number): void {
        game.banners.push({ text, color, timeLeft: BANNER_TIME }); // only banners[0] renders — no overlap
    }

    // ---- Event scheduler ------------------------------------------------------
    function rollEvent(): void {
        const hostileProb = Math.min(0.8, 0.4 + 0.05 * game.round);
        const wantHostile = game.fx() < hostileProb;
        const pool = EVENTS.filter((e) => e.hostile === wantHostile);
        triggerEvent(pool[(game.fx() * pool.length) | 0]);
    }

    function triggerEvent(entry: GameEvent | undefined): void {
        if (!entry) return;
        game.eventsFired++;
        if (entry.id === "frenzy") {
            game.frenzyArmed = true; // one-shot, no timed event
        } else if (entry.id === "chill") {
            game.chillArmed = true; // one-shot, no timed event
        } else {
            game.event = { id: entry.id, timeLeft: entry.time };
            // Pick an eligible ghost OBJECT and store its id: the loop matches by id
            // (:g.id === game.phaseGhost), so an index would miss split minis (id
            // 100+) and the swarm ghost (id 4) whose ids are not their array slot.
            if (entry.id === "phase") {
                const eligible = game.ghosts.filter((g) => g.mode !== "eyes");
                const pick = eligible.length ? eligible : game.ghosts;
                game.phaseGhost = pick.length ? (pick[(game.fx() * pick.length) | 0] as Ghost).id : -1;
            }
        }
        queueBanner(entry.name, entry.hostile ? active.theme.danger : active.theme.accent);
    }

    // The single ticking path for every timed value Task 6 owns: Chomp effects,
    // the active event, the banner queue, and the next-event schedule.
    function updateEffects(dt: number): void {
        if (game.effects.length) {
            let changed = false;
            for (const e of game.effects) e.timeLeft -= dt;
            for (let i = game.effects.length - 1; i >= 0; i--) {
                if ((game.effects[i] as { timeLeft: number }).timeLeft <= 0) {
                    game.effects.splice(i, 1);
                    changed = true;
                }
            }
            if (changed) recomputeMultipliers();
        }

        if (game.event) {
            game.event.timeLeft -= dt;
            if (game.event.timeLeft <= 0) game.event = null;
        }

        if (game.banners.length) {
            (game.banners[0] as { timeLeft: number }).timeLeft -= dt;
            if ((game.banners[0] as { timeLeft: number }).timeLeft <= 0) game.banners.shift();
        }

        if (game.round >= EVENT_ROUND) {
            game.eventTimer -= dt;
            if (game.eventTimer <= 0) {
                rollEvent();
                game.eventTimer = EVENT_MIN + game.fx() * EVENT_SPAN; // next roll 20-30 s out
            }
        }
    }

    // ---- Spawners + interactables: one ticking path ---------------------------
    // Pick a random open, pellet-free, unoccupied, non-pen cell (or null).
    function pickFreeCell(): { c: number; r: number } | null {
        const free: { c: number; r: number }[] = [];
        for (let r = 1; r < ROWS - 1; r++) {
            const row = maze.grid[r] as Cell[];
            for (let c = 1; c < COLS - 1; c++) {
                if (row[c] !== " " || inPen(c, r)) continue;
                if (game.spawns.some((s) => s.c === c && s.r === r)) continue;
                free.push({ c, r });
            }
        }
        return free.length ? (free[(game.fx() * free.length) | 0] as { c: number; r: number }) : null;
    }

    function spawnFruit(cell?: { c: number; r: number } | null): void {
        const t = cell || pickFreeCell();
        const life = game.knobs ? game.knobs.fruitLife : FRUIT_LIFE; // Ripe Luck lengthens this
        if (t) game.spawns.push({ kind: "fruit", c: t.c, r: t.r, life });
    }

    function spawnCrate(cell?: { c: number; r: number } | null, forced?: string | null): void {
        const t = cell || pickFreeCell();
        if (t) game.spawns.push({ kind: "crate", c: t.c, r: t.r, life: CRATE_LIFE, forced: forced || null });
    }

    function spawnRunner(cell?: { c: number; r: number } | null): void {
        const t = cell || pickFreeCell();
        if (!t) return;
        game.spawns.push({
            kind: "runner",
            c: t.c,
            r: t.r,
            px: t.c,
            py: t.r,
            dir: DIRS.left,
            want: DIRS.left,
            life: RUNNER_LIFE,
            padCd: 0,
        });
    }

    // Runner flees Chomp with the smart-flee rule (maximise distance at each
    // junction) at a fixed fraction of Chomp's nominal speed. Reuses move() — no
    // second movement integrator.
    function moveRunner(s: RunnerSpawn, dt: number): void {
        const chompTile = tileOf(game.chomp);
        // Lead Boots (runnerSpeed knob) tires the runner; chompSpeed is the folded base.
        move(s, (game.knobs as Knobs).chompSpeed * (game.knobs as Knobs).runnerSpeed, dt, (e, col, row) => {
            const options: Dir[] = [];
            for (const key of ["up", "left", "down", "right"] as const) {
                const dir = DIRS[key];
                if (isOpposite(dir, e.dir)) continue;
                if (!canStep(col, row, dir)) continue;
                options.push(dir);
            }
            if (options.length === 0) {
                e.want = { x: -e.dir.x, y: -e.dir.y };
                return;
            }
            let best = options[0] as Dir;
            let far = -Infinity;
            for (const dir of options) {
                const dist = sqDist(col + dir.x, row + dir.y, chompTile);
                if (dist > far) {
                    far = dist;
                    best = dir;
                }
            }
            e.want = best;
        });
    }

    // Teleport pads: any entity centred on a pad (off cooldown) jumps to its twin
    // and takes a per-entity cooldown so it cannot immediately bounce back.
    function updatePads(dt: number): void {
        if (!game.pads) return;
        const ents: { px: number; py: number; padCd: number }[] = [game.chomp];
        for (const g of game.ghosts) ents.push(g);
        for (const s of game.spawns) if (s.kind === "runner") ents.push(s);
        for (const e of ents) {
            if (e.padCd > 0) e.padCd -= dt;
            if (e.padCd > 0) continue;
            const c = Math.round(e.px);
            const r = Math.round(e.py);
            if (Math.abs(e.px - c) > 0.1 || Math.abs(e.py - r) > 0.1) continue; // only at a tile centre
            let idx = -1;
            if (game.pads[0].c === c && game.pads[0].r === r) idx = 0;
            else if (game.pads[1].c === c && game.pads[1].r === r) idx = 1;
            if (idx === -1) continue;
            const dest = game.pads[1 - idx] as { c: number; r: number };
            e.px = dest.c;
            e.py = dest.r;
            e.padCd = PAD_COOLDOWN;
        }
    }

    function collectSpawns(): void {
        const theme = active.theme;
        const chomp = game.chomp;
        for (const s of game.spawns) {
            const sx = s.px !== undefined ? s.px : s.c;
            const sy = s.py !== undefined ? s.py : s.r;
            const dx = sx - chomp.px;
            const dy = sy - chomp.py;
            if (dx * dx + dy * dy >= 0.45 * 0.45) continue;
            s.dead = true;
            if (s.kind === "fruit") {
                const gain = 100 * game.round * game.scoreMult;
                game.score += Math.round(gain);
                vfx.floatText(sx, sy, TEXT.gain(Math.round(gain)), theme.win);
            } else if (s.kind === "runner") {
                const gain = 500 * game.round * game.scoreMult;
                game.score += Math.round(gain);
                vfx.floatText(sx, sy, TEXT.gain(Math.round(gain)), theme.win);
            } else if (s.kind === "crate") {
                const id = s.forced || rollCrate(); // one roll per crate — unchanged fx draw
                const bad = PICKUPS.bad.some((p) => p.id === id);
                const entry = (bad ? PICKUPS.bad : PICKUPS.good).find((p) => p.id === id);
                vfx.floatText(sx, sy, entry ? entry.name : TEXT.crateMark, bad ? theme.danger : theme.accent);
                applyPickup(id);
            }
        }
        if (game.spawns.some((s) => s.dead)) game.spawns = game.spawns.filter((s) => !s.dead);
    }

    function updateSpawns(dt: number): void {
        for (const s of game.spawns) s.life -= dt;
        if (game.spawns.some((s) => s.life <= 0)) game.spawns = game.spawns.filter((s) => s.life > 0);

        game.fruitTimer -= dt;
        if (game.fruitTimer <= 0) {
            spawnFruit();
            game.fruitTimer = FRUIT_EVERY;
        }
        game.crateTimer -= dt;
        if (game.crateTimer <= 0) {
            spawnCrate();
            game.crateTimer = CRATE_EVERY;
        }
        if (game.round >= RUNNER_ROUND) {
            game.runnerTimer -= dt;
            if (game.runnerTimer <= 0) {
                spawnRunner();
                game.runnerTimer = RUNNER_EVERY;
            }
        }

        for (const s of game.spawns) if (s.kind === "runner") moveRunner(s, dt);
        updatePads(dt);
        collectSpawns();
    }

    // Magnet: sweep in loose pellets within reach (never power pellets — those
    // still demand a deliberate bite). Reach is the Crumb Magnet knob baseline plus
    // the MAGNET pickup's radius while it is active; nothing runs at reach 0.
    function applyMagnet(): void {
        const reach = (game.knobs as Knobs).magnetRadius + (hasEffect("magnet") ? MAGNET_RADIUS : 0);
        if (reach <= 0) return;
        const ct = tileOf(game.chomp);
        for (let dr = -reach; dr <= reach; dr++) {
            for (let dc = -reach; dc <= reach; dc++) {
                if (dc * dc + dr * dr > reach * reach) continue;
                const c = ct.c + dc;
                const r = ct.r + dr;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
                const row = maze.grid[r] as Cell[];
                if (row[c] === ".") {
                    row[c] = " ";
                    game.score += Math.round((game.knobs as Knobs).pelletValue * game.scoreMult);
                    maze.pelletsLeft--;
                    game.pelletsEaten++;
                }
            }
        }
    }

    // Clears the per-life ephemera (active event, effects, spawns, banners). The
    // event *schedule* (game.eventTimer) is deliberately NOT reset here — it free-
    // runs across deaths and round changes so events keep their cadence.
    function clearEphemeral(keepShield: boolean): void {
        game.event = null;
        game.frenzyArmed = false;
        game.chillArmed = false;
        game.phaseGhost = -1;
        game.effects = [];
        if (!keepShield) game.shield = 0;
        game.headStartTimer = 0;
        game.spawns = [];
        game.banners = [];
        vfx.clear(); // drop lingering juice on any life/round change (they expire in < 1 s anyway)
        game.fruitTimer = FRUIT_EVERY;
        game.crateTimer = CRATE_EVERY;
        game.runnerTimer = RUNNER_EVERY;
        recomputeMultipliers();
    }

    return {
        hasEffect,
        recomputeMultipliers,
        addEffect,
        triggerFright,
        applyPickup,
        rollCrate,
        queueBanner,
        triggerEvent,
        updateEffects,
        spawnFruit,
        spawnCrate,
        spawnRunner,
        updateSpawns,
        applyMagnet,
        clearEphemeral,
    };
}

export type Systems = ReturnType<typeof createSystems>;

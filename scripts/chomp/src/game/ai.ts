// =============================================================================
//  game/ai.ts — ghost AI: targeting, the mode clock, mistakes, flee, elites.
// =============================================================================
//
//  The ghost brains. Per-frame targeting (Blinky/Pinky/Inky/Clyde, the round-5
//  ambusher, the swarm ghost and split minis), the greedy direction chooser with
//  its early-round mistake wobble and smart flee, the scatter/chase clock, and
//  the elite-affix roll + per-death restore. Reads the folded knobs and the
//  difficulty curve; mutates the ghosts on the shared game. The two random
//  streams stay exactly where the original put them — game.fx for seeded rolls
//  (elite assignment, blind wander), Math.random for the erratic flee and the
//  mistake take — so the harness replays byte-for-byte.
// =============================================================================

import { COLS, type Coord, HOME, isWall, ROWS } from "../engine/grid";
import { DIRS, type Dir, isOpposite, stepFor } from "../engine/movement";
import { active, difficulty } from "./config";
import { ELITES, type Knobs } from "./content";
import type { GameState, Ghost } from "./state";

// Ghost scatter corners — Blinky top-right, Pinky top-left, Inky bottom-right,
// Clyde bottom-left. Ghost content, read only by the AI.
const SCATTER: Coord[] = [
    { c: COLS - 2, r: 1 }, // Blinky -> top-right
    { c: 1, r: 1 }, // Pinky  -> top-left
    { c: COLS - 2, r: ROWS - 2 }, // Inky  -> bottom-right
    { c: 1, r: ROWS - 2 }, // Clyde -> bottom-left
];

// Squared distance from (c, r) to a target tile. Pure; shared with the runner
// flee in systems.ts.
export function sqDist(c: number, r: number, t: Coord): number {
    return (c - t.c) * (c - t.c) + (r - t.r) * (r - t.r);
}

export function createAi(game: GameState) {
    // Reset every ghost's affix + per-affix state to a clean, un-elite slate.
    function clearAffix(g: Ghost): void {
        g.affix = null;
        g.tankBites = 0;
        g.eatCd = 0;
        g.phaseCd = 0;
        g.phaseClip = 0;
    }

    // From round 5, roll 1 + extraElite distinct random ghosts onto a random affix,
    // seeded off game.fx so the harness can force outcomes. The assignment is
    // RECORDED in game.roundElites so a mid-round death can restore the SAME ghosts
    // to the SAME affixes (reapplyElites) instead of re-rolling. Rolls once a round.
    function assignElites(): void {
        for (const g of game.ghosts) clearAffix(g);
        game.roundElites = [];
        if (game.round < 5) return;
        const count = Math.min(game.ghosts.length, 1 + (game.knobs as Knobs).extraElite);
        const pool = game.ghosts.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (game.fx() * (i + 1)) | 0;
            const tmp = pool[i] as Ghost;
            pool[i] = pool[j] as Ghost;
            pool[j] = tmp;
        }
        for (let k = 0; k < count; k++) {
            const g = pool[k] as Ghost;
            g.affix = (ELITES[(game.fx() * ELITES.length) | 0] as (typeof ELITES)[number]).id;
            if (g.affix === "phasing") g.phaseCd = 7;
            game.roundElites.push({ id: g.id, affix: g.affix });
        }
    }

    // After a death rebuilds the ghosts, restore this round's recorded affixes onto
    // the ghosts that still exist (base + swarm ids survive; minis do not persist a
    // death and were never elite). No re-roll — WHICH ghost is elite is fixed for
    // the round.
    function reapplyElites(): void {
        for (const g of game.ghosts) clearAffix(g);
        for (const rec of game.roundElites) {
            const g = game.ghosts.find((x) => x.id === rec.id);
            if (!g) continue;
            g.affix = rec.affix;
            if (g.affix === "phasing") g.phaseCd = 7;
        }
    }

    // A splitter, when eaten, leaves two 60%-speed minis in its place — worth 150
    // apiece, frightenable, no further splitting. Spawned frightened if a fright
    // is live so they can be cashed in immediately.
    function splitGhost(g: Ghost): void {
        const theme = active.theme;
        for (let k = 0; k < 2; k++) {
            game.ghosts.push({
                id: 100 + game.ghosts.length,
                px: g.px,
                py: g.py,
                dir: DIRS.up,
                want: DIRS.up,
                mode: game.frightTimer > 0 ? "fright" : game.modePhase,
                color: theme.ghostColors[k % theme.ghostColors.length] as number,
                phasing: false,
                padCd: 0,
                mini: true,
                affix: null,
                tankBites: 0,
                eatCd: 0,
                phaseCd: 0,
                phaseClip: 0,
            });
        }
    }

    // Every ghost eaten this round drives the vengeful affix; a splitter also
    // spawns its minis here.
    function onGhostEaten(g: Ghost): void {
        game.ghostsEatenThisRound++;
        game.ghostsEaten++; // run-lifetime tally for the meta fold at run end
        if (g.affix === "splitter") splitGhost(g);
    }

    // The tile Chomp reaches at its next junction: walk its heading forward until
    // a cell that opens perpendicular (a junction) or the last cell before a wall.
    function ambushTarget(chompTile: Coord, dir: Dir): Coord {
        if (dir.x === 0 && dir.y === 0) return chompTile;
        const perp = dir.x !== 0 ? [DIRS.up, DIRS.down] : [DIRS.left, DIRS.right];
        let c = chompTile.c;
        let r = chompTile.r;
        for (let guard = 0; guard < 40; guard++) {
            let nc = c + dir.x;
            const nr = r + dir.y;
            if (nc < 0) nc = COLS - 1;
            else if (nc >= COLS) nc = 0;
            if (isWall(nc, nr)) return { c, r }; // wall ahead: stop on this cell
            c = nc;
            r = nr;
            if (perp.some((p) => !isWall(c + p.x, r + p.y))) return { c, r }; // junction
        }
        return { c, r };
    }

    function ghostTarget(g: Ghost, chompTile: Coord, blinkyTile: Coord): Coord {
        if (g.mode === "eyes") return HOME;
        // The swarm ghost and splitter minis have no scatter corner of their own —
        // they hunt Chomp directly in every field mode (and dodge SCATTER[id] gaps).
        if (g.swarm || g.mini) return chompTile;
        if (g.mode === "scatter") return SCATTER[g.id] as Coord;
        // chase
        if (game.round >= 5 && g.id === game.ambusherId) {
            // Ambusher: cut Chomp off at the tile it reaches at its next junction.
            return ambushTarget(chompTile, game.chomp.dir);
        }
        if (g.id === 0) return chompTile; // Blinky: straight at the player
        if (g.id === 1) {
            // Pinky: four tiles ahead of the player's heading.
            return { c: chompTile.c + game.chomp.dir.x * 4, r: chompTile.r + game.chomp.dir.y * 4 };
        }
        if (g.id === 2) {
            // Inky: reflect Blinky through the tile two ahead of the player.
            const ax = chompTile.c + game.chomp.dir.x * 2;
            const ay = chompTile.r + game.chomp.dir.y * 2;
            return { c: ax + (ax - blinkyTile.c), r: ay + (ay - blinkyTile.r) };
        }
        // Clyde: chase when far, flee to his corner when within 8 tiles.
        const dx = chompTile.c - g.px;
        const dy = chompTile.r - g.py;
        return dx * dx + dy * dy > 64 ? chompTile : (SCATTER[3] as Coord);
    }

    function chooseGhostDir(g: Ghost, target: Coord, chompTile: Coord): void {
        // Among open, non-reversing directions: greedily minimise distance to the
        // target, but let a couple of upgrades bend that rule (see below).
        const col = Math.round(g.px);
        const row = Math.round(g.py);
        const options: Dir[] = [];
        for (const key of ["up", "left", "down", "right"] as const) {
            const d = DIRS[key];
            if (isOpposite(d, g.dir)) continue;
            if (!stepFor(g, col, row, d)) continue;
            options.push(d);
        }
        if (options.length === 0) {
            g.want = { x: -g.dir.x, y: -g.dir.y }; // forced reverse (dead end)
            return;
        }
        // LIGHTS OUT: field ghosts (not fright/eyes) lose their target and wander.
        if (game.event && game.event.id === "blind" && (g.mode === "scatter" || g.mode === "chase")) {
            g.want = options[(game.fx() * options.length) | 0] as Dir;
            return;
        }
        if (g.mode === "fright") {
            if (game.round >= 5) {
                // Smart flee: pick the turn that MAXIMISES distance to Chomp.
                let best = options[0] as Dir;
                let far = -Infinity;
                for (const d of options) {
                    const dist = sqDist(col + d.x, row + d.y, chompTile);
                    if (dist > far) {
                        far = dist;
                        best = d;
                    }
                }
                g.want = best;
            } else {
                g.want = options[(Math.random() * options.length) | 0] as Dir; // erratic flee
            }
            return;
        }
        // Greedy toward target, tracking the runner-up so a "mistake" can take it.
        let best = options[0] as Dir;
        let bestDist = Infinity;
        let second: Dir | null = null;
        let secondDist = Infinity;
        for (const d of options) {
            const dist = sqDist(col + d.x, row + d.y, target);
            if (dist < bestDist) {
                second = best;
                secondDist = bestDist;
                best = d;
                bestDist = dist;
            } else if (dist < secondDist) {
                second = d;
                secondDist = dist;
            }
        }
        if (g.mode !== "eyes" && second && Math.random() < difficulty(game.round).mistakeRate) {
            g.want = second; // early-round wobble: take the second-best turn
        } else {
            g.want = best;
        }
    }

    // Scatter/chase clock: alternate scatter(scatterTime) <-> chase(chaseTime).
    // When scatterTime has decayed to 0 the mode is permanently chase (no flips).
    // Frozen while any ghost is frightened, as the arcade does. Every flip
    // reverses and retargets the field ghosts — the classic "they all turn" tell.
    function tickModeClock(dt: number): void {
        const k = game.knobs as Knobs;
        if (k.scatterTime <= 0) return; // permanent chase (also the RUSH HOUR mutator)
        if (game.frightTimer > 0) return; // clock paused during fright
        game.modeTimer -= dt;
        if (game.modeTimer > 0) return;
        const next = game.modePhase === "scatter" ? "chase" : "scatter";
        game.modePhase = next;
        game.modeTimer = next === "scatter" ? k.scatterTime : k.chaseTime;
        for (const g of game.ghosts) {
            if (g.mode === "scatter" || g.mode === "chase") {
                g.mode = next;
                g.dir = { x: -g.dir.x, y: -g.dir.y };
                g.want = g.dir;
            }
        }
    }

    return {
        clearAffix,
        assignElites,
        reapplyElites,
        onGhostEaten,
        ghostTarget,
        chooseGhostDir,
        tickModeClock,
    };
}

export type Ai = ReturnType<typeof createAi>;

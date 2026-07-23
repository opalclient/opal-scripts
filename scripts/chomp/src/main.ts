// =============================================================================
//  Chomp — a playable maze game for Opal's command palette
// =============================================================================
//
//  A maze chase game that runs in TWO places from one shared engine:
//
//    1. As a COMMAND PALETTE VIEW (the headline). Search the palette for
//       "Chomp" and press Enter. Uses the `palette` script API to register a
//       canvas-backed view that draws itself and takes keyboard input each frame.
//
//    2. As a fullscreen OVERLAY MODULE (no new client APIs). Enable the "Chomp"
//       module and play over the HUD; it draws on `renderScreen` and steers
//       from `keyPress` events.
//
//  Every round builds a fresh, random, mirror-symmetric maze (seeded so the
//  node harness can replay any failure) and paints it with one of 14 themes. A
//  clear opens a perk draft, and the full roguelite loop — perks, curses, elite
//  affixes, mutators — folds through difficulty(round), the single source of
//  every per-round scaling number the engine reads. Runs persist through the
//  feature-detected `storage` wrapper: high scores, lifetime crumbs, meta unlocks.
//
//  Controls: Arrows or WASD to move · P pause · R twice to restart · Enter to
//  start or confirm.
//
//  This file is the wiring only — registerScript, the two surfaces, and the node
//  test hook. Board geometry, the maze, themes, content tables, and the engine
//  live under engine/ and game/; esbuild bundles them into one dist/chomp.js.
//
//  Author: trq  ·  A flagship example of the scripting + palette-view API.
// =============================================================================

import { COLS, generateMaze, isWall, type MazeOpts, maze, ROWS } from "./engine/grid";
import { DIRS } from "./engine/movement";
import { mulberry32 } from "./engine/rng";
import { active, difficulty, TEXT, THEMES } from "./game/config";
import { CURSES, ELITES, EVENTS, MUTATORS, PERKS, PICKUPS, UNLOCKS } from "./game/content";
import { notify } from "./game/meta";
import { createGame } from "./game/state";

const script = registerScript({
    name: "Chomp",
    version: "1.2.0",
    authors: ["trq"],
});

// =============================================================================
//  Surface 1 — the command palette view (uses the `palette` API).
// =============================================================================
const paletteGame = createGame();

palette.createView({
    id: "chomp",
    title: "Chomp",
    description: "Play Chomp in the command palette",
    placeholder: `Chomp — ${TEXT.controls}`,
    footer: [
        { key: "← ↑ → ↓ / WASD", label: "Move" },
        { key: "P", label: "Pause" },
        { key: "R", label: "Restart" },
        { key: "Enter", label: "Start" },
    ],
    render(x: number, y: number, w: number, h: number, dt: number): void {
        paletteGame.update(dt);
        paletteGame.render(x, y, w, h);
    },
    keyPressed(keyCode: number, _mods: number): boolean {
        paletteGame.input(keyCode);
        return true;
    },
});

// =============================================================================
//  Surface 2 — the fullscreen overlay module (zero new client APIs).
//  Enable the module to play over the HUD; arrow keys steer via keyPress.
// =============================================================================
script.registerModule(
    {
        name: "Chomp",
        description: `Play Chomp as a fullscreen overlay. ${TEXT.controls}.`,
    },
    (module) => {
        module.addBool("Open in palette", true);

        const overlayGame = createGame();
        let lastMs: number | null = null;

        module.on("enable", () => {
            lastMs = null;
            if (module.getBool("Open in palette")) {
                // Prefer the richer palette surface when asked; the palette view
                // owns paletteGame, so don't reset the overlay's shared maze out
                // from under a mid-run palette game.
                palette.openView("chomp");
            } else {
                overlayGame.reset(true);
                notify(TEXT.controls);
            }
        });

        module.on("renderScreen", () => {
            if (module.getBool("Open in palette")) return; // palette view is driving

            // Wall-clock delta in seconds (falls back to a fixed step).
            let dt = 1 / 60;
            if (typeof Date !== "undefined" && Date.now) {
                const now = Date.now();
                if (lastMs !== null) dt = (now - lastMs) / 1000;
                lastMs = now;
            }
            overlayGame.update(dt);

            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();
            const size = Math.min(sw, sh) * 0.78;
            const bx = (sw - size) / 2;
            const by = (sh - size) / 2;

            renderer.shadow(bx, by, size, size, 14, 40, 0, 8, renderer.color(0, 0, 0, 150));
            overlayGame.render(bx, by, size, size);
        });

        module.on("keyPress", (event) => {
            if (module.getBool("Open in palette")) return;
            overlayGame.input(event.getCode());
        });
    },
);

// =============================================================================
//  Test hook — exposes the pure engine to the node harness (see tests/harness.js).
//  Only present when a test sets globalThis.__CHOMP_TEST__; never in-game.
//
//  The generateMaze here is a thin WRAPPER that defaults knockRate to
//  difficulty(round).knockRate when the caller omits opts — reproducing the
//  original bare-call default (the engine's generateMaze now takes knockRate as a
//  required field), so a harness `generateMaze(round, rng)` behaves identically.
// =============================================================================
function generateMazeHook(round: number, rng: () => number, opts?: Partial<MazeOpts>) {
    const knockRate = opts && opts.knockRate !== undefined ? opts.knockRate : difficulty(round).knockRate;
    return generateMaze(round, rng, { ...(opts || {}), knockRate });
}

const testTarget = globalThis as unknown as { __CHOMP_TEST__?: boolean; __chomp_test?: unknown };
if (testTarget.__CHOMP_TEST__) {
    testTarget.__chomp_test = {
        createGame,
        generateMaze: generateMazeHook,
        difficulty,
        THEMES,
        mulberry32,
        EVENTS,
        PICKUPS,
        PERKS,
        CURSES,
        ELITES,
        MUTATORS,
        UNLOCKS,
        // Engine views onto the current maze for the harness autoplay bot.
        ROWS,
        COLS,
        DIRS,
        isWall,
        grid: () => maze.grid,
        pelletsLeft: () => maze.pelletsLeft,
        themeName: () => active.themeName,
        tunnelRows: () => maze.tunnelRows,
    };
}

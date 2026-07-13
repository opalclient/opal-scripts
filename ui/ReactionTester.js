// =============================================================================
//  Reaction Tester  —  a palette-view mini-app for Opal
// =============================================================================
//
//  A small reflex-testing game hosted inside the command palette via
//  `palette.createView`. Press Space, wait for the panel to turn green, then
//  press Space again as fast as you can. Jump the gun and it calls you out.
//
//  Rules:
//    · Space (idle)   — start a round; the panel goes to a neutral "wait" red.
//    · Space (wait)    — too early! False start, back to idle.
//    · (random delay)  — the panel flips to green; the clock is now running.
//    · Space (go)      — stops the clock and records your reaction time.
//    · Space (result)  — starts another round.
//
//  This is a second, differently-shaped showcase next to the game-style
//  palette views elsewhere in the ecosystem (Pac-Man, Snake): rather than a
//  grid-based game loop, it is a small state machine timed off real
//  wall-clock `dt`, which is the pattern worth copying if you're building a
//  palette view that measures *time* rather than *space*.
//
//  WHICH GLOBALS
//  -------------
//    • palette  — createView / openView, the render(x, y, w, h, dt) and
//                 keyPressed(keyCode, mods) callbacks.
//    • renderer — every draw call in the render callback.
//    • keys     — keys.SPACE to drive the whole state machine.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  `dt` is wall-clock seconds since the last frame, clamped to a max of 0.1s
//  by the engine (so a paused/backgrounded palette never reports a giant
//  jump) — accumulating it every frame while the "go" state is active is a
//  simple, good-enough stopwatch. It is not a hardware-timer-precise
//  benchmark (frame-rate dependent, and that 0.1s clamp caps the worst case),
//  which is an honest tradeoff for a casual reflex game, not a lab
//  instrument.
//
//  Controls: Space to start / react / restart. Esc closes the palette view.
//
//  Author: Opal  ·  An example of the palette + renderer + keys scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Reaction Tester",
    version: "1.0.0",
    authors: ["Opal"],
});

const C = {
    idleBg: renderer.color(16, 18, 24),
    waitBg: renderer.color(120, 40, 40),
    goBg: renderer.color(40, 140, 80),
    earlyBg: renderer.color(150, 100, 30),
    text: renderer.color(244, 246, 250),
    dim: renderer.color(190, 195, 210),
    accent: renderer.color(140, 220, 255),
};

const MIN_DELAY = 1.0; // seconds
const MAX_DELAY = 3.2; // seconds

/**
 * Builds the reaction-tester engine: pure state + an update/render/input API,
 * matching the shape of the other palette-view games in this ecosystem.
 *
 * @param {() => number} historySize A getter for the rolling-average window
 *                                    size, read live from the module setting.
 */
function createGame(historySize) {
    const game = {
        state: "idle", // idle | wait | go | early | result
        waitTarget: 0, // seconds to wait before flipping to "go"
        elapsed: 0, // seconds accumulated in the current state's timer
        lastMs: null, // most recent reaction time in ms
        bestMs: null, // best (lowest) reaction time this session
        history: [], // rolling window of recent reaction times, in ms
    };

    function startWaiting() {
        game.state = "wait";
        game.elapsed = 0;
        game.waitTarget = MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
    }

    function recordResult(ms) {
        game.lastMs = ms;
        game.bestMs = game.bestMs === null ? ms : Math.min(game.bestMs, ms);
        game.history.push(ms);
        const cap = Math.max(1, Math.round(historySize()));
        while (game.history.length > cap) game.history.shift();
        game.state = "result";
    }

    function average() {
        if (game.history.length === 0) return null;
        let sum = 0;
        for (const v of game.history) sum += v;
        return sum / game.history.length;
    }

    /** Per-frame update. dt is wall-clock seconds since the last frame. */
    function update(dt) {
        dt = Math.min(dt, 0.1);

        if (game.state === "wait") {
            game.elapsed += dt;
            if (game.elapsed >= game.waitTarget) {
                game.state = "go";
                game.elapsed = 0;
            }
        } else if (game.state === "go") {
            game.elapsed += dt;
        }
    }

    /** Handles Space: the only input this game needs. */
    function pressSpace() {
        if (game.state === "idle" || game.state === "result" || game.state === "early") {
            startWaiting();
        } else if (game.state === "wait") {
            game.state = "early";
        } else if (game.state === "go") {
            recordResult(Math.round(game.elapsed * 1000));
        }
    }

    function render(x, y, w, h) {
        const bg =
            game.state === "wait"
                ? C.waitBg
                : game.state === "go"
                    ? C.goBg
                    : game.state === "early"
                        ? C.earlyBg
                        : C.idleBg;
        renderer.roundedRect(x, y, w, h, 10, bg);

        const titleSize = Math.min(h * 0.14, w * 0.09);
        const title = statusTitle();
        const tw = renderer.textWidth("productsans-bold", title, titleSize);
        renderer.text("productsans-bold", title, x + (w - tw) / 2, y + h * 0.36, titleSize, C.text);

        const subSize = titleSize * 0.4;
        const sub = statusSubtitle();
        if (sub !== null) {
            const sw = renderer.textWidth("productsans-medium", sub, subSize);
            renderer.text("productsans-medium", sub, x + (w - sw) / 2, y + h * 0.36 + titleSize * 0.9, subSize, C.dim);
        }

        drawStats(x, y, w, h);
    }

    function statusTitle() {
        if (game.state === "idle") return "REACTION TEST";
        if (game.state === "wait") return "WAIT...";
        if (game.state === "go") return "GO!";
        if (game.state === "early") return "TOO SOON!";
        return game.lastMs + " ms";
    }

    function statusSubtitle() {
        if (game.state === "idle") return "Press Space to start";
        if (game.state === "wait") return "Don't press yet";
        if (game.state === "go") return "Press Space now!";
        if (game.state === "early") return "Space to try again";
        return "Space to go again";
    }

    function drawStats(x, y, w, h) {
        const rowY = y + h - h * 0.16;
        const size = Math.min(h * 0.06, 11);

        const best = game.bestMs === null ? "—" : game.bestMs + " ms";
        const avg = average();
        const avgText = avg === null ? "—" : Math.round(avg) + " ms";

        const parts = [
            "Best  " + best,
            "Avg(" + game.history.length + ")  " + avgText,
        ];

        const gap = w * 0.08;
        let totalW = 0;
        const widths = parts.map((p) => renderer.textWidth("productsans-medium", p, size));
        for (const wgt of widths) totalW += wgt;
        totalW += gap * (parts.length - 1);

        let cx = x + (w - totalW) / 2;
        for (let i = 0; i < parts.length; i++) {
            renderer.text("productsans-medium", parts[i], cx, rowY, size, C.accent);
            cx += widths[i] + gap;
        }
    }

    return { update, render, pressSpace };
}

// =============================================================================
//  Palette view registration.
// =============================================================================
const VIEW_ID = "reaction-tester";

script.registerModule(
    {
        name: "Reaction Tester",
        description: "A reflex-timing mini-game hosted in the command palette.",
    },
    (module) => {
        module.addNumber("Average Window", 5, 1, 20, 1);

        const game = createGame(() => module.getNumber("Average Window"));

        palette.createView({
            id: VIEW_ID,
            title: "Reaction Tester",
            description: "Press Space, wait for green, react fast",
            placeholder: "Reaction Tester — Space to start / react, Esc to quit",
            footer: [{ key: "Space", label: "Start / React" }],
            render: function (x, y, w, h, dt) {
                game.update(dt);
                game.render(x, y, w, h);
            },
            keyPressed: function (keyCode, _mods) {
                if (keyCode === keys.SPACE) game.pressSpace();
                return true; // consume every key so the palette search box never steals Space
            },
        });

        module.on("enable", () => {
            palette.openView(VIEW_ID);
        });
    },
);

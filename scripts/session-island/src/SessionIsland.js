// =============================================================================
//  Session Island  —  an overlay (Dynamic Island) example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  A small pill-shaped Dynamic Island that lives at the top of the HUD for as
//  long as the module is enabled, showing:
//
//    • Session time   — how long the island has been up, mm:ss or hh:mm:ss.
//    • Modules on     — how many modules (native + script) are currently
//                       enabled, via the `modules` proxy.
//    • An 8-dot ring  — a small circular "loading ring" where dots light up
//                       one per second, just to prove the island is alive.
//
//  WHICH GLOBALS
//  -------------
//    • overlay  — createIsland / showIsland / destroyIsland / setIslandWidth.
//    • modules  — listEnabled() for the live module count.
//    • renderer — everything drawn inside the island's own render callback.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  An island's `render(x, y, w, h, progress)` callback is handed its OWN
//  position and size every frame — you do not own a persistent canvas, you
//  redraw from scratch each call. Because the width can (and here does)
//  change live as the text changes length, `overlay.setIslandWidth(...)` is
//  called from inside the same render callback that measures the text, with
//  a small hysteresis check (`Math.abs(needed - w) > 1`) so it does not
//  fight sub-pixel measurement jitter every frame.
//
//  Usage: enable "Session Island". Settings toggle which rows are shown.
//
//  Author: Opal  ·  An example of the overlay.createIsland scripting API.
// =============================================================================

const script = registerScript({
    name: "Session Island",
    version: "1.0.0",
    authors: ["Opal"],
});

// -----------------------------------------------------------------------------
//  Colors. Built with renderer.color() so every value is a correctly-packed
//  ARGB int — never a raw 0xAARRGGBB literal (JS doubles above 2^31 truncate
//  wrong when narrowed to a Java int).
// -----------------------------------------------------------------------------
const C = {
    shadow: renderer.color(0, 0, 0, 120),
    panel: renderer.color(18, 18, 24, 150),
    text: renderer.color(244, 244, 250),
    dim: renderer.color(165, 170, 185),
    ringLit: renderer.color(160, 140, 255),
    ringDim: renderer.color(60, 55, 80),
};

const ISLAND_H = 30;
const RADIUS = ISLAND_H / 2;
const PAD = 10;
const RING_W = 20; // square footprint reserved for the dot ring
const GAP = 9;
const ROW_GAP = 3;
const MIN_WIDTH = 118;
const RING_DOTS = 8;

/**
 * Draws an 8-dot ring where the dots up to `(seconds % 8)` are lit, giving a
 * simple one-second-per-tick "alive" animation with only circle() calls.
 *
 * @param {number} cx      Ring center X.
 * @param {number} cy      Ring center Y.
 * @param {number} seconds Elapsed whole seconds, used to pick the lit count.
 */
function drawRing(cx, cy, seconds) {
    const radius = 7;
    const lit = Math.floor(seconds) % RING_DOTS;

    for (let i = 0; i < RING_DOTS; i++) {
        const angle = (i / RING_DOTS) * Math.PI * 2 - Math.PI / 2;
        const dx = cx + Math.cos(angle) * radius;
        const dy = cy + Math.sin(angle) * radius;
        const isLit = i <= lit;
        renderer.circle(dx, dy, isLit ? 2.1 : 1.4, isLit ? C.ringLit : C.ringDim);
    }
}

/**
 * Formats a duration in whole seconds as mm:ss or hh:mm:ss.
 *
 * @param {number} totalSeconds Elapsed seconds.
 * @param {boolean} withHours   Whether to always include an hours field.
 * @returns {string} The formatted clock string.
 */
function formatDuration(totalSeconds, withHours) {
    const s = Math.floor(totalSeconds) % 60;
    const m = Math.floor(totalSeconds / 60) % 60;
    const h = Math.floor(totalSeconds / 3600);

    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

    if (withHours || h > 0) {
        return h + ":" + pad2(m) + ":" + pad2(s);
    }
    return m + ":" + pad2(s);
}

script.registerModule(
    {
        name: "Session Island",
        description: "Dynamic Island showing session time and live enabled-module count.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addBool("Show Playtime", true);
        module.addBool("Show Module Count", true);
        module.addMode("Format", ["mm:ss", "hh:mm:ss"]);

        // ---- State ------------------------------------------------------------
        /** @type {string|null} Active island handle, or null while hidden. */
        let islandId = null;

        /** @type {number} Date.now() (ms) when the module was enabled. */
        let startedAtMs = 0;

        module.on("enable", () => {
            startedAtMs = typeof Date !== "undefined" && Date.now ? Date.now() : 0;

            islandId = overlay.createIsland({
                width: MIN_WIDTH,
                height: ISLAND_H,
                priority: 15,
                render: function (posX, posY, width, height, progress) {
                    renderIsland(posX, posY, width, height, progress);
                },
            });
            overlay.showIsland(islandId);
        });

        module.on("disable", () => {
            if (islandId !== null) {
                overlay.destroyIsland(islandId);
                islandId = null;
            }
        });

        /**
         * Draws the island content and keeps its width in sync with the text.
         *
         * @param {number} x        Island left edge.
         * @param {number} y        Island top edge.
         * @param {number} w        Current island width.
         * @param {number} h        Island height.
         * @param {number} progress Reveal animation progress (0.0 - 1.0).
         */
        function renderIsland(x, y, w, h, progress) {
            const elapsedSeconds = startedAtMs > 0 ? (Date.now() - startedAtMs) / 1000 : 0;

            const rows = [];
            if (module.getBool("Show Playtime")) {
                const withHours = module.isModeEqual("Format", "hh:mm:ss");
                rows.push({
                    text: formatDuration(elapsedSeconds, withHours),
                    font: "productsans-bold",
                    size: 8.5,
                    color: C.text,
                });
            }
            if (module.getBool("Show Module Count")) {
                const count = modules.listEnabled().size();
                rows.push({
                    text: count + (count === 1 ? " module on" : " modules on"),
                    font: "productsans-medium",
                    size: 6.5,
                    color: C.dim,
                });
            }
            if (rows.length === 0) {
                rows.push({ text: "Session Island", font: "productsans-bold", size: 8.5, color: C.text });
            }

            renderer.globalAlpha(progress);

            renderer.shadow(x, y, w, h, RADIUS, 18, 0, 4, C.shadow);
            renderer.blurFill(x, y, w, h, RADIUS);
            renderer.roundedRect(x, y, w, h, RADIUS, C.panel);

            drawRing(x + PAD + RING_W / 2, y + h / 2, elapsedSeconds);

            let totalH = 0;
            for (const r of rows) totalH += r.size;
            totalH += ROW_GAP * (rows.length - 1);

            const tx = x + PAD + RING_W + GAP;
            let ty = y + (h - totalH) / 2;
            let maxTextW = 0;
            for (const r of rows) {
                renderer.text(r.font, r.text, tx, ty, r.size, r.color);
                maxTextW = Math.max(maxTextW, renderer.textWidth(r.font, r.text, r.size));
                ty += r.size + ROW_GAP;
            }

            renderer.globalAlpha(1);

            const needed = Math.max(MIN_WIDTH, tx - x + maxTextW + PAD);
            if (islandId !== null && Math.abs(needed - w) > 1) {
                overlay.setIslandWidth(islandId, needed);
            }
        }
    },
);

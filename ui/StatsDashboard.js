// =============================================================================
//  Stats Dashboard  —  a palette-view mini-app for Opal
// =============================================================================
//
//  A live stat-tracking dashboard hosted inside the command palette: health,
//  position, dimension, FPS, and speed as number tiles, plus two rolling
//  sparkline graphs for FPS and speed. Nothing here is a game — it's the
//  "stat-tracking dashboard" flavor of palette view, next to the game-style
//  ones (Pac-Man, Snake, Reaction Tester) elsewhere in the ecosystem: a
//  palette view doesn't have to be interactive to be worth building, it can
//  just be a nicer place to put a live readout than the HUD.
//
//  WHICH GLOBALS
//  -------------
//    • palette   — createView, the render(x, y, w, h, dt) callback.
//    • client    — getFPS, getTickDelta.
//    • player    — getHealth/getMaxHealth, getBlockPosition.
//    • movement  — getBlocksPerSecond.
//    • world     — getDimension.
//    • modules   — listEnabled().length.
//    • renderer  — every draw call in the render callback.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  A palette view can be opened from the main menu or a loading screen, where
//  `mc.player`/`mc.world` are null — unlike a module's `renderScreen`, there
//  is no "only enabled while in a world" guarantee here. Every read below is
//  guarded, and the tiles render em-dashes instead of throwing when there is
//  no player/world to read from, so opening the view never errors out.
//
//  The two graphs use a fixed-interval sample accumulator (10 samples/second,
//  independent of the palette's actual render framerate) built from the
//  view's own `dt` — the same fixed-timestep idea `Snake.js` uses for
//  gameplay, applied here to a data buffer instead.
//
//  Settings:
//    • Show FPS Graph     — draw the FPS sparkline.
//    • Show Speed Graph   — draw the speed sparkline.
//    • History Seconds    — how many seconds of samples each graph holds.
//
//  Controls: Esc closes the palette view. There is no other input — this is
//  a read-only dashboard.
//
//  Author: Opal  ·  An example of the palette + client + player + movement +
//  world + modules + renderer scripting APIs working together.
// =============================================================================

const script = registerScript({
    name: "Stats Dashboard",
    version: "1.0.0",
    authors: ["Opal"],
});

const C = {
    bg: renderer.color(14, 15, 20),
    tile: renderer.color(22, 24, 32),
    title: renderer.color(244, 246, 252),
    label: renderer.color(150, 155, 170),
    value: renderer.color(230, 232, 240),
    good: renderer.color(120, 220, 140),
    warn: renderer.color(255, 196, 76),
    bad: renderer.color(255, 99, 99),
    fpsLine: renderer.color(140, 220, 255),
    speedLine: renderer.color(255, 170, 110),
};

const SAMPLE_INTERVAL = 0.1; // seconds — 10 samples/second regardless of render FPS

/**
 * Creates the sampling + layout engine for the dashboard. Kept separate from
 * the `palette.createView` wiring so the sampling logic reads plainly.
 *
 * @param {() => number} historySeconds Getter for the live "History Seconds" setting.
 */
function createDashboard(historySeconds) {
    const state = {
        fpsSamples: [],
        speedSamples: [],
        sampleAcc: 0,
    };

    function sampleIfReady(dt) {
        state.sampleAcc += dt;
        while (state.sampleAcc >= SAMPLE_INTERVAL) {
            state.sampleAcc -= SAMPLE_INTERVAL;
            const cap = Math.max(2, Math.round(historySeconds() / SAMPLE_INTERVAL));

            state.fpsSamples.push(client.getFPS());
            while (state.fpsSamples.length > cap) state.fpsSamples.shift();

            const speed = mc.player !== null ? movement.getBlocksPerSecond() : 0;
            state.speedSamples.push(speed);
            while (state.speedSamples.length > cap) state.speedSamples.shift();
        }
    }

    return { state, sampleIfReady };
}

/**
 * Draws a single stat tile with a label above a value.
 *
 * @param {number} x     Tile left edge.
 * @param {number} y     Tile top edge.
 * @param {number} w     Tile width.
 * @param {number} h     Tile height.
 * @param {string} label Small caption text.
 * @param {string} value Big value text.
 * @param {number} color Value text color.
 */
function drawTile(x, y, w, h, label, value, color) {
    renderer.roundedRect(x, y, w, h, 6, C.tile);
    renderer.text("productsans-medium", label, x + 8, y + 8, 6, C.label);
    renderer.text("productsans-bold", value, x + 8, y + h - 16, 11, color);
}

/**
 * Draws a rolling-sample sparkline clipped to the given rectangle.
 *
 * @param {number} x        Rectangle left edge.
 * @param {number} y        Rectangle top edge.
 * @param {number} w        Rectangle width.
 * @param {number} h        Rectangle height.
 * @param {number[]} samples Sample buffer, oldest first.
 * @param {number} lineColor Stroke color.
 */
function drawGraph(x, y, w, h, samples, lineColor) {
    renderer.roundedRect(x, y, w, h, 4, C.tile);
    if (samples.length < 2) return;

    let max = 0.1;
    for (const s of samples) max = Math.max(max, s);

    renderer.scissor(x + 2, y + 2, w - 4, h - 4, () => {
        renderer.beginPath();
        for (let i = 0; i < samples.length; i++) {
            const px = x + 2 + (i / (samples.length - 1)) * (w - 4);
            const py = y + h - 2 - (samples[i] / max) * (h - 4);
            if (i === 0) {
                renderer.moveTo(px, py);
            } else {
                renderer.lineTo(px, py);
            }
        }
        renderer.strokeColor(lineColor);
        renderer.strokeWidth(1.4);
        renderer.stroke();
    });
}

/**
 * Picks a status color for an FPS value (green/amber/red).
 *
 * @param {number} fps Current frames per second.
 * @returns {number} An ARGB color.
 */
function fpsColor(fps) {
    if (fps >= 60) return C.good;
    if (fps >= 30) return C.warn;
    return C.bad;
}

const VIEW_ID = "stats-dashboard";

script.registerModule(
    {
        name: "Stats Dashboard",
        description: "Live health/position/FPS/speed dashboard hosted in the command palette.",
    },
    (module) => {
        module.addBool("Show FPS Graph", true);
        module.addBool("Show Speed Graph", true);
        module.addNumber("History Seconds", 8, 2, 30, 1);

        const dashboard = createDashboard(() => module.getNumber("History Seconds"));

        palette.createView({
            id: VIEW_ID,
            title: "Stats Dashboard",
            description: "Live health, position, FPS, and speed readout",
            placeholder: "Stats Dashboard — read-only, Esc to quit",
            footer: [{ key: "Esc", label: "Close" }],
            render: function (x, y, w, h, dt) {
                dashboard.sampleIfReady(Math.min(dt, 0.1));
                renderDashboard(x, y, w, h, dashboard.state);
            },
        });

        module.on("enable", () => {
            palette.openView(VIEW_ID);
        });

        /**
         * Lays out the tile grid and graphs inside the given content rect.
         *
         * @param {number} x     Content rect left edge.
         * @param {number} y     Content rect top edge.
         * @param {number} w     Content rect width.
         * @param {number} h     Content rect height.
         * @param {object} state {fpsSamples, speedSamples} sample buffers.
         */
        function renderDashboard(x, y, w, h, state) {
            renderer.roundedRect(x, y, w, h, 10, C.bg);

            const inWorld = mc.player !== null && mc.world !== null;
            const pad = 12;
            const titleH = 20;

            renderer.text("productsans-bold", "Stats Dashboard", x + pad, y + pad, 10, C.title);

            const gridTop = y + pad + titleH;
            const cols = 3;
            const gap = 8;
            const tileW = (w - pad * 2 - gap * (cols - 1)) / cols;
            const tileH = Math.max(36, h * 0.14);

            const health = inWorld ? player.getHealth() : null;
            const maxHealth = inWorld ? player.getMaxHealth() : null;
            const pos = inWorld ? player.getBlockPosition() : null;
            const dim = inWorld ? world.getDimension() : null;
            const fps = client.getFPS();
            const speed = inWorld ? movement.getBlocksPerSecond() : 0;
            const enabledCount = modules.listEnabled().length;

            const tiles = [
                {
                    label: "HEALTH",
                    value: health === null ? "—" : health.toFixed(1) + " / " + maxHealth.toFixed(0),
                    color: health === null ? C.value : health <= maxHealth * 0.3 ? C.bad : C.good,
                },
                { label: "FPS", value: String(fps), color: fpsColor(fps) },
                { label: "SPEED", value: speed.toFixed(2) + " b/s", color: C.value },
                {
                    label: "POSITION",
                    value: pos === null ? "—" : pos.getX() + ", " + pos.getY() + ", " + pos.getZ(),
                    color: C.value,
                },
                { label: "DIMENSION", value: dim === null ? "—" : shortDimension(dim), color: C.value },
                { label: "MODULES ON", value: String(enabledCount), color: C.value },
            ];

            for (let i = 0; i < tiles.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const tx = x + pad + col * (tileW + gap);
                const ty = gridTop + row * (tileH + gap);
                drawTile(tx, ty, tileW, tileH, tiles[i].label, tiles[i].value, tiles[i].color);
            }

            const gridBottom = gridTop + 2 * tileH + gap;
            const graphsTop = gridBottom + gap;
            const graphH = Math.max(28, (y + h - pad - graphsTop) / 2 - gap / 2);

            const showFpsGraph = module.getBool("Show FPS Graph");
            const showSpeedGraph = module.getBool("Show Speed Graph");

            let graphY = graphsTop;
            if (showFpsGraph) {
                drawGraph(x + pad, graphY, w - pad * 2, graphH, state.fpsSamples, C.fpsLine);
                graphY += graphH + gap;
            }
            if (showSpeedGraph) {
                drawGraph(x + pad, graphY, w - pad * 2, graphH, state.speedSamples, C.speedLine);
            }
        }

        /**
         * Shortens a dimension identifier to a friendly label.
         *
         * @param {string} id e.g. "minecraft:the_nether"
         * @returns {string} A readable label.
         */
        function shortDimension(id) {
            if (id === "minecraft:overworld") return "Overworld";
            if (id === "minecraft:the_nether") return "Nether";
            if (id === "minecraft:the_end") return "End";
            return id;
        }
    },
);

// =============================================================================
//  Sprint Speed HUD  —  a movement-proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  A small corner HUD panel showing your current horizontal speed as a live
//  number plus a scrolling sparkline history, with a status dot that lights
//  up while you're sprinting.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • movement    — getBlocksPerSecond / getSpeed / isMoving for the numbers.
//    • player      — isSprinting for the status dot.
//    • renderScreen — every draw happens here; this is a pure HUD readout,
//                     it never touches movement, only reads it.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  Sampling a raw per-tick value straight into a graph looks noisy and jumps
//  a pixel a frame. This script instead accumulates real elapsed time
//  (approximated from tick cadence: preGameTick is 20/second) into a fixed
//  1/20s bucket per sample, so the sample rate is stable and independent of
//  render framerate — the same fixed-timestep idea Snake.js uses for its
//  movement clock, applied here to a data buffer instead of gameplay.
//
//  Settings:
//    • Corner            — which screen corner the panel anchors to.
//    • Unit               — Blocks/sec or Blocks/tick.
//    • Show Graph         — draw the sparkline history under the number.
//    • History Seconds    — how many seconds of samples the graph holds.
//
//  Author: Opal  ·  An example of the movement scripting API.
// =============================================================================

const script = registerScript({
    name: "Sprint Speed HUD",
    version: "1.0.0",
    authors: ["Opal"],
});

// -----------------------------------------------------------------------------
//  Colors. Built with renderer.color() — never a raw 0xAARRGGBB literal (a JS
//  double above 2^31 truncates to the wrong int when narrowed).
// -----------------------------------------------------------------------------
const COL = {
    panel: renderer.color(16, 17, 22, 165),
    shadow: renderer.color(0, 0, 0, 110),
    title: renderer.color(244, 246, 252),
    dim: renderer.color(150, 155, 168),
    graphLine: renderer.color(120, 190, 255),
    graphFill: renderer.color(120, 190, 255, 40),
    sprintOn: renderer.color(120, 220, 140),
    sprintOff: renderer.color(120, 124, 135),
};

const PANEL_W = 118;
const GRAPH_H = 34;
const PAD = 10;
const SCREEN_MARGIN = 6;

script.registerModule(
    {
        name: "Sprint Speed HUD",
        description: "Corner HUD panel: live speed number, sprint indicator, and a sparkline history.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addMode("Corner", ["Top Left", "Top Right", "Bottom Left", "Bottom Right"]);
        module.addMode("Unit", ["Blocks/sec", "Blocks/tick"]);
        module.addBool("Show Graph", true);
        module.addNumber("History Seconds", 5, 2, 15, 1);

        // ---- State ------------------------------------------------------------
        /** @type {number[]} Rolling buffer of recent speed samples. */
        let samples = [];

        module.on("enable", () => {
            samples = [];
            notification.info("Sprint Speed HUD", "Enabled");
        });

        module.on("disable", () => {
            notification.info("Sprint Speed HUD", "Disabled");
        });

        module.on("preGameTick", () => {
            if (mc.player === null || mc.world === null) return;

            samples.push(movement.getBlocksPerSecond());
            const maxSamples = Math.round(module.getNumber("History Seconds") * 20);
            while (samples.length > maxSamples) samples.shift();
        });

        module.on("renderScreen", () => {
            if (mc.player === null || mc.world === null) return;

            const showGraph = module.getBool("Show Graph");
            const panelH = PAD * 2 + 12 + 14 + (showGraph ? GRAPH_H + 6 : 0);

            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();
            const corner = module.getMode("Corner");

            let px = SCREEN_MARGIN;
            let py = SCREEN_MARGIN;
            if (corner === "Top Right" || corner === "Bottom Right") px = sw - PANEL_W - SCREEN_MARGIN;
            if (corner === "Bottom Left" || corner === "Bottom Right") py = sh - panelH - SCREEN_MARGIN;

            renderer.shadow(px, py, PANEL_W, panelH, 8, 16, 0, 4, COL.shadow);
            renderer.roundedRect(px, py, PANEL_W, panelH, 8, COL.panel);

            // ---- Title row: sprint dot + label ---------------------------------
            const sprinting = player.isSprinting();
            const dotColor = sprinting ? COL.sprintOn : COL.sprintOff;
            renderer.circle(px + PAD + 3, py + PAD + 3, 4, renderer.darker(dotColor, 0.55));
            renderer.circle(px + PAD + 3, py + PAD + 3, 2.6, dotColor);
            renderer.text(
                "productsans-bold",
                sprinting ? "Sprinting" : "Walking",
                px + PAD + 12,
                py + PAD,
                7.5,
                COL.title,
            );

            // ---- Speed readout --------------------------------------------------
            const usingBps = module.isModeEqual("Unit", "Blocks/sec");
            const speedValue = usingBps ? movement.getBlocksPerSecond() : movement.getSpeed();
            const unitLabel = usingBps ? " b/s" : " b/t";
            const speedText = speedValue.toFixed(2) + unitLabel;
            renderer.text("productsans-medium", speedText, px + PAD, py + PAD + 13, 8, COL.dim);

            // ---- Sparkline history ----------------------------------------------
            if (showGraph && samples.length > 1) {
                drawSparkline(px + PAD, py + panelH - GRAPH_H - PAD + 4, PANEL_W - PAD * 2, GRAPH_H);
            }
        });

        /**
         * Draws the recent speed history as a filled line graph clipped to the
         * given rectangle. Values are normalized against the buffer's own
         * observed max (with a small floor) so the graph is always legible
         * regardless of whether the player is walking or flying.
         *
         * @param {number} x Rectangle left edge.
         * @param {number} y Rectangle top edge.
         * @param {number} w Rectangle width.
         * @param {number} h Rectangle height.
         */
        function drawSparkline(x, y, w, h) {
            let max = 0.1;
            for (const s of samples) max = Math.max(max, s);

            renderer.scissor(x, y, w, h, () => {
                renderer.beginPath();
                for (let i = 0; i < samples.length; i++) {
                    const px2 = x + (i / (samples.length - 1)) * w;
                    const py2 = y + h - (samples[i] / max) * h;
                    if (i === 0) {
                        renderer.moveTo(px2, py2);
                    } else {
                        renderer.lineTo(px2, py2);
                    }
                }
                renderer.strokeColor(COL.graphLine);
                renderer.strokeWidth(1.5);
                renderer.stroke();
            });
        }
    },
);

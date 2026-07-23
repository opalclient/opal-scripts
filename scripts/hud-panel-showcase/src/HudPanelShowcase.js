// =============================================================================
//  HUD Panel Showcase  —  a pure renderer example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  A single HUD panel with no gameplay logic at all — its only job is to
//  show off as much of the `renderer` proxy's surface as reasonably fits in
//  one card:
//
//    • roundedRectVarying   — an asymmetric card silhouette (sharp top-left,
//                             round everywhere else).
//    • shadow + blurFill    — a soft drop shadow and frosted-glass backdrop.
//    • rectGradient / textGradient — a gradient header bar and gradient title.
//    • the Path API          — a hand-drawn wave underline beneath the title
//                             (moveTo/quadTo/stroke).
//    • an idle bar-graph     — eight bars animated on independent sine
//                             phases, purely decorative (rect/roundedRect).
//    • glowFill              — a soft glow behind the accent bar.
//    • color helpers         — interpolate/darker/brighter/withAlpha/
//                             applyOpacity, used throughout instead of
//                             hand-picking extra hex constants.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • renderer     — everything in this file.
//    • renderScreen — the only place these draw calls are valid.
//
//  Settings:
//    • Theme    — Aurora / Sunset / Mono gradient pairs.
//    • Animate  — whether the bar graph and gradient angle idle-animate.
//    • Corner   — which screen corner the panel anchors to.
//
//  Author: Opal  ·  A renderer-proxy showcase for the scripting API.
// =============================================================================

const script = registerScript({
    name: "HUD Panel Showcase",
    version: "1.0.0",
    authors: ["Opal"],
});

const THEMES = {
    Aurora: { a: renderer.color(120, 255, 220), b: renderer.color(120, 160, 255) },
    Sunset: { a: renderer.color(255, 170, 110), b: renderer.color(255, 90, 130) },
    Mono: { a: renderer.color(230, 230, 240), b: renderer.color(120, 125, 140) },
};

const PANEL_W = 190;
const PANEL_H = 96;
const SCREEN_MARGIN = 8;

/**
 * @returns {number} Wall-clock seconds, used for every idle animation below.
 */
function nowSeconds() {
    return (typeof Date !== "undefined" && Date.now ? Date.now() : 0) / 1000;
}

script.registerModule(
    {
        name: "HUD Panel Showcase",
        description: "A single HUD card that showcases the renderer proxy's shapes, gradients, and path API.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addMode("Theme", ["Aurora", "Sunset", "Mono"]);
        module.addBool("Animate", true);
        module.addMode("Corner", ["Top Left", "Top Right", "Bottom Left", "Bottom Right"]);

        module.on("enable", () => {
            notification.info("HUD Panel Showcase", "Enabled");
        });

        module.on("disable", () => {
            notification.info("HUD Panel Showcase", "Disabled");
        });

        module.on("renderScreen", () => {
            const theme = THEMES[module.getMode("Theme")] || THEMES.Aurora;
            const animate = module.getBool("Animate");
            const t = animate ? nowSeconds() : 0;

            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();
            const corner = module.getMode("Corner");

            let x = SCREEN_MARGIN;
            let y = SCREEN_MARGIN;
            if (corner === "Top Right" || corner === "Bottom Right") x = sw - PANEL_W - SCREEN_MARGIN;
            if (corner === "Bottom Left" || corner === "Bottom Right") y = sh - PANEL_H - SCREEN_MARGIN;

            drawCard(x, y, theme, t);
        });

        /**
         * Draws the full showcase card at the given top-left corner.
         *
         * @param {number} x     Card left edge.
         * @param {number} y     Card top edge.
         * @param {object} theme {a, b} gradient color pair.
         * @param {number} t     Wall-clock seconds (0 when animation is off).
         */
        function drawCard(x, y, theme, t) {
            // Backdrop: shadow, frosted blur, then an asymmetric silhouette —
            // sharp top-left corner, rounded everywhere else.
            renderer.shadow(x, y, PANEL_W, PANEL_H, 10, 20, 0, 6, renderer.color(0, 0, 0, 130));
            renderer.blurFill(x, y, PANEL_W, PANEL_H, 10);
            renderer.roundedRectVarying(x, y, PANEL_W, PANEL_H, 0, 14, 14, 14, renderer.color(14, 15, 20, 150));

            // Gradient header bar. The angle slowly rotates when animating,
            // showing rectGradient's angle parameter is a live, drawable value.
            const angle = animate2(t) * 30;
            renderer.roundedRectVarying(x, y, PANEL_W, 30, 0, 14, 0, 0, applyDim(theme));
            renderer.rectGradient(x, y, PANEL_W, 30, theme.a, theme.b, angle);

            // Gradient title text.
            renderer.textGradient("productsans-bold", "Renderer Showcase", x + 12, y + 9, 9, renderer.brighter(theme.a, 0.3), renderer.brighter(theme.b, 0.3));

            // A hand-drawn wave underline via the Path API.
            drawWaveUnderline(x + 12, y + 24, PANEL_W - 24, t);

            // Idle bar graph: 8 bars on independent sine phases.
            drawBarGraph(x + 12, y + 44, PANEL_W - 24, 32, theme, t);

            // A soft glow behind a thin accent bar along the bottom edge, to
            // show off glowFill as something other than a full-panel effect.
            const accentY = y + PANEL_H - 10;
            renderer.glowFill(x + 12, accentY, PANEL_W - 24, 4, 2);
            renderer.roundedRect(x + 12, accentY, PANEL_W - 24, 4, 2, renderer.interpolate(theme.a, theme.b, 0.5));
        }

        /**
         * A slow oscillator in [0, 1] used to animate the gradient angle.
         *
         * @param {number} t Wall-clock seconds.
         * @returns {number} Oscillator value.
         */
        function animate2(t) {
            return 0.5 + 0.5 * Math.sin(t * 0.6);
        }

        /**
         * Dims a theme's first color for use as a flat header backing before
         * the gradient draws on top (keeps the sharp corner from showing the
         * blur-fill color through the header region).
         *
         * @param {object} theme {a, b} gradient color pair.
         * @returns {number} A darkened ARGB color.
         */
        function applyDim(theme) {
            return renderer.darker(theme.a, 0.7);
        }

        /**
         * Draws a single decorative sine-wave underline beneath the title.
         *
         * @param {number} x Left edge.
         * @param {number} y Vertical center of the wave.
         * @param {number} w Width to span.
         * @param {number} t Wall-clock seconds.
         */
        function drawWaveUnderline(x, y, w, t) {
            const segments = 24;
            const amplitude = 2.2;

            renderer.beginPath();
            for (let i = 0; i <= segments; i++) {
                const px = x + (i / segments) * w;
                const py = y + Math.sin(i * 0.9 + t * 2) * amplitude;
                if (i === 0) {
                    renderer.moveTo(px, py);
                } else {
                    renderer.lineTo(px, py);
                }
            }
            renderer.strokeColor(renderer.color(255, 255, 255, 90));
            renderer.strokeWidth(1.2);
            renderer.stroke();
        }

        /**
         * Draws 8 bars whose heights follow independent sine phases —
         * purely decorative, no data behind it.
         *
         * @param {number} x     Left edge.
         * @param {number} y     Top edge.
         * @param {number} w     Total width available for all bars.
         * @param {number} h     Max bar height.
         * @param {object} theme {a, b} gradient color pair.
         * @param {number} t     Wall-clock seconds.
         */
        function drawBarGraph(x, y, w, h, theme, t) {
            const bars = 8;
            const gap = 3;
            const barW = (w - gap * (bars - 1)) / bars;

            for (let i = 0; i < bars; i++) {
                const phase = i * 0.7;
                const f = 0.5 + 0.5 * Math.sin(t * 2.4 + phase);
                const barH = Math.max(3, f * h);
                const bx = x + i * (barW + gap);
                const by = y + h - barH;
                const color = renderer.interpolate(theme.a, theme.b, i / (bars - 1));
                renderer.roundedRect(bx, by, barW, barH, barW / 2, color);
            }
        }
    },
);

// =============================================================================
//  Day Cycle Clock  —  a world-proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  A Dynamic Island showing the current in-game time as a clock ("14:32")
//  plus a gradient bar spanning the full day/night cycle with a marker dot
//  showing exactly where "now" sits between sunrise, noon, sunset, and
//  midnight.
//
//  WHICH GLOBALS
//  -------------
//    • world    — getTimeOfDay() (0-24000 ticks/day) and getDimension().
//    • overlay  — the Dynamic Island itself.
//    • renderer — the gradient bar, marker, and clock text.
//
//  THE CONVERSION THIS TEACHES
//  ----------------------------
//  `world.getTimeOfDay()` returns raw ticks where 0 = sunrise, 6000 = noon,
//  12000 = sunset, 18000 = midnight (documented on the World proxy page).
//  Converting that to an ordinary 24-hour clock uses the standard Minecraft
//  wiki formula `hour = (ticks / 1000 + 6) mod 24` — plugging in the four
//  documented anchor ticks confirms it: 0 -> 6:00, 6000 -> 12:00,
//  12000 -> 18:00, 18000 -> 0:00.
//
//  The Nether and the End don't run a day/night cycle, so the island shows
//  a dimension label instead of a nonsense clock when `world.getDimension()`
//  isn't the Overworld — the same "don't invent data the API doesn't have"
//  approach `CoordinatesHud.js` takes with biomes.
//
//  Settings:
//    • Show Marker      — draw the moving "now" dot on the gradient bar.
//    • Show Phase Label — draw "Morning / Midday / Evening / Night" text.
//    • Format            — 24h or 12h clock display.
//
//  Author: Opal  ·  An example of the world scripting API.
// =============================================================================

const script = registerScript({
    name: "Day Cycle Clock",
    version: "1.0.0",
    authors: ["Opal"],
});

const TICKS_PER_DAY = 24000;

// Gradient stops across the cycle: dawn -> day -> dusk -> night -> (dawn).
const COL_DAWN = renderer.color(255, 173, 110);
const COL_DAY = renderer.color(135, 206, 250);
const COL_DUSK = renderer.color(255, 120, 90);
const COL_NIGHT = renderer.color(30, 35, 70);

const SHADOW = renderer.color(0, 0, 0, 120);
const PANEL = renderer.color(16, 16, 22, 150);
const TEXT = renderer.color(244, 244, 250);
const DIM = renderer.color(165, 170, 185);
const SUN = renderer.color(255, 214, 110);
const MOON = renderer.color(210, 215, 230);

const ISLAND_H = 32;
const RADIUS = ISLAND_H / 2;
const PAD = 10;
const BAR_H = 6;
const BAR_W = 70;

/**
 * Converts raw world time-of-day ticks (0-24000, 0 = sunrise) into a
 * fractional 24-hour clock value, per the documented anchor ticks.
 *
 * @param {number} ticks world.getTimeOfDay() value.
 * @returns {number} Hour of day in [0, 24).
 */
function ticksToHour(ticks) {
    const normalized = ((ticks % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
    return (normalized / 1000 + 6) % 24;
}

/**
 * Formats a fractional hour as HH:MM (24h) or H:MM AM/PM (12h).
 *
 * @param {number} hour  Fractional hour in [0, 24).
 * @param {boolean} is12h Whether to render in 12-hour format.
 * @returns {string} The formatted clock string.
 */
function formatClock(hour, is12h) {
    const totalMinutes = Math.floor(hour * 60);
    const h24 = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    const pad2 = (n) => (n < 10 ? "0" + n : "" + n);

    if (!is12h) return pad2(h24) + ":" + pad2(m);

    const suffix = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + pad2(m) + " " + suffix;
}

/**
 * Labels the rough phase of day for a given hour.
 *
 * @param {number} hour Fractional hour in [0, 24).
 * @returns {string} A human-readable phase label.
 */
function phaseLabel(hour) {
    if (hour >= 5 && hour < 11) return "Morning";
    if (hour >= 11 && hour < 15) return "Midday";
    if (hour >= 15 && hour < 19) return "Evening";
    return "Night";
}

script.registerModule(
    {
        name: "Day Cycle Clock",
        description: "Dynamic Island showing the in-game clock and day/night progress.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addBool("Show Marker", true);
        module.addBool("Show Phase Label", true);
        module.addMode("Format", ["24h", "12h"]);

        // ---- State --------------------------------------------------------
        /** @type {string|null} Active island handle, or null while hidden. */
        let islandId = null;

        module.on("enable", () => {
            islandId = overlay.createIsland({
                width: 190,
                height: ISLAND_H,
                priority: 12,
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
         * Draws the island: sun/moon icon, clock text, phase label, and the
         * gradient day-progress bar with its marker.
         *
         * @param {number} x        Island left edge.
         * @param {number} y        Island top edge.
         * @param {number} w        Island width.
         * @param {number} h        Island height.
         * @param {number} progress Reveal animation progress (0.0 - 1.0).
         */
        function renderIsland(x, y, w, h, progress) {
            renderer.globalAlpha(progress);
            renderer.shadow(x, y, w, h, RADIUS, 18, 0, 4, SHADOW);
            renderer.blurFill(x, y, w, h, RADIUS);
            renderer.roundedRect(x, y, w, h, RADIUS, PANEL);

            if (mc.getWorld() === null || world.getDimension() !== "minecraft:overworld") {
                const label = mc.getWorld() === null ? "No world" : prettyDimension(world.getDimension());
                renderer.text("productsans-bold", label, x + PAD, y + h / 2 - 4, 8, DIM);
                renderer.globalAlpha(1);
                return;
            }

            const ticks = world.getTimeOfDay();
            const hour = ticksToHour(ticks);
            const isDay = hour >= 5 && hour < 19;

            // Icon: sun during the day, moon at night — both plain circles so
            // no font glyph / image asset is required.
            const iconCX = x + PAD + 7;
            const iconCY = y + h / 2;
            renderer.circle(iconCX, iconCY, 8, renderer.darker(isDay ? SUN : MOON, 0.55));
            renderer.circle(iconCX, iconCY, 6, isDay ? SUN : MOON);
            if (!isDay) {
                // A small crescent bite via an offset dark circle over the moon.
                renderer.circle(iconCX + 2.6, iconCY - 1.6, 5, renderer.darker(PANEL, 0.3));
            }

            const clockText = formatClock(hour, module.isModeEqual("Format", "12h"));
            const textX = iconCX + 14;
            renderer.text("productsans-bold", clockText, textX, y + PAD - 2, 9, TEXT);

            if (module.getBool("Show Phase Label")) {
                renderer.text("productsans-medium", phaseLabel(hour), textX, y + PAD + 9, 6.5, DIM);
            }

            const barX = x + w - BAR_W - PAD;
            const barY = y + h / 2 - BAR_H / 2;
            renderer.roundedRectGradient(barX, barY, BAR_W / 2, BAR_H, BAR_H / 2, COL_NIGHT, COL_DAWN, 0);
            renderer.roundedRectGradient(barX + BAR_W / 2, barY, BAR_W / 2, BAR_H, BAR_H / 2, COL_DAY, COL_DUSK, 0);

            if (module.getBool("Show Marker")) {
                const t = ticks / TICKS_PER_DAY;
                const markerX = barX + t * BAR_W;
                renderer.circle(markerX, barY + BAR_H / 2, 4, renderer.darker(TEXT, 0.4));
                renderer.circle(markerX, barY + BAR_H / 2, 2.6, TEXT);
            }

            renderer.globalAlpha(1);
        }

        /**
         * Friendly label for a dimension identifier (mirrors CoordinatesHud.js).
         *
         * @param {string} id e.g. "minecraft:the_nether"
         * @returns {string} A readable label.
         */
        function prettyDimension(id) {
            if (id === "minecraft:the_nether") return "The Nether";
            if (id === "minecraft:the_end") return "The End";
            const path = id.indexOf(":") >= 0 ? id.substring(id.indexOf(":") + 1) : id;
            const spaced = path.split("_").join(" ");
            return spaced.length > 0 ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : id;
        }
    },
);

// -----------------------------------------------------------------------------
//  Test hook. `module` does not exist inside the Opal/GraalVM runtime, so this
//  is always skipped there — it only runs under plain Node, where tests/
//  import the pure tick/clock conversions in isolation. See tests/DayCycleClock.test.js.
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = { ticksToHour, formatClock, phaseLabel, TICKS_PER_DAY };
}

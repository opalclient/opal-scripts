// =============================================================================
//  Fall Warning  —  a player-proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Watches your fall distance while airborne and warns you — once per fall,
//  before you land — when the estimated damage looks dangerous. A thin red
//  vignette pulses at the screen edges as an extra non-intrusive cue.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • player      — getFallDistance / isOnGround / getHealth for the estimate.
//    • notification — a single warn toast per dangerous fall.
//    • renderScreen — the optional edge-vignette flash.
//
//  THE ESTIMATE IS DELIBERATELY APPROXIMATE
//  ------------------------------------------
//  Vanilla fall damage is roughly "1 damage per block fallen beyond 3
//  blocks", modified by Feather Falling, Jump Boost, potions, armor
//  toughness, and elytra/slow-falling state — none of which the scripting
//  API exposes a calculator for. This script uses the bare formula
//  `max(0, fallDistance - 3)` as a rough estimate, not a source of truth.
//  It is accurate enough to be a useful early-warning heuristic and wildly
//  wrong the moment any of those modifiers apply — that tradeoff is called
//  out here rather than hidden.
//
//  Settings:
//    • Warn At Damage    — flat estimated-damage threshold to warn at.
//    • Only If Dangerous — additionally require the estimate to exceed your
//                          current health minus a safety buffer (i.e. only
//                          warn when the fall could actually be lethal-ish).
//    • Health Buffer     — the safety margin used by the check above.
//    • Screen Flash      — draw the pulsing edge vignette while airborne past
//                          the warning threshold.
//
//  Author: Opal  ·  An example of the player scripting API.
// =============================================================================

const script = registerScript({
    name: "Fall Warning",
    version: "1.0.0",
    authors: ["Opal"],
});

const SAFE_FALL_BLOCKS = 3; // vanilla's fall-damage-free buffer

/**
 * Rough vanilla-style fall damage estimate. See the header comment for the
 * modifiers this deliberately ignores.
 *
 * @param {number} fallDistance Blocks fallen so far.
 * @returns {number} Estimated damage in half-hearts-as-hearts (HP).
 */
function estimateFallDamage(fallDistance) {
    return Math.max(0, fallDistance - SAFE_FALL_BLOCKS);
}

script.registerModule(
    {
        name: "Fall Warning",
        description: "Warns before a fall lands if the estimated damage looks dangerous.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addNumber("Warn At Damage", 6, 1, 20, 0.5);
        module.addBool("Only If Dangerous", true);
        module.addNumber("Health Buffer", 2, 0, 10, 0.5);
        module.addGroup("Danger Check", ["Only If Dangerous", "Health Buffer"]);
        module.addBool("Screen Flash", true);

        // ---- State ------------------------------------------------------------
        /** @type {boolean} Whether the current fall has already been warned about. */
        let warnedThisFall = false;

        /** @type {boolean} Whether the vignette should currently be drawn. */
        let flashActive = false;

        module.on("enable", () => {
            warnedThisFall = false;
            flashActive = false;
        });

        module.on("disable", () => {
            flashActive = false;
        });

        module.on("preGameTick", () => {
            if (mc.player === null || mc.world === null) return;

            if (player.isOnGround()) {
                warnedThisFall = false;
                flashActive = false;
                return;
            }

            const estimate = estimateFallDamage(player.getFallDistance());
            if (estimate <= 0) {
                flashActive = false;
                return;
            }

            const overThreshold = estimate >= module.getNumber("Warn At Damage");
            const dangerous =
                !module.getBool("Only If Dangerous") ||
                estimate >= player.getHealth() - module.getNumber("Health Buffer");

            flashActive = overThreshold && dangerous;

            if (flashActive && !warnedThisFall) {
                notification.warn(
                    "Fall Warning",
                    "~" + estimate.toFixed(1) + " damage incoming on landing",
                );
                warnedThisFall = true;
            }
        });

        module.on("renderScreen", () => {
            if (!module.getBool("Screen Flash") || !flashActive) return;

            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();

            // A slow pulse via the wall clock, kept purely cosmetic.
            const t = (typeof Date !== "undefined" && Date.now ? Date.now() : 0) / 1000;
            const pulse = 0.35 + 0.25 * Math.sin(t * 5);
            const edge = renderer.color(220, 60, 60, Math.round(255 * pulse * 0.5));
            const bandWidth = Math.max(10, sh * 0.05);

            renderer.rectGradient(0, 0, sw, bandWidth, edge, renderer.withAlpha(edge, 0), 90);
            renderer.rectGradient(0, sh - bandWidth, sw, bandWidth, renderer.withAlpha(edge, 0), edge, 90);
        });
    },
);

// -----------------------------------------------------------------------------
//  Test hook. `module` does not exist inside the Opal/GraalVM runtime, so this
//  is always skipped there — it only runs under plain Node, where tests/
//  import the pure damage-estimate formula in isolation. See tests/FallWarning.test.js.
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = { estimateFallDamage, SAFE_FALL_BLOCKS };
}

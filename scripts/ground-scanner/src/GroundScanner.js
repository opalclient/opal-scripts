// =============================================================================
//  Ground Scanner  —  a world + player + renderer + notification combo for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Scans straight down from your feet, block by block, and shows how far it
//  is to the nearest solid block below you — useful spatial awareness for
//  cave diving, pillaring, bridging over ravines, or just not walking off an
//  edge you can't see past your own hotbar. A small HUD strip shows the gap
//  size and turns amber, then red, the deeper it gets; a one-shot toast fires
//  when you step out over a drop past the configured danger threshold.
//
//  This deliberately covers different ground from `scripts/fall-warning/src/FallWarning.js`:
//  FallWarning reacts to a fall already in progress using
//  `player.getFallDistance()`; this script instead answers "is there ground
//  under me right now, and how far down", using a plain block-by-block scan.
//  Different technique, different question, worth having both.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • player       — getBlockPosition, isOnGround.
//    • world        — isAir/isSolid to scan the column below.
//    • notification — a one-shot warning when a scary gap opens up.
//    • renderer     — the HUD strip.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  Straight-down is a block-grid problem, not a vector one, so this never
//  touches player position as a vector at all: it reads
//  `player.getBlockPosition()` (an integer `BlockPos`) once, then constructs
//  new `BlockPos` values by subtracting from `getY()` in a loop — no raycast,
//  no direction vector, just block-grid arithmetic. `player.getPosition()`
//  would hand back a `ScriptVec3` whose components read fine, but rounding a
//  double back onto the block grid on every iteration only adds a way to be
//  subtly wrong.
//
//  Settings:
//    • Max Scan Depth  — how many blocks down to look before giving up.
//    • Danger Depth    — gap size (blocks) that triggers the warning toast.
//    • Show HUD        — draw the gap-depth HUD strip.
//
//  Author: Opal  ·  A combo example of the world + player + renderer +
//  notification scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Ground Scanner",
    version: "1.0.0",
    authors: ["Opal"],
});

const COL = {
    panel: renderer.color(16, 17, 22, 165),
    safe: renderer.color(120, 220, 140),
    caution: renderer.color(255, 196, 76),
    danger: renderer.color(255, 99, 99),
    label: renderer.color(165, 170, 185),
};

script.registerModule(
    {
        name: "Ground Scanner",
        description: "Shows how many blocks of empty space are directly below you.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addNumber("Max Scan Depth", 24, 4, 64, 1);
        module.addNumber("Danger Depth", 6, 2, 30, 1);
        module.addBool("Show HUD", true);

        // ---- State ------------------------------------------------------------
        /** @type {boolean} Whether the current gap has already triggered a toast. */
        let warnedThisGap = false;

        /** @type {number} Most recent scan result, in blocks (0 = solid underfoot). */
        let lastGap = 0;

        module.on("enable", () => {
            warnedThisGap = false;
            lastGap = 0;
        });

        module.on("disable", () => {});

        module.on("preGameTick", () => {
            if (mc.getPlayer() === null || mc.getWorld() === null) return;

            if (player.isOnGround()) {
                lastGap = 0;
                warnedThisGap = false;
                return;
            }

            lastGap = scanDepth(module.getNumber("Max Scan Depth"));

            const dangerDepth = module.getNumber("Danger Depth");
            if (lastGap >= dangerDepth && !warnedThisGap) {
                notification.warn("Ground Scanner", "No ground for " + lastGap + "+ blocks below");
                warnedThisGap = true;
            } else if (lastGap < dangerDepth) {
                warnedThisGap = false;
            }
        });

        module.on("renderScreen", () => {
            if (!module.getBool("Show HUD") || mc.getPlayer() === null || mc.getWorld() === null) return;
            if (player.isOnGround()) return;

            const dangerDepth = module.getNumber("Danger Depth");
            const color = lastGap >= dangerDepth ? COL.danger : lastGap >= dangerDepth / 2 ? COL.caution : COL.safe;

            const text = lastGap >= module.getNumber("Max Scan Depth") ? "No floor found" : lastGap + " blocks to ground";
            const size = 8;
            const tw = renderer.textWidth("productsans-bold", text, size);
            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();

            const x = sw / 2 - (tw + 20) / 2;
            const y = sh - 70;

            renderer.roundedRect(x, y, tw + 20, size + 10, 5, COL.panel);
            renderer.text("productsans-bold", text, x + 10, y + 5, size, color);
        });

        /**
         * Scans straight down from the player's feet, block by block, and
         * returns the number of empty (air) blocks before the first solid
         * one — or `maxDepth` if none is found within that range.
         *
         * @param {number} maxDepth Maximum number of blocks to scan downward.
         * @returns {number} Blocks of empty space before solid ground.
         */
        function scanDepth(maxDepth) {
            const feet = player.getBlockPosition();
            const cap = Math.round(maxDepth);

            for (let i = 1; i <= cap; i++) {
                const pos = new BlockPos(feet.getX(), feet.getY() - i, feet.getZ());
                if (world.isSolid(pos)) {
                    return i - 1;
                }
            }
            return cap;
        }
    },
);

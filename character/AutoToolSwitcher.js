// =============================================================================
//  Auto Tool Switcher  —  an inventory-proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Silently switches to the best matching tool in your hotbar for the block
//  roughly in front of you (ore/stone -> pickaxe, logs/planks -> axe,
//  dirt/sand/gravel -> shovel, leaves/wool/webs -> shears), so you are always
//  holding the right tool as you walk into a new block type.
//
//  WHICH GLOBALS
//  -------------
//    • world      — getBlockName / isAir to read the target block.
//    • inventory  — findItem + setSlotSilent/setSlot to switch tools.
//    • player     — getYaw / getPitch / getBlockPosition to aim the "look".
//
//  THE GOTCHA THIS TEACHES — there is no `getTargetedBlock()`
//  ------------------------------------------------------------
//  You might expect a `world.getTargetedBlock()` or a crosshair raycast
//  helper. There isn't one. You *can* build a real per-block DDA raycast
//  yourself: `player.getEyePosition()` and `rotation.getRotationVector(pitch,
//  yaw)` both hand back a `ScriptVec3`, whose `getX()/getY()/getZ()` are
//  readable, so you can march a direction vector and probe each step with
//  `world.isAir(new BlockPos(...))`.
//
//  (This example predates that. It was written when those methods returned a
//  raw Mojang `Vec3` — which, under the sandbox's `HostAccess.EXPLICIT`
//  policy, exported nothing at all: you could pass one back into another
//  proxy method but never read a component off it. The `ScriptVec3` wrapper
//  is what changed.)
//
//  What this script does instead is the deliberately coarser substitute: it
//  buckets `player.getYaw()` into one of 4 cardinal directions (the same idea
//  `CoordinatesHud.js` uses for its compass readout, just narrowed from 8
//  buckets to 4) and combines that with `player.getPitch()` to guess "the
//  block roughly where you're looking" — one step ahead of your feet, or
//  straight down/up if you're looking steeply that way. It stays a facing
//  heuristic because a switch-my-tool module does not need sub-block
//  precision, and the heuristic is ~15 lines against a raycast's ~60. It will
//  occasionally guess wrong on stairs/slabs or through a corner. Reach for the
//  raycast when you need the exact block; reach for this when you don't.
//
//  Settings:
//    • Switch Mode      — Silent (server-side only) or Normal (visible switch).
//    • Respect Combat   — never switch away from a weapon while holding one.
//    • Chat Feedback    — print a line whenever the held tool changes.
//
//  Author: Opal  ·  An example of the inventory + world scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Auto Tool Switcher",
    version: "1.0.0",
    authors: ["Opal"],
});

// -----------------------------------------------------------------------------
//  Facing buckets. Minecraft yaw: 0 = south (+Z), and it increases clockwise
//  viewed from above — the same convention CoordinatesHud.js documents, just
//  narrowed to 4 cardinal buckets instead of 8 (diagonal blocks are ambiguous
//  for a single "one step ahead" guess, so we round to the nearest cardinal).
// -----------------------------------------------------------------------------
const CARDINAL_OFFSETS = [
    { dx: 0, dz: 1 }, // S
    { dx: -1, dz: 0 }, // W
    { dx: 0, dz: -1 }, // N
    { dx: 1, dz: 0 }, // E
];

const PITCH_UP_THRESHOLD = -50; // looking steeply up
const PITCH_DOWN_THRESHOLD = 55; // looking steeply down

/**
 * Guesses the block the player is roughly facing by bucketing yaw into a
 * cardinal direction — a heuristic, not a raycast (see the header comment).
 *
 * @returns {BlockPos} The guessed target block position.
 */
function guessTargetBlock() {
    const feet = player.getBlockPosition();
    const pitch = player.getPitch();

    if (pitch <= PITCH_UP_THRESHOLD) {
        return new BlockPos(feet.getX(), feet.getY() + 2, feet.getZ()); // above head
    }
    if (pitch >= PITCH_DOWN_THRESHOLD) {
        return new BlockPos(feet.getX(), feet.getY() - 1, feet.getZ()); // below feet
    }

    const yaw = player.getYaw();
    const norm = ((yaw % 360) + 360) % 360;
    const bucket = Math.round(norm / 90) % 4;
    const offset = CARDINAL_OFFSETS[bucket];
    return new BlockPos(feet.getX() + offset.dx, feet.getY(), feet.getZ() + offset.dz);
}

/**
 * Heuristic block-name -> tool-keyword mapping. Deliberately simple substring
 * matching against `world.getBlockName()` rather than exhaustive block/tool
 * tag data (which the scripting API doesn't expose) — good enough to demo
 * the pattern, not a complete tool-tag implementation.
 *
 * @param {string} blockName Localized block display name, lowercased by the caller.
 * @returns {string|null} A search keyword for `inventory.findItem(...)`, or null.
 */
function toolKeywordFor(blockName) {
    const pickaxeWords = ["stone", "ore", "deepslate", "obsidian", "brick", "concrete", "terracotta", "basalt", "blackstone", "netherrack"];
    const axeWords = ["log", "wood", "plank", "stem", "hyphae", "bookshelf", "crafting table", "fence"];
    const shovelWords = ["dirt", "grass block", "sand", "gravel", "clay", "soul sand", "soul soil", "snow", "path", "mycelium", "podzol"];
    const shearWords = ["leaves", "wool", "web", "vine"];

    for (const w of pickaxeWords) if (blockName.includes(w)) return "pickaxe";
    for (const w of axeWords) if (blockName.includes(w)) return "axe";
    for (const w of shovelWords) if (blockName.includes(w)) return "shovel";
    for (const w of shearWords) if (blockName.includes(w)) return "shears";
    return null;
}

script.registerModule(
    {
        name: "Auto Tool Switcher",
        description: "Switches to the best hotbar tool for the block you're roughly facing.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addMode("Switch Mode", ["Silent", "Normal"]);
        module.addBool("Respect Combat", true);
        module.addBool("Chat Feedback", false);

        // ---- State ----------------------------------------------------------
        /** @type {number} Last hotbar slot we switched to, to avoid redundant packets. */
        let lastSlot = -1;

        module.on("enable", () => {
            lastSlot = -1;
            notification.info("Auto Tool Switcher", "Enabled");
        });

        module.on("disable", () => {
            notification.info("Auto Tool Switcher", "Disabled");
        });

        module.on("preGameTick", () => {
            if (mc.getPlayer() === null || mc.getWorld() === null) return;

            // Never rip a weapon out of the player's hand mid-fight.
            if (module.getBool("Respect Combat") && player.isHoldingWeapon()) {
                return;
            }

            const target = guessTargetBlock();
            if (world.isAir(target)) return;

            const blockName = world.getBlockName(target).toLowerCase();
            const keyword = toolKeywordFor(blockName);
            if (keyword === null) return;

            const slot = inventory.findItem(keyword);
            if (slot === -1 || slot === lastSlot) return;

            if (module.isModeEqual("Switch Mode", "Silent")) {
                inventory.setSlotSilent(slot);
            } else {
                inventory.setSlot(slot);
            }
            lastSlot = slot;

            if (module.getBool("Chat Feedback")) {
                client.print("[Auto Tool Switcher] " + keyword + " for " + blockName);
            }
        });
    },
);

// -----------------------------------------------------------------------------
//  Test hook. `module` does not exist inside the Opal/GraalVM runtime, so this
//  is always skipped there — it only runs under plain Node, where tests/
//  import the pure heuristic in isolation. See tests/AutoToolSwitcher.test.js.
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = { toolKeywordFor };
}

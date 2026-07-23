// =============================================================================
//  Potion Alert  —  a player-effects + entity-threat example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Two things, both about potions:
//
//    1. YOUR effects, as a compact HUD column — name, roman-numeral level, and
//       time remaining — with the row flashing once an effect drops under the
//       warning threshold, so a Strength buff never quietly expires mid-fight.
//    2. THEIR effects. Scans nearby living entities and flags any player
//       running a combat buff (Strength / Speed / Resistance), showing their
//       health and armor next to it. "That guy is potted" is exactly the thing
//       you want to know before committing.
//
//  Bind it to a key with `module.setBind(keys.F7)` — the module registers its
//  own default bind at load, so it is toggleable from the moment it appears in
//  the module list without a trip through the binds menu.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • module     — setBind to claim a default key.
//    • keys       — the F7 code for that bind.
//    • player     — getEffects for your own active potions.
//    • world      — getLivingEntitiesInRange to find nearby entities.
//    • entity     — isPlayer / getName / getHealth / getArmor / hasEffect.
//    • renderer   — the HUD panel.
//    • notification — the one-shot expiry warning.
//    • renderScreen / preGameTick — where the draw and the scan run.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  Two conventions worth internalising, because neither will error at you:
//
//    • `getAmplifier()` is 0-based (raw Minecraft), `getLevel()` is 1-based
//      (what a nameplate shows). Strength II is amplifier 1, level 2. Use
//      getLevel() for anything a human reads, getAmplifier() for math.
//    • Living-only reads (`getHealth`, `getMaxHealth`, `getArmor`,
//      `getAbsorption`) answer `-1` — not null, not 0 — on an entity that
//      isn't living. `-1` is the sentinel the whole API uses for "absent or
//      not applicable", and 0 is a legitimate armor value, so gate on `>= 0`
//      rather than truthiness.
//
//  And the structural one: `player.getEffects()` returns a `ScriptList`, not a
//  JS array. Walk it with `size()`/`get(i)` — `.length`, `list[0]`, `for..of`
//  and `.map` are all unavailable on it.
//
//  Settings:
//    • Warn Seconds     — flash + toast when one of your effects drops below this.
//    • Show Own Effects — draw your own active-effect column.
//    • Scan Threats     — look for buffed players nearby.
//    • Threat Range     — search radius in blocks for that scan.
//
//  Author: Opal  ·  An example of the player-effects + entity scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Potion Alert",
    version: "1.0.0",
    authors: ["Opal"],
});

const C = {
    panel: renderer.color(14, 15, 20, 170),
    text: renderer.color(240, 242, 248),
    dim: renderer.color(160, 165, 178),
    warn: renderer.color(255, 196, 76),
    threat: renderer.color(255, 120, 110),
};

/** Effects that make a player meaningfully harder to fight. */
const COMBAT_BUFFS = ["strength", "speed", "resistance"];

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

script.registerModule(
    {
        name: "Potion Alert",
        description: "Your active effects, plus a heads-up when a nearby player is potted.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addNumber("Warn Seconds", 10, 3, 60, 1);
        module.addBool("Show Own Effects", true);
        module.addBool("Scan Threats", true);
        module.addNumber("Threat Range", 16, 4, 48, 1);

        // Claim a default key so the module is toggleable the moment it loads.
        module.setBind(keys.F7);

        // ---- State ------------------------------------------------------------
        /** @type {string[]} Effect ids already warned about, so each expiry toasts once. */
        let warnedIds = [];

        /** @type {Array<{name: string, health: number, armor: number, buffs: string[]}>} */
        let threats = [];

        module.on("enable", () => {
            warnedIds = [];
            threats = [];
            notification.info("Potion Alert", "Enabled");
        });

        module.on("disable", () => {
            threats = [];
            notification.info("Potion Alert", "Disabled");
        });

        module.on("preGameTick", () => {
            if (mc.getPlayer() === null || mc.getWorld() === null) return;

            checkOwnExpiry(module.getNumber("Warn Seconds"));

            threats = module.getBool("Scan Threats") ? scanThreats(module.getNumber("Threat Range")) : [];
        });

        module.on("renderScreen", () => {
            if (mc.getPlayer() === null || mc.getWorld() === null) return;

            let y = 40;
            if (module.getBool("Show Own Effects")) {
                y = drawOwnEffects(8, y, module.getNumber("Warn Seconds"));
            }
            if (threats.length > 0) {
                drawThreats(8, y + 6);
            }
        });

        /**
         * Toasts once per effect as it drops under the warning threshold, and
         * forgets an effect again once it is gone or has been re-applied — so
         * re-drinking the potion re-arms the warning.
         *
         * @param {number} warnSeconds Threshold in seconds.
         */
        function checkOwnExpiry(warnSeconds) {
            const effects = player.getEffects();
            const stillActive = [];

            for (let i = 0; i < effects.size(); i++) {
                const effect = effects.get(i);
                if (effect.isInfinite()) continue;

                const seconds = effect.getDurationSeconds();
                const id = effect.getId();
                const expiring = seconds <= warnSeconds;

                if (expiring) stillActive.push(id);
                if (expiring && !warnedIds.includes(id)) {
                    notification.warn("Potion Alert", effect.getName() + " expires in " + seconds + "s");
                }
            }
            warnedIds = stillActive;
        }

        /**
         * Draws your own active effects as a column of rows, flashing the ones
         * about to run out.
         *
         * @param {number} x Left edge.
         * @param {number} y Top edge.
         * @param {number} warnSeconds Threshold below which a row is flagged.
         * @returns {number} The y coordinate just past the drawn panel.
         */
        function drawOwnEffects(x, y, warnSeconds) {
            const effects = player.getEffects();
            if (effects.isEmpty()) return y;

            const rowH = 11;
            const w = 108;
            const h = effects.size() * rowH + 8;
            renderer.roundedRect(x, y, w, h, 5, C.panel);

            for (let i = 0; i < effects.size(); i++) {
                const effect = effects.get(i);
                const rowY = y + 4 + i * rowH;
                const expiring = !effect.isInfinite() && effect.getDurationSeconds() <= warnSeconds;

                renderer.text("productsans-medium", label(effect), x + 6, rowY, 7, expiring ? C.warn : C.text);

                const time = effect.isInfinite() ? "∞" : formatDuration(effect.getDurationSeconds());
                const timeW = renderer.textWidth("productsans-medium", time, 7);
                renderer.text("productsans-medium", time, x + w - timeW - 6, rowY, 7, expiring ? C.warn : C.dim);
            }
            return y + h;
        }

        /**
         * Finds nearby players running a combat buff.
         *
         * @param {number} range Search radius in blocks.
         * @returns {Array<{name: string, health: number, armor: number, buffs: string[]}>}
         */
        function scanThreats(range) {
            const entities = world.getLivingEntitiesInRange(range);
            const found = [];

            for (let i = 0; i < entities.size(); i++) {
                const entity = entities.get(i);
                if (!entity.isPlayer()) continue;

                const buffs = [];
                for (let b = 0; b < COMBAT_BUFFS.length; b++) {
                    if (entity.hasEffect(COMBAT_BUFFS[b])) buffs.push(COMBAT_BUFFS[b]);
                }
                if (buffs.length === 0) continue;

                found.push({
                    name: entity.getName(),
                    health: entity.getHealth(),
                    armor: entity.getArmor(),
                    buffs,
                });
            }
            return found;
        }

        /**
         * Draws the buffed-players panel.
         *
         * @param {number} x Left edge.
         * @param {number} y Top edge.
         */
        function drawThreats(x, y) {
            const rowH = 11;
            const w = 150;
            const h = threats.length * rowH + 14;
            renderer.roundedRect(x, y, w, h, 5, C.panel);
            renderer.text("productsans-bold", "Potted nearby", x + 6, y + 4, 7, C.threat);

            for (let i = 0; i < threats.length; i++) {
                const threat = threats[i];
                const rowY = y + 15 + i * rowH;
                renderer.text("productsans-medium", threat.name, x + 6, rowY, 6.5, C.text);

                const detail = threatDetail(threat);
                const detailW = renderer.textWidth("productsans-medium", detail, 6.5);
                renderer.text("productsans-medium", detail, x + w - detailW - 6, rowY, 6.5, C.dim);
            }
        }
    },
);

/**
 * Formats one effect as "Strength II" — level, not amplifier, because this is
 * the string a human reads. Level 1 is left bare, matching vanilla.
 *
 * @param {ScriptEffect} effect The effect to label.
 * @returns {string} e.g. "Strength II", or "Speed" at level 1.
 */
function label(effect) {
    const level = effect.getLevel();
    if (level <= 1) return effect.getName();
    return effect.getName() + " " + (ROMAN[level] || level);
}

/**
 * Formats a remaining duration as "m:ss", or "12s" under a minute.
 *
 * @param {number} seconds Whole seconds remaining.
 * @returns {string} The formatted duration.
 */
function formatDuration(seconds) {
    if (seconds < 60) return seconds + "s";
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return minutes + ":" + String(rest).padStart(2, "0");
}

/**
 * Formats one threat's stat readout: buffs, health, and armor.
 *
 * Armor and health are gated on the `-1` living-only sentinel rather than on
 * truthiness — 0 armor is a real, meaningful value.
 *
 * @param {{health: number, armor: number, buffs: string[]}} threat
 * @returns {string} e.g. "strength, speed · 18.5hp · 20a".
 */
function threatDetail(threat) {
    const parts = [threat.buffs.join(", ")];
    if (threat.health >= 0) parts.push(threat.health.toFixed(1) + "hp");
    if (threat.armor >= 0) parts.push(threat.armor + "a");
    return parts.join(" · ");
}

// =============================================================================
//  Test hook. `module` does not exist inside the Opal/GraalVM runtime, so this
//  block is skipped there; under Node it exposes the pure helpers above to
//  tests/PotionAlert.test.js.
// =============================================================================
if (typeof module !== "undefined" && module.exports) {
    module.exports = { label, formatDuration, threatDetail, COMBAT_BUFFS };
}

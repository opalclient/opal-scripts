// =============================================================================
//  Combat HUD  —  an esp + player + world + rotation + renderer combo for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Locks onto the nearest living entity in range and shows a combat-awareness
//  HUD: an ESP box + name over the target when it's on-screen, a side panel
//  with distance and a "degrees off crosshair" FOV gauge, and a small
//  self-status row (crit window, weapon, attack damage) for you.
//
//  This is the "combine several proxies into something a real user would
//  want" example: no single proxy documents this HUD, it comes from wiring
//  esp + player + world + rotation + renderer together.
//
//  WHY THERE'S NO TARGET HEALTH BAR
//  ----------------------------------
//  A combat HUD "should" show the target's health. The scripting API doesn't
//  expose one: `player.getHealth()` only reads the *local* player, and there
//  is no documented `Entity.getHealth()` proxy for arbitrary living entities
//  (unlike `entity.getName()`, which the ESP examples confirm works directly).
//  Rather than guess at an undocumented call that might not exist on every
//  build, this HUD shows what the API actually gives you about a target:
//  distance and aim offset — plus your own crit/weapon state, which is real,
//  documented `player` data.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • world       — getLivingEntitiesInRange to find candidates.
//    • player      — getDistanceToEntity, canCrit, isHoldingWeapon, getAttackDamage.
//    • rotation    — getEntityFOV, isEntityInFOV.
//    • esp         — getEntityBox2D to draw the on-screen box (may be null).
//    • renderer    — the box, gauge, and panel.
//    • renderScreen — where all of the above draw calls run.
//
//  Settings:
//    • Range           — search radius in blocks.
//    • Lock FOV         — cone half-angle (degrees) considered "locked on".
//    • Show Target Box  — draw the ESP outline + name when on-screen.
//    • Show Self Status — draw the crit/weapon/damage row.
//
//  Author: Opal  ·  A combo example of the esp + player + world + rotation +
//  renderer scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Combat HUD",
    version: "1.0.0",
    authors: ["Opal"],
});

const C = {
    boxLocked: renderer.color(120, 220, 140),
    boxOut: renderer.color(255, 196, 76),
    panelBg: renderer.color(14, 15, 20, 170),
    label: renderer.color(160, 165, 178),
    value: renderer.color(240, 242, 248),
    gaugeTrack: renderer.color(40, 42, 52),
    gaugeFillGood: renderer.color(120, 220, 140),
    gaugeFillBad: renderer.color(255, 120, 110),
    good: renderer.color(120, 220, 140),
    idle: renderer.color(120, 124, 135),
};

const LOCK_FOV = 15; // degrees considered "on target" for the lock-color cutoff
const GAUGE_W = 90;
const GAUGE_H = 6;

script.registerModule(
    {
        name: "Combat HUD",
        description: "Nearest-target ESP box, distance/FOV gauge, and a self crit/weapon status row.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addNumber("Range", 24, 4, 64, 1);
        module.addNumber("Gauge Max FOV", 60, 15, 180, 5);
        module.addBool("Show Target Box", true);
        module.addBool("Show Self Status", true);

        module.on("enable", () => {
            notification.info("Combat HUD", "Enabled");
        });

        module.on("disable", () => {
            notification.info("Combat HUD", "Disabled");
        });

        module.on("renderScreen", () => {
            if (mc.player === null || mc.world === null) return;

            const target = findNearestTarget(module.getNumber("Range"));
            drawSelfStatus();
            if (target === null) return;

            const distance = player.getDistanceToEntity(target.entity);
            const fovOffset = rotation.getEntityFOV(target.entity);
            const locked = fovOffset <= LOCK_FOV;

            if (module.getBool("Show Target Box")) {
                drawTargetBox(target.entity, locked);
            }

            drawTargetPanel(target.entity.getName().getString(), distance, fovOffset, locked, module.getNumber("Gauge Max FOV"));
        });

        /**
         * Finds the nearest living entity within range.
         *
         * @param {number} range Search radius in blocks.
         * @returns {{entity: object}|null} The nearest entity wrapped in an
         *          object (kept consistent even if we later add more fields),
         *          or null if nothing is in range.
         */
        function findNearestTarget(range) {
            const candidates = world.getLivingEntitiesInRange(range);
            if (candidates.isEmpty()) return null;

            let best = null;
            let bestDistance = Infinity;
            for (let i = 0; i < candidates.size(); i++) {
                const entity = candidates.get(i);
                const distance = player.getDistanceToEntity(entity);
                if (distance < 0) continue;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = entity;
                }
            }
            return best === null ? null : { entity: best };
        }

        /**
         * Draws the ESP outline + name above the target, if it's projectable
         * on-screen this frame (esp.getEntityBox2D returns null otherwise).
         *
         * @param {object} entity The target entity.
         * @param {boolean} locked Whether the target is within the lock FOV.
         */
        function drawTargetBox(entity, locked) {
            const tickDelta = client.getTickDelta();
            const box = esp.getEntityBox2D(entity, tickDelta);
            if (box === null) return;

            const color = locked ? C.boxLocked : C.boxOut;
            renderer.rectOutline(box.x, box.y, box.z, box.w, 1.4, color);

            const name = entity.getName().getString();
            const size = 6.5;
            const nameW = renderer.textWidth("productsans-bold", name, size);
            renderer.text("productsans-bold", name, box.x + box.z / 2 - nameW / 2, box.y - size - 3, size, color);
        }

        /**
         * Draws the fixed side panel: target name, distance, and the FOV gauge.
         *
         * @param {string} name       Target display name.
         * @param {number} distance   Distance to target in blocks.
         * @param {number} fovOffset  Degrees between the crosshair and the target.
         * @param {boolean} locked    Whether fovOffset is within the lock cutoff.
         * @param {number} gaugeMaxFov Degrees represented by a full gauge bar.
         */
        function drawTargetPanel(name, distance, fovOffset, locked, gaugeMaxFov) {
            const sw = client.getScaledWidth();
            const panelW = GAUGE_W + 24;
            const panelH = 56;
            const x = sw - panelW - 8;
            const y = 8;

            renderer.roundedRect(x, y, panelW, panelH, 6, C.panelBg);
            renderer.text("productsans-bold", name, x + 10, y + 8, 8, C.value);
            renderer.text("productsans-medium", distance.toFixed(1) + " m", x + 10, y + 22, 7, C.label);

            const gaugeX = x + 10;
            const gaugeY = y + panelH - 16;
            renderer.roundedRect(gaugeX, gaugeY, GAUGE_W, GAUGE_H, GAUGE_H / 2, C.gaugeTrack);

            const fraction = Math.max(0, Math.min(1, 1 - fovOffset / gaugeMaxFov));
            const fillColor = locked ? C.gaugeFillGood : C.gaugeFillBad;
            if (fraction > 0) {
                renderer.roundedRect(gaugeX, gaugeY, GAUGE_W * fraction, GAUGE_H, GAUGE_H / 2, fillColor);
            }
            renderer.text("productsans-medium", Math.round(fovOffset) + "°", gaugeX + GAUGE_W + 6, gaugeY - 1, 6.5, C.label);
        }

        /**
         * Draws a compact self-status row: crit window and weapon/damage info.
         */
        function drawSelfStatus() {
            if (!module.getBool("Show Self Status")) return;

            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();
            const w = 150;
            const h = 24;
            const x = sw / 2 - w / 2;
            const y = sh - h - 40;

            renderer.roundedRect(x, y, w, h, 5, C.panelBg);

            const critReady = player.canCrit();
            renderer.circle(x + 14, y + h / 2, 4, renderer.darker(critReady ? C.good : C.idle, 0.55));
            renderer.circle(x + 14, y + h / 2, 2.6, critReady ? C.good : C.idle);
            renderer.text("productsans-medium", critReady ? "Crit ready" : "No crit", x + 22, y + 8, 6.5, C.label);

            if (player.isHoldingWeapon()) {
                const dmgText = player.getAttackDamage().toFixed(1) + " dmg";
                const dmgW = renderer.textWidth("productsans-bold", dmgText, 7);
                renderer.text("productsans-bold", dmgText, x + w - dmgW - 10, y + 8, 7, C.value);
            }
        }
    },
);

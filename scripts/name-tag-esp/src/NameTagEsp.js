// =============================================================================
//  Name Tag ESP  —  a standalone esp + world example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Draws a small floating nameplate pill above every nearby living entity —
//  name plus (optionally) distance — fading out toward the edge of its range
//  rather than the bounding-box outline you'd get from a typical ESP module.
//
//  This adapts the pattern shown in the scripting docs' ESP page into a
//  complete, standalone module with its own settings, distinct from the
//  box-outline style ESP examples elsewhere in this gallery.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • world       — getLivingEntitiesInRange to gather candidates.
//    • esp         — getEntityBox2D to project each entity to screen space.
//    • renderer    — the pill background + text.
//    • renderScreen — the only place `esp`/`renderer` draw calls are valid.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  `esp.getEntityBox2D(entity, tickDelta)` returns `null` for anything behind
//  the camera or fully outside the viewport — not just "far away". Every
//  entity is null-checked before anything is drawn, and entities outside the
//  configured range are skipped before the projection call even runs (no
//  point projecting something you're not going to draw).
//
//  AND THE ONE IT LEARNED THE HARD WAY
//  ------------------------------------
//  Everything the scripting API hands back is a wrapper with getters, never a
//  bare object with fields — the sandbox (GraalVM `HostAccess.EXPLICIT`) grants
//  no property access to anything not explicitly exported. So it is
//  `box.getX()`, not `box.x`; `entity.getName()` returns a plain String, not
//  something you call `.getString()` on; `world.getLivingEntitiesInRange()`
//  returns a `ScriptList` you walk with `size()`/`get(i)`, not an array. This
//  script used to read `box.x` — which evaluated to `undefined`, made every
//  coordinate NaN, and silently drew nothing at all.
//
//  Settings:
//    • Range             — search radius in blocks.
//    • Show Distance      — add a "12.3m" second line under the name.
//    • Fade By Distance   — nameplates near the edge of Range fade toward
//                           transparent instead of popping in/out abruptly.
//    • Style              — Pill (rounded background) or Plain (text only).
//    • Text Size          — font size for the name line.
//
//  Author: Opal  ·  An example of the esp + world scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Name Tag ESP",
    version: "1.0.0",
    authors: ["Opal"],
});

const PILL_BG = renderer.color(10, 10, 14, 165);
const NAME_COLOR = renderer.color(255, 255, 255);
const DIST_COLOR = renderer.color(190, 195, 210);

script.registerModule(
    {
        name: "Name Tag ESP",
        description: "Floating name/distance tags above nearby living entities.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addNumber("Range", 48, 8, 128, 1);
        module.addBool("Show Distance", true);
        module.addBool("Fade By Distance", true);
        module.addMode("Style", ["Pill", "Plain"]);
        module.addNumber("Text Size", 7, 5, 12, 0.5);

        module.on("enable", () => {
            notification.info("Name Tag ESP", "Enabled");
        });

        module.on("disable", () => {
            notification.info("Name Tag ESP", "Disabled");
        });

        module.on("renderScreen", () => {
            if (mc.getPlayer() === null || mc.getWorld() === null) return;

            const range = module.getNumber("Range");
            const showDistance = module.getBool("Show Distance");
            const fadeByDistance = module.getBool("Fade By Distance");
            const pillStyle = module.isModeEqual("Style", "Pill");
            const textSize = module.getNumber("Text Size");
            const tickDelta = client.getTickDelta();

            const entities = world.getLivingEntitiesInRange(range);
            for (let i = 0; i < entities.size(); i++) {
                const entity = entities.get(i);

                const box = esp.getEntityBox2D(entity, tickDelta);
                if (box === null) continue; // off-screen or behind the camera

                const distance = player.getDistanceToEntity(entity);
                if (distance < 0) continue; // defensive; getLivingEntitiesInRange already filters to living entities

                const alpha = fadeByDistance ? clamp(1 - distance / range, 0.25, 1) : 1;

                const name = entity.getName();
                const distanceText = distance.toFixed(1) + "m";

                drawTag(box, name, showDistance ? distanceText : null, textSize, alpha, pillStyle);
            }
        });

        /**
         * Draws one nameplate centered above a projected entity box.
         *
         * @param {ScriptBox2D} box       Screen-space box from esp.getEntityBox2D.
         * @param {string} name           The entity's display name.
         * @param {string|null} distText  Pre-formatted distance string, or null to omit.
         * @param {number} textSize       Font size for the name line.
         * @param {number} alpha          Opacity multiplier (0.0 - 1.0) from distance fade.
         * @param {boolean} pillStyle     Whether to draw the rounded background pill.
         */
        function drawTag(box, name, distText, textSize, alpha, pillStyle) {
            const nameW = renderer.textWidth("productsans-bold", name, textSize);
            const distSize = textSize * 0.72;
            const distW = distText !== null ? renderer.textWidth("productsans-medium", distText, distSize) : 0;
            const contentW = Math.max(nameW, distW);

            const centerX = box.getX() + box.getWidth() / 2;
            const rows = distText !== null ? 2 : 1;
            const rowGap = 2;
            const padX = 6;
            const padY = 3;
            const tagH = rows * textSize * 0.85 + (rows - 1) * rowGap + padY * 2;
            const tagW = contentW + padX * 2;
            const tagX = centerX - tagW / 2;
            const tagY = box.getY() - tagH - 4;

            if (pillStyle) {
                renderer.roundedRect(tagX, tagY, tagW, tagH, 3, renderer.applyOpacity(PILL_BG, alpha));
            }

            const nameX = centerX - nameW / 2;
            const nameY = tagY + padY;
            renderer.text("productsans-bold", name, nameX, nameY, textSize, renderer.applyOpacity(NAME_COLOR, alpha));

            if (distText !== null) {
                const distX = centerX - distW / 2;
                const distY = nameY + textSize * 0.85 + rowGap;
                renderer.text("productsans-medium", distText, distX, distY, distSize, renderer.applyOpacity(DIST_COLOR, alpha));
            }
        }

        /**
         * Clamps a value into [min, max].
         *
         * @param {number} value The value to clamp.
         * @param {number} min   Lower bound.
         * @param {number} max   Upper bound.
         * @returns {number} The clamped value.
         */
        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }
    },
);

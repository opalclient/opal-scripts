// =============================================================================
//  Look Assist  —  a rotation-proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Smoothly turns your view toward the nearest living entity within range and
//  inside an FOV cone, then shows a small "Locked: <name> (12.3m)" readout
//  while it's tracking. A pure look-assist: it never attacks, breaks blocks,
//  or touches movement — just rotation.
//
//  A NOTE ON "NEAREST PLAYER"
//  --------------------------
//  The task this script demos is usually described as "look at the nearest
//  player", but the scripting API's `world.getLivingEntitiesInRange(radius)`
//  returns every living entity — mobs and players alike — and there is no
//  documented `isPlayer()` / entity-type check exposed to scripts. Rather
//  than fabricate a method that doesn't exist, this script honestly targets
//  the nearest living entity of any kind. On a server where the only nearby
//  living entities in practice ARE other players (anarchy servers, most
//  PvP arenas), that is exactly "nearest player" in effect.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • world     — getLivingEntitiesInRange to find candidates.
//    • player    — getDistanceToEntity / getClosestPoint to pick + aim.
//    • rotation  — getRotationFromPosition, setSmooth, and the anti-detection
//                  helpers (patchConstantRotation, isEntityInFOV).
//
//  ON THE ANTI-DETECTION HELPERS
//  ------------------------------
//  `rotation.setSmooth(yaw, pitch, speed)` already caps turn rate and handles
//  movement correction through the shared rotation handler — for most scripts
//  that's enough. This example goes one step further and demonstrates
//  `rotation.patchConstantRotation(target, previous)`, which nudges a target
//  rotation with small human-like jitter so a constant, machine-perfect
//  per-tick delta doesn't stand out to statistical analysis. It's shown here
//  so you can see how to compose it into a rotation pipeline; whether you
//  need it on top of `setSmooth` depends entirely on what you're building.
//
//  Settings:
//    • Range           — search radius in blocks.
//    • FOV              — half-angle of the targeting cone in degrees.
//    • Turn Speed       — max degrees of rotation per tick.
//    • Require FOV Gate — only lock onto entities already inside the FOV cone.
//    • Show Lock Indicator — draw the "Locked: name (dist)" HUD line.
//
//  Author: Opal  ·  An example of the rotation + world scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Look Assist",
    version: "1.0.0",
    authors: ["Opal"],
});

const HUD_COLOR = renderer.color(180, 220, 255);

script.registerModule(
    {
        name: "Look Assist",
        description: "Smoothly turns toward the nearest living entity in range and FOV.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addNumber("Range", 24, 4, 64, 1);
        module.addNumber("FOV", 90, 10, 180, 5);
        module.addNumber("Turn Speed", 12, 1, 60, 1);
        module.addBool("Require FOV Gate", true);
        module.addBool("Show Lock Indicator", true);

        // ---- State ------------------------------------------------------------
        /** @type {Vec2f|null} The previous tick's submitted rotation, for jitter patching. */
        let prevRotation = null;

        /** @type {string|null} Display name of the current lock target, for the HUD. */
        let lockedName = null;

        /** @type {number} Distance to the current lock target, for the HUD. */
        let lockedDistance = 0;

        module.on("enable", () => {
            prevRotation = null;
            lockedName = null;
            notification.info("Look Assist", "Enabled");
        });

        module.on("disable", () => {
            lockedName = null;
            notification.info("Look Assist", "Disabled");
        });

        module.on("preGameTick", () => {
            if (mc.player === null || mc.world === null) {
                lockedName = null;
                return;
            }

            const range = module.getNumber("Range");
            const fov = module.getNumber("FOV");
            const requireFov = module.getBool("Require FOV Gate");

            const candidates = world.getLivingEntitiesInRange(range);
            if (candidates.isEmpty()) {
                lockedName = null;
                return;
            }

            let best = null;
            let bestDistance = Infinity;
            for (let i = 0; i < candidates.size(); i++) {
                const entity = candidates.get(i);
                if (requireFov && !rotation.isEntityInFOV(entity, fov)) continue;

                const distance = player.getDistanceToEntity(entity);
                if (distance < 0) continue; // not a living entity (defensive; shouldn't happen here)
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = entity;
                }
            }

            if (best === null) {
                lockedName = null;
                return;
            }

            const aimPoint = player.getClosestPoint(best);
            if (aimPoint === null) {
                lockedName = null;
                return;
            }

            let target = rotation.getRotationFromPosition(aimPoint);

            // Demonstrate the anti-detection helper chain: jitter the target
            // slightly relative to the last tick's rotation before submitting.
            if (prevRotation !== null) {
                target = rotation.patchConstantRotation(target, prevRotation);
            }

            rotation.setSmooth(target.getYaw(), target.getPitch(), module.getNumber("Turn Speed"));
            prevRotation = target;

            lockedName = best.getName().getString();
            lockedDistance = bestDistance;
        });

        module.on("renderScreen", () => {
            if (!module.getBool("Show Lock Indicator") || lockedName === null) return;

            const sw = client.getScaledWidth();
            const text = "Locked: " + lockedName + " (" + lockedDistance.toFixed(1) + "m)";
            const size = 8;
            const tw = renderer.textWidth("productsans-bold", text, size);

            const x = sw / 2 - tw / 2;
            const y = 6;

            renderer.roundedRect(x - 8, y - 4, tw + 16, size + 8, 5, renderer.color(0, 0, 0, 140));
            renderer.text("productsans-bold", text, x, y, size, HUD_COLOR);
        });
    },
);

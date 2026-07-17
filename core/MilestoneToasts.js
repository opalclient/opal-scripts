// =============================================================================
//  Milestone Toasts  —  a notification-proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Watches ordinary `player` state every tick and pops a themed toast the
//  moment something noteworthy happens:
//
//    • Survived a big fall   — landed after falling further than "Fall
//                               Threshold" blocks, without dying.
//    • Low health warning    — health drops to or below "Low Health".
//    • Back to full health   — health returns to max after having been below it.
//    • Sprint streak         — you've held sprint continuously for
//                               "Streak Seconds" seconds.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • notification — success / warn / info toasts (the notification proxy).
//    • player        — getHealth/getMaxHealth, getFallDistance, isOnGround,
//                       isSprinting.
//    • preGameTick   — all detection runs here, 20 times/second.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  A tick-rate poll is *edge-triggered*, not level-triggered: firing a toast
//  every tick a condition holds would spam dozens of toasts a second. Every
//  milestone here tracks a small piece of state (a "have we already told the
//  player about this?" flag) and only notifies on the *transition* into the
//  condition, rearming once the condition clears. That pattern — remember the
//  last state, act only on change — is the one thing to copy from this file.
//
//  Also note the fall-survived milestone: `player.getFallDistance()` resets
//  to 0 the instant the player lands, so the actual fall distance has to be
//  captured as a running peak *while airborne* and consumed on landing,
//  rather than read at the moment `isOnGround()` becomes true.
//
//  Author: Opal  ·  An example of the notification + player scripting APIs.
// =============================================================================

const script = registerScript({
    name: "Milestone Toasts",
    version: "1.0.0",
    authors: ["Opal"],
});

script.registerModule(
    {
        name: "Milestone Toasts",
        description: "Pops a toast for fall survival, low/full health, and sprint streaks.",
    },
    (module) => {
        // ====================================================================
        // Settings
        // ====================================================================

        module.addBool("Fall Milestones", true);
        module.addNumber("Fall Threshold", 6, 3, 20, 1);
        module.addGroup("Fall", ["Fall Milestones", "Fall Threshold"]);

        module.addBool("Health Warnings", true);
        module.addNumber("Low Health", 6, 1, 19, 0.5);
        module.addGroup("Health", ["Health Warnings", "Low Health"]);

        module.addBool("Sprint Streak", true);
        module.addNumber("Streak Seconds", 10, 2, 60, 1);
        module.addGroup("Sprint", ["Sprint Streak", "Streak Seconds"]);

        // ====================================================================
        // State
        // ====================================================================

        /** @type {number} Peak fall distance seen while airborne this fall. */
        let fallPeak = 0;

        /** @type {boolean} Whether the player was on the ground last tick. */
        let wasOnGround = true;

        /** @type {boolean} Whether we've already warned about the current low-health dip. */
        let lowHealthWarned = false;

        /** @type {number} Health observed last tick, to detect the "back to full" edge. */
        let prevHealth = -1;

        /** @type {number} Ticks the player has been continuously sprinting. */
        let sprintTicks = 0;

        /** @type {boolean} Whether the current sprint streak has already been celebrated. */
        let streakNotified = false;

        // ====================================================================
        // Lifecycle
        // ====================================================================

        module.on("enable", () => {
            fallPeak = 0;
            wasOnGround = true;
            lowHealthWarned = false;
            prevHealth = -1;
            sprintTicks = 0;
            streakNotified = false;
            notification.info("Milestone Toasts", "Watching for milestones");
        });

        module.on("disable", () => {
            notification.info("Milestone Toasts", "Stopped watching");
        });

        // ====================================================================
        // Tick logic
        // ====================================================================

        module.on("preGameTick", () => {
            if (mc.getPlayer() === null || mc.getWorld() === null) return;

            checkFallMilestone();
            checkHealthMilestones();
            checkSprintStreak();
        });

        // ====================================================================
        // Milestones
        // ====================================================================

        /**
         * Tracks the peak fall distance while airborne, then fires a toast on
         * the airborne -> grounded transition if the peak cleared the threshold.
         */
        function checkFallMilestone() {
            if (!module.getBool("Fall Milestones")) return;

            const onGround = player.isOnGround();
            fallPeak = Math.max(fallPeak, player.getFallDistance());

            // Edge: was airborne last tick, grounded now — the fall just ended.
            if (!wasOnGround && onGround) {
                const threshold = module.getNumber("Fall Threshold");
                if (fallPeak >= threshold) {
                    notification.success(
                        "Survived the fall",
                        Math.round(fallPeak) + " blocks — nice landing.",
                    );
                }
                fallPeak = 0;
            }

            wasOnGround = onGround;
        }

        /**
         * Fires a warn toast on the healthy -> low-health transition, and a
         * success toast on the injured -> full-health transition. Both are
         * armed/disarmed by state so they fire exactly once per edge.
         */
        function checkHealthMilestones() {
            if (!module.getBool("Health Warnings")) return;

            const health = player.getHealth();
            const maxHealth = player.getMaxHealth();
            const lowThreshold = module.getNumber("Low Health");

            if (health <= lowThreshold) {
                if (!lowHealthWarned) {
                    notification.warn("Low Health", health.toFixed(1) + " HP remaining");
                    lowHealthWarned = true;
                }
            } else if (health > lowThreshold + 2) {
                // Rearm with a little hysteresis so hovering right at the
                // threshold doesn't flip the flag (and re-toast) every tick.
                lowHealthWarned = false;
            }

            if (prevHealth >= 0 && prevHealth < maxHealth && health >= maxHealth) {
                notification.success("Full Health", "Back to " + maxHealth.toFixed(0) + " HP");
            }
            prevHealth = health;
        }

        /**
         * Counts continuous sprint ticks and celebrates once per streak when
         * the configured duration is reached. Resets the moment sprint stops.
         */
        function checkSprintStreak() {
            if (!module.getBool("Sprint Streak")) return;

            if (player.isSprinting()) {
                sprintTicks++;
            } else {
                sprintTicks = 0;
                streakNotified = false;
                return;
            }

            const targetTicks = Math.round(module.getNumber("Streak Seconds") * 20);
            if (sprintTicks >= targetTicks && !streakNotified) {
                notification.info(
                    "Sprint Streak",
                    Math.round(sprintTicks / 20) + "s of continuous sprinting",
                );
                streakNotified = true;
            }
        }
    },
);

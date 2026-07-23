// =============================================================================
//  Module Guard  —  a `modules` proxy example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Generalizes the exact pattern from the scripting docs' `modules` reference
//  ("AutoDisableFlight when KillAura enabled") into a configurable pair:
//
//    • Pick a "Watch Module" (a mode dropdown of common combat modules).
//    • Pick a "Guard Module" (a mode dropdown of common movement/exploit
//      modules) that should never run at the same time as the watched one.
//
//  Whenever Watch turns on while Guard is also on, Guard is switched off and
//  a toast explains why. If "Restore On Disable" is on, Guard is switched
//  back on automatically once Watch turns back off — but only if THIS module
//  was the one that turned it off (a manual disable is never overridden).
//
//  A second, independent feature — "Log Combat Modules" — walks every module
//  in the Combat category with `modules.listCategory("Combat")` and prints
//  its enabled state, demonstrating the listing half of the `modules` proxy.
//
//  WHICH GLOBALS
//  -------------
//    • modules — exists / isEnabled / setEnabled / listCategory / listEnabled.
//    • notification — toasts on every guard transition.
//
//  THE GOTCHA THIS TEACHES
//  ------------------------
//  `modules.setEnabled(id, ...)` no-ops silently on a name that does not
//  exist on the running build (some modules are renamed or absent across
//  versions) — `modules.exists(id)` is checked first so a bad pairing tells
//  you why nothing happened instead of doing nothing mysteriously. The
//  ownership flag (`weDisabledGuard`) mirrors the same "did WE turn this on,
//  or was it already on before us" bookkeeping used by Sprint Assist — so a
//  module the player enabled manually is never yanked out from under them by
//  a `disable` of Watch that this script never caused.
//
//  Author: Opal  ·  An example of the modules scripting API.
// =============================================================================

const script = registerScript({
    name: "Module Guard",
    version: "1.0.0",
    authors: ["Opal"],
});

// Curated lists rather than a live modules.listAll() dropdown: addMode needs
// a fixed string array at settings-definition time, and these are the module
// pairings the guard pattern is actually meant for (combat vs. movement).
const WATCH_OPTIONS = ["KillAura", "Aura", "TriggerBot", "Reach", "Velocity"];
const GUARD_OPTIONS = ["Flight", "Fly", "Spider", "NoFall", "Scaffold"];
const COMBAT_CATEGORY = "Combat";

script.registerModule(
    {
        name: "Module Guard",
        description: "Disables a movement/exploit module whenever a chosen combat module is active.",
    },
    (module) => {
        // ---- Settings ---------------------------------------------------------
        module.addMode("Watch Module", WATCH_OPTIONS);
        module.addMode("Guard Module", GUARD_OPTIONS);
        module.addBool("Restore On Disable", true);
        module.addBool("Notify", true);
        module.addGroup("Guard Pair", ["Watch Module", "Guard Module", "Restore On Disable"]);

        module.addBool("Log Combat Modules", false);

        // ---- State --------------------------------------------------------
        /** @type {boolean} Whether THIS module was the one that disabled Guard. */
        let weDisabledGuard = false;

        /** @type {boolean} Whether the invalid-pairing warning has already fired. */
        let warnedSamePair = false;

        module.on("enable", () => {
            weDisabledGuard = false;
            warnedSamePair = false;

            if (module.getBool("Log Combat Modules")) {
                logCombatModules();
            }
        });

        module.on("disable", () => {
            weDisabledGuard = false;
        });

        module.on("preGameTick", () => {
            const watch = module.getMode("Watch Module");
            const guard = module.getMode("Guard Module");

            if (watch === guard) {
                if (!warnedSamePair) {
                    notification.warn("Module Guard", "Watch and Guard can't be the same module");
                    warnedSamePair = true;
                }
                return;
            }
            warnedSamePair = false;

            if (!modules.exists(watch) || !modules.exists(guard)) return;

            if (modules.isEnabled(watch)) {
                if (modules.isEnabled(guard)) {
                    modules.setEnabled(guard, false);
                    weDisabledGuard = true;
                    if (module.getBool("Notify")) {
                        notification.info("Module Guard", "Disabled " + guard + " while " + watch + " is active");
                    }
                }
            } else if (weDisabledGuard) {
                if (module.getBool("Restore On Disable")) {
                    modules.setEnabled(guard, true);
                    if (module.getBool("Notify")) {
                        notification.info("Module Guard", "Restored " + guard);
                    }
                }
                weDisabledGuard = false;
            }
        });

        /**
         * Prints every Combat-category module and its current enabled state —
         * a direct demonstration of `modules.listCategory(...)`.
         *
         * Note the loop: `listCategory` hands back a `ScriptList`, not a JS
         * array. It exports `size()`/`isEmpty()`/`get(i)` and nothing else —
         * `combat.length` and `combat[i]` read as `undefined`, and `for..of`
         * throws. Every list the scripting API returns behaves this way.
         */
        function logCombatModules() {
            const combat = modules.listCategory(COMBAT_CATEGORY);
            client.print("[Module Guard] " + COMBAT_CATEGORY + " modules:");
            for (let i = 0; i < combat.size(); i++) {
                const name = combat.get(i);
                client.print("  " + name + " -> " + modules.isEnabled(name));
            }
        }
    },
);

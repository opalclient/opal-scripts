// =============================================================================
//  Template — starting point for a new Opal TypeScript script
// =============================================================================
//
//  Copy this whole folder to scripts/<your-id>/ and edit from here - see
//  README.md for the full checklist. This one file demonstrates the three
//  things almost every script needs: a settings-backed module, a
//  renderScreen draw, and storage that survives a `.script reload`.
//
//  Every global below (registerScript, renderer, storage, keys, ...) comes
//  from @opal-scripts/opal-types as an AMBIENT declaration (see
//  template/tsconfig.json's "types") - there is no import to write, exactly
//  like the real GraalVM engine injects these names with no module system.
// =============================================================================

/** storage is per-script and keyed by whatever string you pick - scope your
 * keys (e.g. a "my-script." prefix) so a copy-pasted script never collides
 * with another script's storage. */
const COUNTER_KEY = "template.counter";

/**
 * storage.get() answers `string | null`, never `undefined` - `null` means
 * "this key was never set", not "set to zero". Parse defensively: a stored
 * value could also be stale or hand-edited, so don't trust the parse result's
 * shape blindly.
 */
function loadCounter(): number {
    const raw = storage.get(COUNTER_KEY);
    if (raw === null) return 0;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "number" ? parsed : 0;
}

function saveCounter(value: number): void {
    storage.set(COUNTER_KEY, JSON.stringify(value));
}

const script = registerScript({
    name: "My Script",
    version: "0.1.0",
    authors: ["you"],
});

script.registerModule(
    {
        name: "Template",
        description: "Starter module: a toggle, a HUD line, and a persisted counter.",
    },
    (module) => {
        // Settings must be declared synchronously in this callback, before
        // any module.on(...) call below - the settings API finalizes them
        // once this callback returns.
        module.addBool("Show Counter", true);

        let counter = loadCounter();

        // keyPress fires for every key press, globally - always gate on the
        // code you actually care about before acting on it.
        module.on("keyPress", (event) => {
            if (event.getCode() !== keys.SPACE) return;
            counter += 1;
            saveCounter(counter);
        });

        // renderScreen is the one HUD render pass that also carries a cursor
        // position; draw through `renderer`, which already targets this
        // frame's canvas.
        module.on("renderScreen", () => {
            if (!module.getBool("Show Counter")) return;
            renderer.text("productsans-medium", `Presses: ${counter}`, 10, 10, 16, renderer.color(255, 255, 255));
        });
    },
);

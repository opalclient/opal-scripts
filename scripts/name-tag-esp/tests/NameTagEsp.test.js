// Tests world/NameTagEsp.js by driving its `renderScreen` handler directly
// against staged world state, and asserting the coordinates it hands the
// renderer are real numbers.
//
// This is the regression test for the bug this script shipped with: it read
// `box.x` off `esp.getEntityBox2D()`, which returns a ScriptBox2D wrapper
// exposing `getX()` and no `.x` at all. `box.x` evaluated to `undefined`,
// every coordinate downstream became NaN, and the script silently drew
// nothing — no error, in-game or in this suite, because the old stub faked the
// box with an object literal that answered `.x` happily.
//
// Asserting draw coordinates are finite is what makes that class of bug
// visible from Node. It is still not a sandbox test: only
// ScriptRepositorySandboxTest in the opal repo proves what a script can reach.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOpalStub } = require("@opal-scripts/stub");
const stub = createOpalStub();
stub.installGlobals();
require("../src/NameTagEsp.js");

/** Stages a world with one entity in range, projected to a known screen box. */
function stageOneEntity({ name = "Notch", distance = 12.3, box = stub.makeFakeBox2D(100, 50, 20, 40) } = {}) {
    stub.resetStubState();
    stub.stubState.player = stub.makeFakeEntity({ name: "You", player: true });
    stub.stubState.world = stub.makeOpaqueToken("ClientLevel");
    stub.stubState.entitiesInRange = [stub.makeFakeEntity({ name, distance, living: true })];
    esp.getEntityBox2D = () => box;
    return box;
}

/** Records every renderer.text call as {text, x, y}. */
function captureText() {
    const calls = [];
    const original = renderer.text;
    renderer.text = (_font, text, x, y) => {
        calls.push({ text, x, y });
        return 0;
    };
    return { calls, restore: () => (renderer.text = original) };
}

// tools/test.mjs imports every scripts/*/tests/*.test.js file into ONE Node
// process; node:test only starts running registered tests once every file
// has finished its synchronous top-level code, so whichever test file
// happens to import last "wins" the shared globalThis bindings. Each test
// below re-installs this file's own stub first so `esp`/`renderer`/`mc`/...
// (and this file's `stubState` behind them) are correctly bound regardless
// of what else shares the process — see @opal-scripts/stub's header.
test("renderScreen draws a nameplate at finite coordinates derived from the box", () => {
    stub.installGlobals();
    const originalBox2D = esp.getEntityBox2D;
    stageOneEntity();
    const text = captureText();
    try {
        stub.getRegisteredHandler("renderScreen")();

        const name = text.calls.find((c) => c.text === "Notch");
        assert.ok(name, "expected the entity's name to be drawn");
        // The bug: these were NaN. Number.isFinite is the whole point of the test.
        assert.ok(Number.isFinite(name.x), `nameplate x was ${name.x}`);
        assert.ok(Number.isFinite(name.y), `nameplate y was ${name.y}`);
        // Centered on the box: x=100, width=20 -> center 110, minus half the
        // (stubbed 0-width) text.
        assert.equal(name.x, 110);
        // Drawn above the box's top edge (y=50).
        assert.ok(name.y < 50, `nameplate should sit above the box top, got ${name.y}`);
    } finally {
        text.restore();
        esp.getEntityBox2D = originalBox2D;
        stub.resetStubState();
    }
});

test("renderScreen draws the distance line when Show Distance is on", () => {
    stub.installGlobals();
    const originalBox2D = esp.getEntityBox2D;
    stageOneEntity({ distance: 12.34 });
    const text = captureText();
    try {
        stub.getRegisteredHandler("renderScreen")();

        const distance = text.calls.find((c) => c.text === "12.3m");
        assert.ok(distance, "expected a distance line");
        assert.ok(Number.isFinite(distance.x) && Number.isFinite(distance.y));
    } finally {
        text.restore();
        esp.getEntityBox2D = originalBox2D;
        stub.resetStubState();
    }
});

test("renderScreen skips an entity the projection could not place on screen", () => {
    stub.installGlobals();
    const originalBox2D = esp.getEntityBox2D;
    stageOneEntity();
    esp.getEntityBox2D = () => null; // behind the camera / off-viewport
    const text = captureText();
    try {
        stub.getRegisteredHandler("renderScreen")();
        assert.deepEqual(text.calls, []);
    } finally {
        text.restore();
        esp.getEntityBox2D = originalBox2D;
        stub.resetStubState();
    }
});

test("renderScreen bails out when there is no world", () => {
    stub.installGlobals();
    const originalBox2D = esp.getEntityBox2D;
    stageOneEntity();
    stub.stubState.player = null;
    stub.stubState.world = null;
    const text = captureText();
    try {
        stub.getRegisteredHandler("renderScreen")();
        assert.deepEqual(text.calls, []);
    } finally {
        text.restore();
        esp.getEntityBox2D = originalBox2D;
        stub.resetStubState();
    }
});

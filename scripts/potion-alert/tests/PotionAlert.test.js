// Tests src/PotionAlert.js: the pure label/duration/detail formatters,
// and the registered handlers themselves — driven via `getRegisteredHandler()`
// with world state staged through `stubState`, per @opal-scripts/stub's header.
//
// The three things under test here are the three the sandbox pass was for:
// `module.setBind(keys.F7)`, `player.getEffects()` with its 1-based getLevel()
// and getDurationSeconds(), and `world.getLivingEntitiesInRange()` +
// `entity.getHealth()`/`getArmor()`/`hasEffect()`.
//
// Every fake below is a throwing proxy shaped like the real Java wrapper — so
// a `.length` on an effects list or a `mc.player` read fails here. It still
// proves nothing about a real sandbox denial: only ScriptRepositorySandboxTest
// in the opal repo can do that.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOpalStub } = require("@opal-scripts/stub");
const stub = createOpalStub();
stub.installGlobals();
const { label, formatDuration, threatDetail, COMBAT_BUFFS } = require("../src/PotionAlert.js");

test("label uses the 1-based level, not the 0-based amplifier", () => {
    // Strength II is amplifier 1 / level 2 — the single easiest thing to get
    // wrong, and it never errors, it just renders the wrong number.
    assert.equal(label(stub.makeFakeEffect({ name: "Strength", amplifier: 1 })), "Strength II");
    assert.equal(label(stub.makeFakeEffect({ name: "Speed", amplifier: 0 })), "Speed");
    assert.equal(label(stub.makeFakeEffect({ name: "Haste", amplifier: 2 })), "Haste III");
});

test("label falls back to a plain number past the roman-numeral table", () => {
    assert.equal(label(stub.makeFakeEffect({ name: "Strength", amplifier: 11 })), "Strength 12");
});

test("formatDuration switches to m:ss at a minute", () => {
    assert.equal(formatDuration(9), "9s");
    assert.equal(formatDuration(59), "59s");
    assert.equal(formatDuration(60), "1:00");
    assert.equal(formatDuration(95), "1:35");
    assert.equal(formatDuration(605), "10:05");
});

test("threatDetail keeps zero armor but drops the -1 living-only sentinel", () => {
    assert.equal(threatDetail({ health: 18.5, armor: 20, buffs: ["strength"] }), "strength · 18.5hp · 20a");
    // 0 is a real armor value and must survive; -1 means "not applicable".
    assert.equal(threatDetail({ health: 20, armor: 0, buffs: ["speed"] }), "speed · 20.0hp · 0a");
    assert.equal(threatDetail({ health: -1, armor: -1, buffs: ["speed"] }), "speed");
});

// tools/test.mjs imports every scripts/*/tests/*.test.js file into ONE Node
// process; node:test only starts running registered tests once every file
// has finished its synchronous top-level code, so whichever test file
// happens to import last "wins" the shared globalThis bindings. Each test
// below that reads/drives a live global re-installs this file's own stub
// first so `player`/`mc`/`notification`/... (and this file's `stubState`
// behind them) are correctly bound regardless of what else shares the
// process — see @opal-scripts/stub's header.
test("getEffects is a ScriptList, not an array", () => {
    stub.installGlobals();
    stub.resetStubState();
    stub.stubState.effects = [stub.makeFakeEffect({ name: "Strength" })];

    const effects = player.getEffects();
    assert.equal(effects.size(), 1);
    assert.equal(effects.isEmpty(), false);
    assert.equal(effects.get(0).getName(), "Strength");
    // Bounds-safe: out of range is null, never a throw.
    assert.equal(effects.get(5), null);
    // The shape a script must NOT reach for — all dead in-game.
    assert.throws(() => effects.length, TypeError);
    assert.throws(() => effects[0], TypeError);
    assert.throws(() => [...effects], TypeError);

    stub.resetStubState();
});

test("the module claims F7 as its default bind at load", () => {
    assert.equal(stub.getRegisteredModule().getBind(), keys.F7);
});

test("preGameTick warns once as an effect nears expiry, and re-arms on re-drink", () => {
    stub.installGlobals();
    stub.resetStubState();
    stub.stubState.player = stub.makeFakeEntity({ name: "You", player: true });
    stub.stubState.world = stub.makeOpaqueToken("ClientLevel");

    const warned = [];
    const originalWarn = notification.warn;
    notification.warn = (_title, description) => warned.push(description);
    try {
        const handler = stub.getRegisteredHandler("preGameTick");
        assert.equal(typeof handler, "function");

        // 8s left, under the 10s default threshold -> warns once.
        stub.stubState.effects = [stub.makeFakeEffect({ id: "minecraft:strength", name: "Strength", duration: 160 })];
        handler();
        handler();
        assert.deepEqual(warned, ["Strength expires in 8s"]);

        // Re-drink: back over the threshold, warning disarms.
        stub.stubState.effects = [stub.makeFakeEffect({ id: "minecraft:strength", name: "Strength", duration: 3600 })];
        handler();
        assert.equal(warned.length, 1);

        // Down again -> warns a second time.
        stub.stubState.effects = [stub.makeFakeEffect({ id: "minecraft:strength", name: "Strength", duration: 100 })];
        handler();
        assert.deepEqual(warned, ["Strength expires in 8s", "Strength expires in 5s"]);
    } finally {
        notification.warn = originalWarn;
        stub.resetStubState();
    }
});

test("preGameTick never warns about an infinite effect", () => {
    stub.installGlobals();
    stub.resetStubState();
    stub.stubState.player = stub.makeFakeEntity({ name: "You", player: true });
    stub.stubState.world = stub.makeOpaqueToken("ClientLevel");
    stub.stubState.effects = [stub.makeFakeEffect({ name: "Night Vision", duration: 0, infinite: true })];

    const warned = [];
    const originalWarn = notification.warn;
    notification.warn = (_t, d) => warned.push(d);
    try {
        stub.getRegisteredHandler("preGameTick")();
        assert.deepEqual(warned, []);
    } finally {
        notification.warn = originalWarn;
        stub.resetStubState();
    }
});

test("preGameTick bails out when there is no world to read", () => {
    stub.installGlobals();
    stub.resetStubState(); // player and world both null
    const warned = [];
    const originalWarn = notification.warn;
    notification.warn = (_t, d) => warned.push(d);
    try {
        stub.stubState.effects = [stub.makeFakeEffect({ name: "Strength", duration: 20 })];
        stub.getRegisteredHandler("preGameTick")();
        assert.deepEqual(warned, []);
    } finally {
        notification.warn = originalWarn;
        stub.resetStubState();
    }
});

test("COMBAT_BUFFS names match what entity.hasEffect matches on", () => {
    const buffed = stub.makeFakeEntity({
        name: "Notch",
        player: true,
        effects: [stub.makeFakeEffect({ name: "Strength", amplifier: 1 })],
    });
    assert.ok(COMBAT_BUFFS.includes("strength"));
    // hasEffect matches case-insensitively on the display name.
    assert.equal(buffed.hasEffect("strength"), true);
    assert.equal(buffed.hasEffect("weakness"), false);
});

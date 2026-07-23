// Tests the pure fall-damage estimate exported by src/FallWarning.js.
// See that file's header comment for exactly what this formula deliberately
// ignores (Feather Falling, potions, armor, elytra, ...).
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOpalStub } = require("@opal-scripts/stub");
createOpalStub().installGlobals();
const { estimateFallDamage, SAFE_FALL_BLOCKS } = require("../src/FallWarning.js");

test("no damage within the safe-fall buffer", () => {
    assert.equal(estimateFallDamage(0), 0);
    assert.equal(estimateFallDamage(SAFE_FALL_BLOCKS), 0);
    assert.equal(estimateFallDamage(SAFE_FALL_BLOCKS - 0.5), 0);
});

test("damage scales 1:1 with blocks past the safe-fall buffer", () => {
    assert.equal(estimateFallDamage(SAFE_FALL_BLOCKS + 1), 1);
    assert.equal(estimateFallDamage(SAFE_FALL_BLOCKS + 10), 10);
});

test("never returns a negative estimate", () => {
    assert.equal(estimateFallDamage(-5), 0);
});

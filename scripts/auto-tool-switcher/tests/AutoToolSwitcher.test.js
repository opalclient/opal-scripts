// Tests the pure block-name -> tool-keyword heuristic exported by
// src/AutoToolSwitcher.js. Does NOT test guessTargetBlock() — that
// function reads the live player/BlockPos globals and is exercised in-game,
// not in this suite. See that file's header for why there's no raycast here.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOpalStub } = require("@opal-scripts/stub");
createOpalStub().installGlobals();
const { toolKeywordFor } = require("../src/AutoToolSwitcher.js");

test("stone-family blocks map to pickaxe", () => {
    assert.equal(toolKeywordFor("stone"), "pickaxe");
    assert.equal(toolKeywordFor("iron ore"), "pickaxe");
    assert.equal(toolKeywordFor("deepslate diamond ore"), "pickaxe");
    assert.equal(toolKeywordFor("obsidian"), "pickaxe");
});

test("wood-family blocks map to axe", () => {
    assert.equal(toolKeywordFor("oak log"), "axe");
    assert.equal(toolKeywordFor("stripped birch wood"), "axe");
    assert.equal(toolKeywordFor("crafting table"), "axe");
});

test("dirt-family blocks map to shovel", () => {
    assert.equal(toolKeywordFor("dirt"), "shovel");
    assert.equal(toolKeywordFor("gravel"), "shovel");
    assert.equal(toolKeywordFor("grass block"), "shovel");
});

test("leaves/wool/webs map to shears", () => {
    assert.equal(toolKeywordFor("oak leaves"), "shears");
    assert.equal(toolKeywordFor("red wool"), "shears");
    assert.equal(toolKeywordFor("cobweb"), "shears");
});

test("unmatched blocks return null rather than guessing", () => {
    assert.equal(toolKeywordFor("bedrock"), null);
    assert.equal(toolKeywordFor("water"), null);
});

test("matching is case-sensitive to the caller's contract (lowercase in)", () => {
    // toolKeywordFor expects an already-lowercased name (the caller lowercases
    // world.getBlockName() before calling it) — an uppercase name simply
    // won't match any keyword, which is the documented contract, not a bug.
    assert.equal(toolKeywordFor("STONE"), null);
});

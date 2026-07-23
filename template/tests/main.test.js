// Tests template/dist/template.js - the esbuild-BUNDLED output of
// src/main.ts, not the TypeScript source directly. There is no `require()`
// path for a `.ts` file the way gallery `.js` scripts get required straight
// out of src/ (see scripts/packet-no-fall/tests/PacketNoFall.test.js for that
// pattern) - esbuild is what turns main.ts into the plain IIFE Node can
// `eval`, the same shape the GraalVM engine evals in-game. Build first:
//
//   bun run build template
//
// or just run `bun run check:template`, which builds, typechecks, and runs
// this file in one shot. tools/test.mjs does NOT run this file automatically
// - template/ is excluded from the scripts/*/tests/* sweep on purpose (it
// isn't a real script). Run it directly:
//
//   node template/tests/main.test.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createOpalStub } = require("@opal-scripts/stub");

const DIST_PATH = path.join(__dirname, "..", "dist", "template.js");

test("dist/template.js exists (run `bun run build template` first)", () => {
    assert.ok(fs.existsSync(DIST_PATH), `missing ${DIST_PATH} - run "bun run build template" before this test`);
});

test("registerModule runs, the bool setting defaults on, and keyPress persists the counter", () => {
    const stub = createOpalStub();
    stub.evalScript(DIST_PATH);

    const registered = stub.getRegisteredModule();
    assert.ok(registered, "expected registerScript()/registerModule() to have run during eval");
    assert.equal(registered.getBool("Show Counter"), true);

    // storage starts empty - the module's own loadCounter() read back 0
    // without ever writing, so the key is still unset.
    assert.equal(stub.storage.get("template.counter"), null);

    const handler = stub.getRegisteredHandler("keyPress");
    assert.equal(typeof handler, "function");

    // Two SPACE presses -> counter goes 0 -> 1 -> 2, persisted as a
    // JSON-encoded string after each press (the get()-returns-string|null
    // contract main.ts's loadCounter/saveCounter are built on).
    handler(stub.makeFakeInputEvent(keys.SPACE));
    assert.equal(stub.storage.get("template.counter"), JSON.stringify(1));
    handler(stub.makeFakeInputEvent(keys.SPACE));
    assert.equal(stub.storage.get("template.counter"), JSON.stringify(2));

    // A different key is a no-op.
    handler(stub.makeFakeInputEvent(keys.A));
    assert.equal(stub.storage.get("template.counter"), JSON.stringify(2));
});

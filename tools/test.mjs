#!/usr/bin/env node
// Runs every scripts/<id>/tests/*.test.{mjs,js} file (plus a bare
// tests/harness.{js,mjs}), or just one folder's, each in its OWN child
// process (`node <file>`).
//
// Usage:
//   node tools/test.mjs            run every scripts/<id>/tests/*
//   node tools/test.mjs <id>       run just scripts/<id>/tests/*
//
// WHY ONE PROCESS PER FILE
// ------------------------
// Every gallery test installs the Opal scripting globals onto `globalThis`
// via `createOpalStub().installGlobals()` so a script's top-level
// `registerScript`/`module.on(...)` calls (which reference bare globals like
// `player`/`esp`/`renderer`) resolve correctly. An earlier version of this
// file imported every test file into ONE process. That silently broke:
// `node:test` doesn't run a test's body until every imported file has
// finished its synchronous top-level code, so whichever file happened to
// import LAST overwrote every earlier file's globals before any test body
// actually ran (confirmed by reproducing the interleave directly — reorder
// the imported files and a *different* file's tests break). A whole-file
// harness has even less room for another file's stub to interleave: Chomp's
// 326-check suite (`scripts/chomp/tests/harness.js`) freezes `Date.now` and
// seeds `Math.random` for the ENTIRE file, so any cross-file interleaving
// would desync its deterministic playback.
//
// Spawning one child process per test file gives every file (and every
// harness) its own untouched `globalThis`, `node:test` instance, and module
// cache — the isolation the stub's "one stub per test file" contract
// actually assumes. It also means this runner does not need to care whether
// a file uses `node:test` (self-runs under plain `node <file>`, exit code
// reflects pass/fail) or is a plain-script harness (prints its own summary
// and calls `process.exit(1)` on failure) — `node <file>` runs both
// identically; only the child's exit code matters here.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findScriptFolders } from "./lib/scripts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// A test file is `<name>.test.{js,mjs}` / `<name>.spec.{js,mjs}`, or a bare
// `harness.{js,mjs}` — Chomp's suite is a plain-script harness (not a node:test
// file), named `tests/harness.js` per the restructure spec. All three self-run
// under `node <file>` and signal pass/fail through the child's exit code.
const TEST_FILE_PATTERN = /\.(test|spec)\.(mjs|js)$|^harness\.(mjs|js)$/;

/**
 * @param {import("./lib/scripts.mjs").ScriptFolder} folder
 * @returns {string[]} absolute paths to test files
 */
function findTestFiles(folder) {
    const testsDir = path.join(folder.dir, "tests");
    if (!existsSync(testsDir)) {
        return [];
    }
    return readdirSync(testsDir)
        .filter((name) => TEST_FILE_PATTERN.test(name))
        .map((name) => path.join(testsDir, name));
}

/**
 * Runs one test file in its own child process. `stdio: "inherit"` streams
 * the child's own output (TAP from node:test, or a harness's own summary)
 * straight through, so nothing here needs to parse or reformat it.
 *
 * @param {string} file Absolute path to the test file.
 * @returns {boolean} Whether the file passed (clean, zero exit).
 */
function runTestFile(file) {
    const result = spawnSync(process.execPath, [file], {
        cwd: repoRoot,
        stdio: "inherit",
    });

    if (result.error) {
        console.error(`test FAILED  ${path.relative(repoRoot, file)}: ${result.error.message}`);
        return false;
    }
    if (result.signal) {
        console.error(`test FAILED  ${path.relative(repoRoot, file)}: killed by signal ${result.signal}`);
        return false;
    }
    if (result.status !== 0) {
        console.error(`test FAILED  ${path.relative(repoRoot, file)}: exited with code ${result.status}`);
        return false;
    }
    return true;
}

function main() {
    const id = process.argv[2];
    const folders = findScriptFolders(repoRoot);

    if (folders.length === 0) {
        console.log("test: no scripts/ folders found yet, nothing to run");
        return;
    }

    const targets = id ? folders.filter((folder) => folder.id === id) : folders;
    if (id && targets.length === 0) {
        console.error(`test: no script folder named "${id}" under scripts/`);
        process.exitCode = 1;
        return;
    }

    let passed = 0;
    let failed = 0;

    for (const folder of targets) {
        for (const file of findTestFiles(folder)) {
            console.log(`test        ${folder.id}  ${path.relative(repoRoot, file)}`);
            if (runTestFile(file)) {
                passed += 1;
            } else {
                failed += 1;
            }
        }
    }

    const ran = passed + failed;
    if (ran === 0) {
        console.log("test: no test files found under scripts/*/tests");
        return;
    }

    console.log(`test: ${ran} file(s), ${passed} passed, ${failed} failed`);
    if (failed > 0) {
        process.exitCode = 1;
    }
}

main();

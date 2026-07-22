#!/usr/bin/env node
// Runs every scripts/<id>/tests/*.test.{mjs,js} file, or just one folder's,
// against Node's assert-based test files (no test framework dependency).
//
// Usage:
//   node tools/test.mjs            run every scripts/<id>/tests/*
//   node tools/test.mjs <id>       run just scripts/<id>/tests/*

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { findScriptFolders } from "./lib/scripts.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE_PATTERN = /\.(test|spec)\.(mjs|js)$/;

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

async function main() {
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

    let ran = 0;
    let failed = false;

    for (const folder of targets) {
        for (const file of findTestFiles(folder)) {
            ran += 1;
            console.log(`test        ${folder.id}  ${path.relative(repoRoot, file)}`);
            try {
                // Each test file is expected to run its own assertions at
                // import time (e.g. via node:test or plain node:assert) and
                // throw/reject on failure.
                await import(pathToFileURL(file).href);
            } catch (err) {
                failed = true;
                console.error(`test FAILED  ${folder.id}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    if (ran === 0) {
        console.log("test: no test files found under scripts/*/tests");
    }
    if (failed) {
        process.exitCode = 1;
    }
}

await main();

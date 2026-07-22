#!/usr/bin/env node
// Bundles one (or every) scripts/<id>/ folder's manifest.entry into a single
// dist/<id>.js via esbuild's JS API. Bundles are plain IIFE scripts because
// the sandbox `eval`s them directly — no ESM, no runtime module graph.
//
// Usage:
//   node tools/build.mjs            build every scripts/<id>/ folder
//   node tools/build.mjs <id>       build just scripts/<id>/

import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

import { findScriptFolders, readManifest } from "./lib/scripts.mjs";

const MAX_BUNDLE_BYTES = 1024 * 1024; // 1 MB cap, per the repo spec

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {import("./lib/scripts.mjs").ScriptFolder} folder
 */
async function buildOne(folder) {
    const manifest = readManifest(folder.manifestPath);

    // The bundle is named after manifest.id, not the folder-derived id — so
    // this has to hold even when build runs standalone, before validate.
    if (manifest.id !== folder.id) {
        throw new Error(`manifest id "${manifest.id}" does not match its folder name "${folder.id}"`);
    }

    if (typeof manifest.entry !== "string" || manifest.entry.trim() === "") {
        throw new Error('manifest.json is missing a non-empty "entry" field');
    }

    const entryPoint = path.join(folder.dir, manifest.entry);
    if (!existsSync(entryPoint)) {
        throw new Error(`entry file not found: ${path.relative(repoRoot, entryPoint)}`);
    }

    const outDir = path.join(folder.dir, "dist");
    mkdirSync(outDir, { recursive: true });
    const outfile = path.join(outDir, `${manifest.id}.js`);

    await esbuild.build({
        entryPoints: [entryPoint],
        outfile,
        bundle: true,
        format: "iife",
        target: "es2022",
        logLevel: "silent",
    });

    const { size } = statSync(outfile);
    if (size > MAX_BUNDLE_BYTES) {
        rmSync(outfile);
        throw new Error(
            `bundle is ${(size / 1024).toFixed(1)} KB, over the 1 MB cap (${path.relative(repoRoot, outfile)})`,
        );
    }

    console.log(`build ok    ${manifest.id} -> ${path.relative(repoRoot, outfile)} (${(size / 1024).toFixed(1)} KB)`);
}

async function main() {
    const id = process.argv[2];
    const folders = findScriptFolders(repoRoot);

    if (folders.length === 0) {
        console.log("build: no scripts/ folders found yet, nothing to build");
        return;
    }

    const targets = id ? folders.filter((folder) => folder.id === id) : folders;
    if (id && targets.length === 0) {
        console.error(`build: no script folder named "${id}" under scripts/`);
        process.exitCode = 1;
        return;
    }

    let failed = false;
    for (const folder of targets) {
        try {
            await buildOne(folder);
        } catch (err) {
            failed = true;
            console.error(`build FAILED  ${folder.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    if (failed) {
        process.exitCode = 1;
    }
}

await main();

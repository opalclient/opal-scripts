#!/usr/bin/env node
// Validates every scripts/<id>/manifest.json against the repo's manifest
// schema (docs/superpowers/specs/2026-07-22-scripts-repo-design.md):
//
//   id          kebab-case, unique, equal to the folder name
//   name        nonempty string
//   version     semver
//   authors     nonempty array
//   description nonempty string
//   category    one of character | combo | core | ui | world
//   entry       repo-relative path (within the folder) that exists
//
// `template/` is never a real script and is always skipped.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findScriptFolders, readManifest } from "./lib/scripts.mjs";

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const CATEGORIES = new Set(["character", "combo", "core", "ui", "world"]);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {import("./lib/scripts.mjs").ScriptFolder} folder
 * @param {Record<string, unknown>} manifest
 * @returns {string[]} human-readable problems, without the folder id prefix
 */
function validateManifest(folder, manifest) {
    const errors = [];

    if (!KEBAB_CASE.test(folder.id)) {
        errors.push(`folder name "${folder.id}" is not kebab-case`);
    }
    if (manifest.id !== folder.id) {
        errors.push(`id "${manifest.id}" must equal the folder name "${folder.id}"`);
    }
    if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
        errors.push("name must be a nonempty string");
    }
    if (typeof manifest.version !== "string" || !SEMVER.test(manifest.version)) {
        errors.push(`version "${manifest.version}" is not valid semver`);
    }
    if (!Array.isArray(manifest.authors) || manifest.authors.length === 0) {
        errors.push("authors must be a nonempty array");
    }
    if (typeof manifest.description !== "string" || manifest.description.trim() === "") {
        errors.push("description must be a nonempty string");
    }
    if (typeof manifest.category !== "string" || !CATEGORIES.has(manifest.category)) {
        errors.push(`category "${manifest.category}" must be one of ${[...CATEGORIES].join(", ")}`);
    }
    if (typeof manifest.entry !== "string" || manifest.entry.trim() === "") {
        errors.push("entry must be a nonempty string");
    } else if (!existsSync(path.join(folder.dir, manifest.entry))) {
        errors.push(`entry file "${manifest.entry}" does not exist`);
    }

    return errors;
}

function main() {
    const folders = findScriptFolders(repoRoot);

    if (folders.length === 0) {
        console.log("validate-manifest: no scripts/ folders found yet, nothing to validate");
        return;
    }

    const allErrors = [];
    const idCounts = new Map();

    for (const folder of folders) {
        let manifest;
        try {
            manifest = readManifest(folder.manifestPath);
        } catch (err) {
            allErrors.push(`${folder.id}: manifest.json is not valid JSON (${err.message})`);
            continue;
        }

        for (const problem of validateManifest(folder, manifest)) {
            allErrors.push(`${folder.id}: ${problem}`);
        }

        if (typeof manifest.id === "string") {
            idCounts.set(manifest.id, (idCounts.get(manifest.id) ?? 0) + 1);
        }
    }

    for (const [id, count] of idCounts) {
        if (count > 1) {
            allErrors.push(`${id}: manifest id declared by ${count} different folders`);
        }
    }

    if (allErrors.length > 0) {
        console.error(`validate-manifest: ${allErrors.length} problem(s) found`);
        for (const error of allErrors) {
            console.error(`  - ${error}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log(`validate-manifest: ${folders.length} manifest(s) OK`);
}

main();

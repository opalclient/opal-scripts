// Shared helpers for the repo-tools scripts (build / test / validate).
//
// The target layout (see docs/superpowers/specs) is `scripts/<id>/manifest.json`
// per script folder. Until that migration lands, `scripts/` won't exist at
// all, so every helper here treats "no scripts/ directory" as "zero folders"
// rather than an error.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * @typedef {object} ScriptFolder
 * @property {string} id - folder name, expected to match manifest.json's "id"
 * @property {string} dir - absolute path to the folder
 * @property {string} manifestPath - absolute path to the folder's manifest.json
 */

/**
 * Lists every immediate subfolder of `scripts/` that carries a manifest.json.
 * Returns an empty array when `scripts/` doesn't exist yet.
 *
 * @param {string} repoRoot
 * @returns {ScriptFolder[]}
 */
export function findScriptFolders(repoRoot) {
    const scriptsDir = path.join(repoRoot, "scripts");
    if (!existsSync(scriptsDir)) {
        return [];
    }

    const folders = [];
    for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === "template") {
            continue;
        }
        const dir = path.join(scriptsDir, entry.name);
        const manifestPath = path.join(dir, "manifest.json");
        if (existsSync(manifestPath)) {
            folders.push({ id: entry.name, dir, manifestPath });
        }
    }

    return folders.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Reads and JSON-parses a manifest.json. Throws with the raw parse error
 * message on malformed JSON; callers are expected to attribute it to the
 * right folder.
 *
 * @param {string} manifestPath
 * @returns {Record<string, unknown>}
 */
export function readManifest(manifestPath) {
    const raw = readFileSync(manifestPath, "utf8");
    return JSON.parse(raw);
}

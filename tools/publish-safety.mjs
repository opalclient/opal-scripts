#!/usr/bin/env node
// Scans every git-tracked file for three publish-safety hazards and exits 1
// with `path:line: message` per hit:
//
//   1. machine paths      (drive-letter user paths, /home/, /Users/, ~/)
//   2. credential-shaped  (Stripe/AWS/GitHub/Slack key shapes, PEM headers,
//      tokens              JWT-shaped strings)
//   3. AI-attribution      a trailer-shaped line naming a well-known coding
//      trailer lines        assistant, pasted verbatim into a tracked file
//
// This is a public repo's gate, so it has to survive scanning itself: every
// pattern below is assembled from short fragments rather than spelled out
// as a literal example, so this file's own source never contains a
// contiguous run of the text it is looking for.

import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const NUL = String.fromCharCode(0);
const MAX_SCAN_BYTES = 2 * 1024 * 1024; // skip anything this large; not source
const SKIP_EXTENSIONS = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".ico",
    ".webp",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".zip",
    ".gz",
    ".tar",
    ".jar",
    ".exe",
    ".dll",
    ".pdf",
    ".mp3",
    ".mp4",
    ".wasm",
]);
const SKIP_BASENAMES = new Set(["bun.lock", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"]);

/** @returns {string[]} repo-relative paths of every git-tracked file */
function listTrackedFiles() {
    const output = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "utf8" });
    return output.split(NUL).filter((entry) => entry.length > 0);
}

// --- 1. machine paths ---------------------------------------------------
// A real filename/username segment (letters, digits, dot, underscore,
// hyphen — at least two of them) is required after the marker, so that
// abstract mentions of the pattern's shape (a bare marker inside backticks,
// followed by punctuation, not a name) don't count as a real leak.
const PATH_SEGMENT = /[A-Za-z0-9_.-]{2,}/.source;
const machinePathChecks = [
    { label: "Windows drive-letter user path", regex: new RegExp(`[A-Za-z]:[\\\\/]Users[\\\\/]${PATH_SEGMENT}`) },
    { label: "macOS user path", regex: new RegExp(`/Users/${PATH_SEGMENT}`) },
    { label: "Unix home directory path", regex: new RegExp(`/home/${PATH_SEGMENT}`) },
    { label: "home-directory shorthand (~)", regex: new RegExp(`~[\\\\/]${PATH_SEGMENT}`) },
];

// --- 2. credential-shaped tokens ----------------------------------------
const credentialChecks = [
    { label: "Stripe secret key", regex: /sk_(?:live|test)_[A-Za-z0-9]{10,}/ },
    { label: "Stripe webhook secret", regex: /whsec_[A-Za-z0-9]{10,}/ },
    { label: "AWS access key id", regex: /AKIA[0-9A-Z]{16}/ },
    { label: "GitHub token", regex: /gh[opusr]_[A-Za-z0-9]{36,}/ },
    { label: "GitHub fine-grained PAT", regex: /github_pat_[A-Za-z0-9_]{20,}/ },
    { label: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
    { label: "PEM private key header", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { label: "JWT-shaped token", regex: /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\./ },
];

// --- 3. AI-attribution trailers ------------------------------------------
// Built from fragments so the trailer key and an assistant name are never
// adjacent, plain text in this file the way a real trailer would be. Only
// fires on trailer-shaped lines (key + name on the same line); it also
// skips any line containing a backtick, which is how this repo's own
// governance docs quote the *rule* ("don't add a `...`trailer`") without
// tripping the gate that enforces it.
const trailerKey = ["co", "-authored-by"].join("");
const assistantNames = [["cla", "ude"].join(""), ["anthro", "pic"].join("")];
const AI_TRAILER = new RegExp(`${trailerKey}.*(?:${assistantNames.join("|")})`, "i");

/**
 * @param {string} relPath
 * @param {string} content
 * @returns {string[]} findings as `line N: label`
 */
function scanContent(relPath, content) {
    const findings = [];
    const lines = content.split(/\r\n|\r|\n/);

    lines.forEach((line, index) => {
        const lineNo = index + 1;

        for (const { label, regex } of machinePathChecks) {
            if (regex.test(line)) {
                findings.push(`${relPath}:${lineNo}: ${label}`);
            }
        }

        for (const { label, regex } of credentialChecks) {
            if (regex.test(line)) {
                findings.push(`${relPath}:${lineNo}: ${label}`);
            }
        }

        if (!line.includes("`") && AI_TRAILER.test(line)) {
            findings.push(`${relPath}:${lineNo}: AI-attribution commit trailer`);
        }
    });

    return findings;
}

function main() {
    const files = listTrackedFiles();
    const allFindings = [];
    let scanned = 0;

    for (const relPath of files) {
        const ext = path.extname(relPath).toLowerCase();
        const base = path.basename(relPath);
        if (SKIP_EXTENSIONS.has(ext) || SKIP_BASENAMES.has(base)) {
            continue;
        }

        const absPath = path.join(repoRoot, relPath);
        const { size } = statSync(absPath);
        if (size > MAX_SCAN_BYTES) {
            continue;
        }

        let content;
        try {
            content = readFileSync(absPath, "utf8");
        } catch {
            continue; // unreadable / not text — nothing to scan
        }

        scanned += 1;
        allFindings.push(...scanContent(relPath, content));
    }

    if (allFindings.length > 0) {
        console.error(`publish-safety: ${allFindings.length} problem(s) found`);
        for (const finding of allFindings) {
            console.error(`  - ${finding}`);
        }
        process.exitCode = 1;
        return;
    }

    console.log(`publish-safety: ${scanned} file(s) scanned, clean`);
}

main();

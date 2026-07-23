// =============================================================================
//  game/meta.ts — persistence-backed meta layer.
// =============================================================================
//
//  High scores, lifetime crumbs, meta unlocks, and the once-per-run fold. Reads
//  and writes through engine/storage's loadJson / saveJson (never the raw
//  `storage` global) and reconciles the PERKS / THEMES `locked` flags against
//  what meta.unlocked owns — the single source of truth for lock state. The
//  run-end fold (recordRun) takes the live game so the run's numbers close out
//  exactly once; a build without `storage` still computes lastRun (the game-over
//  screen renders) but nothing is written.
// =============================================================================

import { loadJson, saveJson } from "../engine/storage";
import { TEXT, THEMES } from "./config";
import { PERKS, UNLOCKS, type Unlock } from "./content";
import type { Entry, GameState, Highscores, Meta } from "./state";

// The two persisted documents, normalised so a partial/old blob (or a fresh
// install) always yields every field with a sane numeric default — no undefined
// or NaN ever reaches the unlock/knob paths.
export function loadMeta(): Meta {
    const m = loadJson<Record<string, unknown>>("chomp.meta", {});
    // Coerce every numeric field with Number(x) || 0: a partial/old blob may hold a
    // string (or nothing), and a bare `|| 0` would leave "200" a string that later
    // string-concats into the crumb fold. Number() forces a clean numeric default.
    return {
        pellets: Number(m.pellets) || 0,
        ghosts: Number(m.ghosts) || 0,
        runs: Number(m.runs) || 0,
        bestRound: Number(m.bestRound) || 0,
        crumbs: Number(m.crumbs) || 0,
        unlocked: Array.isArray(m.unlocked) ? (m.unlocked.slice() as string[]) : [],
    };
}

export function loadHighscores(): Highscores {
    const h = loadJson<{ entries?: unknown }>("chomp.highscores", {});
    const entries = Array.isArray(h.entries) ? (h.entries.filter((e) => e && typeof e.s === "number") as Entry[]) : [];
    return { entries };
}

// Reconcile the PERKS / THEMES `locked` flags against what meta.unlocked owns —
// the SINGLE source of truth for lock state. Idempotent and resettable: a fresh
// meta re-locks everything, an owned id opens it. The draft pool + theme bag then
// pick the change up naturally (they already filter on `locked`) — no forked pool.
export function syncUnlocks(meta: Meta | null): void {
    const owned = meta && Array.isArray(meta.unlocked) ? meta.unlocked : [];
    for (const u of UNLOCKS) {
        const has = owned.indexOf(u.id) !== -1;
        if (u.kind === "perk") {
            const p = PERKS.find((x) => x.id === u.id);
            if (p) p.locked = !has;
        } else if (u.kind === "theme") {
            const t = THEMES.find((x) => x.id === u.id);
            if (t) t.locked = !has;
        }
    }
}

// Human label for an unlock (used in the game-over screen + toasts).
export function unlockLabel(u: Unlock): string {
    if (u.kind === "perk") {
        const p = PERKS.find((x) => x.id === u.id);
        return p ? p.name : u.id;
    }
    if (u.kind === "theme") {
        const t = THEMES.find((x) => x.id === u.id);
        return t ? t.name : u.id;
    }
    return u.id === "startdraft" ? "Start Draft" : u.id;
}

// Best-effort toast. Guarded so a build without `notification` still runs.
export function notify(msg: string): void {
    if (typeof notification !== "undefined" && notification?.success) {
        try {
            notification.success("Chomp", msg);
        } catch {
            /* toasts are cosmetic */
        }
    }
}

// Fold a finished run into persistence — exactly once. Stats accumulate, the
// score enters the top-10 board, crumbs tick up (lifetime, never spent), and
// every newly affordable unlock is auto-claimed in table order. Best-effort:
// with storage absent the fold still computes game.lastRun (so the game-over
// screen renders) but nothing is written.
export function recordRun(game: GameState): void {
    if (game.recorded) return;
    game.recorded = true;

    const meta = game.meta as Meta;
    const hs = game.highscores as Highscores;

    // Fold lifetime stats.
    meta.runs = (meta.runs || 0) + 1;
    meta.pellets = (meta.pellets || 0) + game.pelletsEaten;
    meta.ghosts = (meta.ghosts || 0) + game.ghostsEaten;
    if (game.round > (meta.bestRound || 0)) meta.bestRound = game.round;

    // Crumbs: floor(score / 500) + round * 5, added to the lifetime total.
    const earned = Math.floor(game.score / 500) + game.round * 5;
    meta.crumbs = (meta.crumbs || 0) + earned;

    // High-score entry: insert, sort desc by score, keep the top 10. Rank is
    // read before the cap so a bumped-off entry reports madeBoard === false.
    const entry: Entry = { s: game.score, r: game.round, d: Date.now() };
    hs.entries.push(entry);
    hs.entries.sort((a, b) => b.s - a.s);
    const rank = hs.entries.indexOf(entry);
    if (hs.entries.length > 10) hs.entries = hs.entries.slice(0, 10);
    const madeBoard = rank < 10;
    const newHigh = rank === 0;

    // Auto-claim every unlock now affordable (thresholds are cumulative-lifetime),
    // in table order; syncUnlocks then reconciles the pool/bag lock flags.
    const claimed: Unlock[] = [];
    for (const u of UNLOCKS) {
        if (meta.unlocked.indexOf(u.id) !== -1) continue;
        if (meta.crumbs < u.cost) continue;
        meta.unlocked.push(u.id);
        claimed.push(u);
    }
    if (claimed.length) {
        syncUnlocks(meta);
        game.startdraftUnlocked = meta.unlocked.indexOf("startdraft") !== -1;
    }

    // Persist (a no-op when storage is absent).
    saveJson("chomp.meta", meta);
    saveJson("chomp.highscores", hs);

    // Toasts: the high-score banner is drawn on the board; unlocks toast here.
    if (newHigh) notify(TEXT.toastHigh);
    else if (madeBoard) notify(TEXT.toastTop);
    for (const u of claimed) notify(TEXT.toastUnlock(unlockLabel(u)));

    game.lastRun = { earned, rank, madeBoard, newHigh, entry, claimed };
}

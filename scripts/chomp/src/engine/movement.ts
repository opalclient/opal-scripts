// =============================================================================
//  engine/movement.ts — directions, stepping rules, and the entity mover.
// =============================================================================
//
//  Generic arcade plumbing, no game content: the cardinal directions, the
//  wall / phase stepping rules, and the center-to-center mover with its
//  cornering-grace helper and tunnel wrap. Reads the board only through grid.ts
//  (isWall / inPen / dimensions); it never imports game content.
// =============================================================================

import { COLS, type Coord, inPen, isWall, ROWS } from "./grid";

export type DirName = "none" | "left" | "right" | "up" | "down";

export interface Dir {
    x: number;
    y: number;
}

export const DIRS: Record<DirName, Dir> = {
    none: { x: 0, y: 0 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
};

export function isOpposite(a: Dir, b: Dir): boolean {
    return a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0);
}

export function canStep(c: number, r: number, dir: Dir): boolean {
    if (dir.x === 0 && dir.y === 0) return false;
    return !isWall(c + dir.x, r + dir.y);
}

// A phasing entity ("phase" event, or a phasing elite's clip) ignores walls but
// stays inside the interior ring and out of the pen — it cannot leave the board
// or hide in the cage.
export function canStepPhase(c: number, r: number, dir: Dir): boolean {
    if (dir.x === 0 && dir.y === 0) return false;
    const nc = c + dir.x;
    const nr = r + dir.y;
    if (nc < 1 || nc >= COLS - 1 || nr < 1 || nr >= ROWS - 1) return false;
    return !inPen(nc, nr);
}

// Which stepping rule an entity obeys this frame: walls, or the phase override.
export function stepFor(e: { phasing?: boolean } | null | undefined, c: number, r: number, dir: Dir): boolean {
    return e?.phasing ? canStepPhase(c, r, dir) : canStep(c, r, dir);
}

// The mover's minimum entity shape. Concrete entities (Chomp, ghosts, the
// runner) extend this with their own fields; move() is generic over them.
export interface Mover {
    px: number;
    py: number;
    dir: Dir;
    want: Dir;
    phasing?: boolean;
    wrappedThisMove?: boolean;
}

export type MoveDecide<E> = (e: E, col: number, row: number) => void;

// Move one entity center-to-center, making turn decisions at tile centres.
export function move<E extends Mover>(e: E, speed: number, dt: number, decide: MoveDecide<E> | null): void {
    e.wrappedThisMove = false; // true this frame if a tunnel wrap fires (Toll Booth reads it)
    let remaining = speed * dt;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 16) {
        let distToCenter: number;
        if (e.dir.x !== 0) {
            const next = e.dir.x > 0 ? Math.floor(e.px) + 1 : Math.ceil(e.px) - 1;
            distToCenter = Math.abs(next - e.px);
        } else if (e.dir.y !== 0) {
            const next = e.dir.y > 0 ? Math.floor(e.py) + 1 : Math.ceil(e.py) - 1;
            distToCenter = Math.abs(next - e.py);
        } else {
            const col = Math.round(e.px);
            const row = Math.round(e.py);
            if (decide) decide(e, col, row);
            if (e.want && stepFor(e, col, row, e.want)) {
                e.dir = e.want;
                continue;
            }
            break; // stopped, no opening
        }

        const moveBy = Math.min(remaining, distToCenter);
        e.px += e.dir.x * moveBy;
        e.py += e.dir.y * moveBy;
        remaining -= moveBy;

        if (moveBy >= distToCenter - 1e-9) {
            // Snap to the centre and make a decision.
            e.px = Math.round(e.px);
            e.py = Math.round(e.py);

            // Tunnel wrap.
            if (e.px <= 0 && e.dir.x < 0) {
                e.px = COLS - 1;
                e.wrappedThisMove = true;
            } else if (e.px >= COLS - 1 && e.dir.x > 0) {
                e.px = 0;
                e.wrappedThisMove = true;
            }

            const col = Math.round(e.px);
            const row = Math.round(e.py);
            if (decide) decide(e, col, row);
            if (e.want && stepFor(e, col, row, e.want)) e.dir = e.want;
            if (!stepFor(e, col, row, e.dir)) e.dir = DIRS.none;
        }
    }
}

export function tileOf(e: { px: number; py: number }): Coord {
    return { c: Math.round(e.px), r: Math.round(e.py) };
}

// Cornering grace: if a PERPENDICULAR turn is wanted and the entity is within
// `grace` tiles of a cell centre where that turn is open, snap to the centre and
// turn now instead of overshooting and taking it a tile late. Only ever tightens
// a turn — it snaps to the nearest centre already reached or about to be.
export function tryCorner(e: Mover, grace: number): void {
    const w = e.want;
    if (!w || (w.x === 0 && w.y === 0)) return; // no turn wanted
    if (e.dir.x === 0 && e.dir.y === 0) return; // stalled — nothing to corner off
    if (e.dir.x !== 0 && w.x !== 0) return; // want is on the travel axis, not a corner
    if (e.dir.y !== 0 && w.y !== 0) return;
    if (e.dir.x !== 0) {
        const cc = Math.round(e.px);
        const row = Math.round(e.py);
        if (Math.abs(e.px - cc) <= grace && !isWall(cc + w.x, row + w.y)) {
            e.px = cc;
            e.py = row;
            e.dir = w;
        }
    } else {
        const cr = Math.round(e.py);
        const col = Math.round(e.px);
        if (Math.abs(e.py - cr) <= grace && !isWall(col + w.x, cr + w.y)) {
            e.px = col;
            e.py = cr;
            e.dir = w;
        }
    }
}

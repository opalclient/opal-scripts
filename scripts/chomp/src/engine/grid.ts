// =============================================================================
//  engine/grid.ts — board geometry and the maze system.
// =============================================================================
//
//  Generic arcade plumbing, no game content: the fixed board dimensions, the
//  shared maze state, and a seeded generator that carves a symmetric maze
//  (recursive backtracker → loop-knock braid → mirror → border/pen/tunnel stamp
//  → pellet placement → flood-fill validation) with a guaranteed-valid pillar
//  lattice fallback. Everything is parameterized by the caller (round, an
//  externally-seeded rng, and MazeOpts); the difficulty curve that used to
//  supply the default knock rate lives in game/ now and passes it in, so this
//  file stays content-free.
//
//  `grid`/`pelletsLeft`/`tunnelRows` live on the module-level `maze` object,
//  shared by every game surface exactly as before.
// =============================================================================

// Board geometry. A 19x21 grid carved as a symmetric half (10 columns) and
// mirrored about the centre column.
export const COLS = 19;
export const ROWS = 21;
export const HALF = (COLS + 1) / 2; // 10 half-grid columns
export const MID_ROW = (ROWS - 1) >> 1; // 10
export const CENTER_COL = (COLS - 1) >> 1; // 9

export interface Coord {
    c: number;
    r: number;
}

export const HOME: Coord = { c: CENTER_COL, r: MID_ROW };

// Tile codes: '#' wall, '.' pellet, 'o' power pellet, ' ' empty.
export type Cell = "#" | "." | "o" | " ";

// Generation knobs. `mirror` and `extraPower` default as before; `knockRate` is
// supplied by the caller (it was difficulty(round).knockRate inline before the
// split — the round caller now folds it in, keeping engine free of the curve).
export interface MazeOpts {
    mirror?: boolean;
    knockRate: number;
    extraPower?: number;
}

export interface MazeResult {
    ok: boolean;
    grid: Cell[][];
    pellets: number;
    tunnelRows: Set<number>;
    powerCells: Coord[];
}

// Shared maze state: `grid` holds the tile codes, `tunnelRows` the rows whose
// left/right edges wrap. Both game surfaces read through this one object.
export const maze: { grid: Cell[][]; pelletsLeft: number; tunnelRows: Set<number> } = {
    grid: [],
    pelletsLeft: 0,
    tunnelRows: new Set<number>([MID_ROW]),
};

// Random symmetric maze. Writes the module-level maze state and returns a
// descriptor; falls back to the pillar lattice after 8 failed attempts.
export function generateMaze(round: number, rng: () => number, opts: MazeOpts): MazeResult {
    const mirror = opts.mirror !== undefined ? opts.mirror : true;
    const knockRate = opts.knockRate;
    const extraPower = opts.extraPower ?? 0;

    for (let attempt = 0; attempt < 8; attempt++) {
        const result = carveMaze(round, rng, mirror, knockRate, extraPower);
        if (result) return result;
    }
    return fallbackMaze();
}

// One maze attempt. Returns a descriptor on success, null if it fails validation
// (an unreachable open cell or fewer than 60 pellets) so generateMaze can retry.
function carveMaze(
    round: number,
    rng: () => number,
    mirror: boolean,
    knockRate: number,
    extraPower: number,
): MazeResult | null {
    const maxCol = mirror ? HALF - 1 : COLS - 2;

    // 1. Start all-wall, then carve a recursive backtracker over odd/odd cells.
    const g: Cell[][] = [];
    for (let r = 0; r < ROWS; r++) {
        const row: Cell[] = [];
        for (let c = 0; c < COLS; c++) row.push("#");
        g.push(row);
    }

    (g[1] as Cell[])[1] = " ";
    const stack: Array<[number, number]> = [[1, 1]];
    const steps: Array<[number, number]> = [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
    ];
    while (stack.length) {
        const cur = stack[stack.length - 1];
        if (!cur) break;
        const c = cur[0];
        const r = cur[1];
        const neighbors: Array<[number, number]> = [];
        for (const s of steps) {
            const nc = c + s[0];
            const nr = r + s[1];
            if (nc >= 1 && nc <= maxCol && nr >= 1 && nr <= ROWS - 2 && g[nr]?.[nc] === "#") neighbors.push(s);
        }
        if (neighbors.length === 0) {
            stack.pop();
            continue;
        }
        const s = neighbors[(rng() * neighbors.length) | 0] as [number, number];
        (g[r + s[1] / 2] as Cell[])[c + s[0] / 2] = " "; // knock the wall between
        (g[r + s[1]] as Cell[])[c + s[0]] = " ";
        stack.push([c + s[0], r + s[1]]);
    }

    // 2. Loop-knock: braid the tree by removing a fraction of the interior walls
    //    whose removal joins two already-open cells.
    const walls: Array<[number, number]> = [];
    for (let r = 1; r <= ROWS - 2; r++) {
        const row = g[r] as Cell[];
        const up = g[r - 1] as Cell[];
        const down = g[r + 1] as Cell[];
        for (let c = 1; c <= maxCol; c++) {
            if (row[c] !== "#") continue;
            const openLR = row[c - 1] !== "#" && row[c + 1] !== "#";
            const openUD = up[c] !== "#" && down[c] !== "#";
            if (openLR || openUD) walls.push([c, r]);
        }
    }
    let knock = Math.floor(walls.length * knockRate);
    while (knock-- > 0 && walls.length) {
        const w = walls.splice((rng() * walls.length) | 0, 1)[0] as [number, number];
        (g[w[1]] as Cell[])[w[0]] = " ";
    }

    // 3. Mirror the carved half about the centre column.
    if (mirror) {
        for (let r = 0; r < ROWS; r++) {
            const row = g[r] as Cell[];
            for (let c = 0; c < CENTER_COL; c++) row[COLS - 1 - c] = row[c] as Cell;
        }
    }

    maze.grid = g;
    maze.tunnelRows = new Set<number>();

    // 4. Stamp constants: border ring, ghost pen, start cell, wrap tunnels.
    for (let c = 0; c < COLS; c++) {
        (g[0] as Cell[])[c] = "#";
        (g[ROWS - 1] as Cell[])[c] = "#";
    }
    for (let r = 0; r < ROWS; r++) {
        const row = g[r] as Cell[];
        row[0] = "#";
        row[COLS - 1] = "#";
    }
    for (let r = HOME.r - 1; r <= HOME.r + 1; r++) {
        const row = g[r] as Cell[];
        for (let c = HOME.c - 1; c <= HOME.c + 1; c++) row[c] = " ";
    }
    (g[ROWS - 3] as Cell[])[CENTER_COL] = " ";

    const tunnelCount = round >= 5 ? (rng() < 0.5 ? 2 : 1) : 1;
    const candidates: number[] = [];
    for (let r = 1; r <= ROWS - 2; r += 2) {
        if (r >= HOME.r - 1 && r <= HOME.r + 1) continue; // keep tunnels out of the pen
        candidates.push(r);
    }
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const tmp = candidates[i] as number;
        candidates[i] = candidates[j] as number;
        candidates[j] = tmp;
    }
    for (const r of candidates.slice(0, Math.min(tunnelCount, candidates.length))) {
        maze.tunnelRows.add(r);
        const row = g[r] as Cell[];
        row[0] = " ";
        row[1] = " ";
        row[COLS - 2] = " ";
        row[COLS - 1] = " ";
    }

    // 5. Pellets on every open cell outside the pen and start; power pellets at
    //    the four near-corners plus any granted by perks (extraPower).
    for (let r = 0; r < ROWS; r++) {
        const row = g[r] as Cell[];
        for (let c = 0; c < COLS; c++) {
            if (row[c] !== " ") continue;
            const inPenCell = c >= HOME.c - 1 && c <= HOME.c + 1 && r >= HOME.r - 1 && r <= HOME.r + 1;
            const isStart = c === CENTER_COL && r === ROWS - 3;
            if (!inPenCell && !isStart) row[c] = ".";
        }
    }

    const powerCells: Coord[] = [
        { c: 1, r: 1 },
        { c: COLS - 2, r: 1 },
        { c: 1, r: ROWS - 2 },
        { c: COLS - 2, r: ROWS - 2 },
    ];
    if (extraPower > 0) {
        const open: Coord[] = [];
        for (let r = 1; r < ROWS - 1; r++) {
            const row = g[r] as Cell[];
            for (let c = 1; c < COLS - 1; c++) if (row[c] === ".") open.push({ c, r });
        }
        for (let i = open.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const tmp = open[i] as Coord;
            open[i] = open[j] as Coord;
            open[j] = tmp;
        }
        let placed = 0;
        for (const cell of open) {
            if (placed >= extraPower) break;
            if (powerCells.some((p) => Math.abs(p.c - cell.c) + Math.abs(p.r - cell.r) < 4)) continue;
            powerCells.push(cell);
            placed++;
        }
    }
    for (const p of powerCells) {
        if ((g[p.r] as Cell[])[p.c] !== "#") (g[p.r] as Cell[])[p.c] = "o";
    }

    maze.pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
        const row = g[r] as Cell[];
        for (let c = 0; c < COLS; c++) if (row[c] === "." || row[c] === "o") maze.pelletsLeft++;
    }

    // 6. Validate: flood fill from the start honouring tunnel wrap.
    if (maze.pelletsLeft < 60) return null;
    if (!isFullyConnected()) return null;

    return { ok: true, grid: g, pellets: maze.pelletsLeft, tunnelRows: maze.tunnelRows, powerCells };
}

// The v1.0 pillar lattice: a wall ring with isolated single-tile pillars on
// even/even interior cells (a pillar can never disconnect a corridor). Kept as
// the guaranteed-valid fallback when generation cannot produce a good maze.
function fallbackMaze(): MazeResult {
    const g: Cell[][] = [];
    for (let r = 0; r < ROWS; r++) {
        const row: Cell[] = [];
        for (let c = 0; c < COLS; c++) {
            const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
            const pillar = r % 2 === 0 && c % 2 === 0;
            row.push(border || pillar ? "#" : ".");
        }
        g.push(row);
    }
    maze.grid = g;
    maze.tunnelRows = new Set<number>([MID_ROW]);

    for (let r = HOME.r - 1; r <= HOME.r + 1; r++) {
        const row = g[r] as Cell[];
        for (let c = HOME.c - 1; c <= HOME.c + 1; c++) row[c] = " ";
    }
    (g[MID_ROW] as Cell[])[0] = " ";
    (g[MID_ROW] as Cell[])[COLS - 1] = " ";
    (g[MID_ROW] as Cell[])[1] = " ";
    (g[MID_ROW] as Cell[])[COLS - 2] = " ";
    (g[ROWS - 3] as Cell[])[CENTER_COL] = " ";

    const powerCells: Coord[] = [
        { c: 1, r: 1 },
        { c: COLS - 2, r: 1 },
        { c: 1, r: ROWS - 2 },
        { c: COLS - 2, r: ROWS - 2 },
    ];
    for (const p of powerCells) {
        if ((g[p.r] as Cell[])[p.c] !== "#") (g[p.r] as Cell[])[p.c] = "o";
    }

    maze.pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
        const row = g[r] as Cell[];
        for (let c = 0; c < COLS; c++) if (row[c] === "." || row[c] === "o") maze.pelletsLeft++;
    }

    return { ok: false, grid: g, pellets: maze.pelletsLeft, tunnelRows: maze.tunnelRows, powerCells };
}

// Flood fill from the start cell over the maze grid, wrapping at tunnel rows.
// Returns true only if every open cell is reachable.
function isFullyConnected(): boolean {
    let total = 0;
    for (let r = 0; r < ROWS; r++) {
        const row = maze.grid[r] as Cell[];
        for (let c = 0; c < COLS; c++) if (row[c] !== "#") total++;
    }
    const seen = new Set<number>();
    const stack: Array<[number, number]> = [[CENTER_COL, ROWS - 3]];
    // up, down, left, right — same order as the original DIRS lookup.
    const deltas: Array<[number, number]> = [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
    ];
    while (stack.length) {
        const cell = stack.pop();
        if (!cell) break;
        const c = cell[0];
        const r = cell[1];
        const key = r * COLS + c;
        if (seen.has(key) || isWall(c, r)) continue;
        seen.add(key);
        for (const d of deltas) {
            let nc = c + d[0];
            const nr = r + d[1];
            if (nr < 0 || nr >= ROWS) continue;
            if (nc < 0) nc = COLS - 1;
            else if (nc >= COLS) nc = 0;
            if (!isWall(nc, nr) && !seen.has(nr * COLS + nc)) stack.push([nc, nr]);
        }
    }
    return seen.size === total;
}

export function isWall(c: number, r: number): boolean {
    if (r < 0 || r >= ROWS) return true;
    // Off-grid columns are open only on tunnel rows (which wrap around).
    if (c < 0 || c >= COLS) return !maze.tunnelRows.has(r);
    return maze.grid[r]?.[c] === "#";
}

// The 3x3 ghost pen around HOME — spawners, pads and phasing ghosts avoid it.
export function inPen(c: number, r: number): boolean {
    return c >= HOME.c - 1 && c <= HOME.c + 1 && r >= HOME.r - 1 && r <= HOME.r + 1;
}

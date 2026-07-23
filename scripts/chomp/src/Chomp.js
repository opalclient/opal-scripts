// =============================================================================
//  Chomp — a playable maze game for Opal's command palette
// =============================================================================
//
//  A maze chase game that runs in TWO places from one shared engine:
//
//    1. As a COMMAND PALETTE VIEW (the headline). Search the palette for
//       "Chomp" and press Enter. Uses the `palette` script API to register a
//       canvas-backed view that draws itself and takes keyboard input each frame.
//
//    2. As a fullscreen OVERLAY MODULE (no new client APIs). Enable the "Chomp"
//       module and play over the HUD; it draws on `renderScreen` and steers
//       from `keyPress` events.
//
//  Every round builds a fresh, random, mirror-symmetric maze (seeded so the
//  node harness can replay any failure) and paints it with one of 14 themes. A
//  clear opens a perk draft, and the full roguelite loop — perks, curses, elite
//  affixes, mutators — folds through difficulty(round), the single source of
//  every per-round scaling number the engine reads. Runs persist through the
//  feature-detected `storage` wrapper: high scores, lifetime crumbs, meta unlocks.
//
//  Controls: Arrows or WASD to move · P pause · R twice to restart · Enter to
//  start or confirm.
//
//  A data-driven teaching example of the palette + renderer + storage script APIs:
//  all copy lives in one TEXT table, all tuning in difficulty(), all colour in the
//  THEMES set — so the surface reads as a catalogue of the APIs, not a tangle.
//
//  Author: trq  ·  A flagship example of the scripting + palette-view API.
// =============================================================================

const script = registerScript({
    name: "Chomp",
    version: "1.1.0",
    authors: ["trq"],
});

// -----------------------------------------------------------------------------
//  Board geometry. A 19x21 grid carved as a symmetric half (10 columns) and
//  mirrored about the centre column.
// -----------------------------------------------------------------------------
const COLS = 19;
const ROWS = 21;
const HALF = (COLS + 1) / 2; // 10 half-grid columns
const MID_ROW = (ROWS - 1) >> 1; // 10
const CENTER_COL = (COLS - 1) >> 1; // 9
const HOME = { c: CENTER_COL, r: MID_ROW };

const SCATTER = [
    { c: COLS - 2, r: 1 }, // Blinky -> top-right
    { c: 1, r: 1 }, // Pinky  -> top-left
    { c: COLS - 2, r: ROWS - 2 }, // Inky  -> bottom-right
    { c: 1, r: ROWS - 2 }, // Clyde -> bottom-left
];

// -----------------------------------------------------------------------------
//  Colours. Built with renderer.color() so they become valid ARGB ints — never
//  write raw 0xAARRGGBB literals, JS doubles above 2^31 truncate wrong.
//
//  A theme is a full colour set the whole renderer reads through the module-level
//  `theme`. Each theme spec supplies the signature colours (bg, wall, pellet,
//  accent, ghostColors); mk() fills the rest — shifting a couple toward the
//  palette and keeping the fright/eye colours near-universal — and any spec key
//  may override a derived default. 10 base themes ship unlocked; 4 more carry a
//  `locked` flag and open via meta progression in a later task.
// -----------------------------------------------------------------------------
function clamp8(v) {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function shade(rgb, f) {
    return [clamp8(rgb[0] * f), clamp8(rgb[1] * f), clamp8(rgb[2] * f)];
}

function mk(spec) {
    const col = (a) => renderer.color(a[0], a[1], a[2]);
    return {
        bg: col(spec.bg),
        panel: col(spec.panel || shade(spec.bg, 2.0)),
        wall: col(spec.wall),
        wallEdge: col(spec.wallEdge || shade(spec.wall, 1.5)),
        pellet: col(spec.pellet),
        power: col(spec.power || spec.accent),
        chomp: col(spec.chomp || spec.accent),
        text: col(spec.text || [244, 244, 250]),
        dim: col(spec.dim || [150, 150, 170]),
        accent: col(spec.accent),
        fright: col(spec.fright || [36, 60, 210]),
        frightFlash: col(spec.frightFlash || [232, 232, 248]),
        frightFace: col(spec.frightFace || [245, 230, 130]),
        eyeWhite: col(spec.eyeWhite || [248, 248, 255]),
        pupil: col(spec.pupil || [28, 28, 64]),
        danger: col(spec.danger || [255, 96, 96]),
        win: col(spec.win || [120, 235, 150]),
        ghostColors: spec.ghostColors.map(col),
    };
}

const THEME_SPECS = [
    {
        id: "classic",
        name: "Classic",
        bg: [6, 6, 16],
        panel: [12, 12, 26],
        wall: [33, 64, 214],
        wallEdge: [86, 120, 255],
        pellet: [255, 213, 168],
        power: [255, 234, 130],
        chomp: [255, 222, 51],
        accent: [255, 222, 51],
        ghostColors: [[255, 70, 70], [255, 173, 205], [80, 220, 235], [255, 176, 76]],
    },
    {
        id: "neon",
        name: "Neon",
        bg: [8, 4, 20],
        wall: [190, 40, 255],
        pellet: [120, 255, 220],
        accent: [57, 255, 20],
        chomp: [57, 255, 20],
        ghostColors: [[255, 40, 200], [160, 255, 60], [60, 240, 255], [255, 240, 60]],
    },
    {
        id: "inferno",
        name: "Inferno",
        bg: [20, 4, 2],
        wall: [214, 64, 20],
        pellet: [255, 180, 120],
        accent: [255, 120, 40],
        chomp: [255, 200, 90],
        ghostColors: [[255, 80, 40], [255, 140, 50], [220, 40, 20], [255, 190, 90]],
    },
    {
        id: "glacier",
        name: "Glacier",
        bg: [4, 10, 22],
        wall: [60, 140, 220],
        pellet: [200, 235, 255],
        accent: [140, 220, 255],
        chomp: [200, 240, 255],
        ghostColors: [[120, 200, 255], [200, 235, 255], [80, 150, 230], [150, 220, 250]],
    },
    {
        id: "toxic",
        name: "Toxic",
        bg: [6, 14, 4],
        wall: [60, 180, 40],
        pellet: [210, 255, 140],
        accent: [170, 255, 60],
        chomp: [200, 255, 90],
        ghostColors: [[120, 230, 60], [180, 255, 80], [80, 200, 50], [220, 255, 120]],
    },
    {
        id: "vaporwave",
        name: "Vaporwave",
        bg: [16, 6, 24],
        wall: [255, 110, 199],
        pellet: [160, 220, 255],
        accent: [255, 180, 240],
        chomp: [120, 240, 240],
        ghostColors: [[255, 120, 200], [120, 230, 230], [255, 160, 240], [140, 200, 255]],
    },
    {
        id: "midnight",
        name: "Midnight",
        bg: [2, 2, 8],
        wall: [40, 40, 90],
        pellet: [180, 180, 220],
        accent: [120, 120, 255],
        chomp: [170, 170, 245],
        ghostColors: [[120, 110, 200], [150, 140, 220], [90, 80, 170], [170, 160, 235]],
    },
    {
        id: "matrix",
        name: "Matrix",
        bg: [0, 8, 0],
        wall: [0, 140, 60],
        pellet: [120, 255, 120],
        accent: [0, 255, 90],
        chomp: [120, 255, 150],
        ghostColors: [[0, 200, 80], [60, 255, 120], [0, 150, 60], [120, 255, 150]],
    },
    {
        id: "sunset",
        name: "Sunset",
        bg: [18, 8, 14],
        wall: [230, 120, 60],
        pellet: [255, 220, 160],
        accent: [255, 170, 90],
        chomp: [255, 210, 120],
        ghostColors: [[255, 150, 80], [200, 110, 200], [255, 190, 110], [230, 130, 160]],
    },
    {
        id: "bloodmoon",
        name: "Blood Moon",
        bg: [14, 2, 4],
        wall: [160, 20, 30],
        pellet: [255, 160, 160],
        accent: [255, 60, 70],
        chomp: [255, 120, 120],
        danger: [255, 120, 120],
        ghostColors: [[200, 40, 50], [160, 20, 30], [230, 70, 80], [120, 10, 20]],
    },
    {
        id: "aurora",
        name: "Aurora",
        locked: true,
        bg: [4, 10, 18],
        wall: [40, 180, 140],
        pellet: [200, 255, 240],
        accent: [120, 255, 200],
        chomp: [160, 255, 220],
        ghostColors: [[80, 255, 180], [120, 200, 255], [200, 120, 255], [160, 255, 220]],
    },
    {
        id: "sandstorm",
        name: "Sandstorm",
        locked: true,
        bg: [24, 18, 8],
        wall: [200, 160, 80],
        pellet: [255, 240, 200],
        accent: [255, 210, 120],
        chomp: [255, 225, 150],
        ghostColors: [[230, 180, 90], [255, 210, 120], [200, 150, 70], [240, 200, 110]],
    },
    {
        id: "deepsea",
        name: "Deep Sea",
        locked: true,
        bg: [2, 8, 16],
        wall: [20, 90, 140],
        pellet: [160, 230, 255],
        accent: [80, 200, 230],
        chomp: [130, 220, 250],
        ghostColors: [[40, 160, 200], [80, 220, 230], [30, 120, 180], [120, 230, 240]],
    },
    {
        id: "mono",
        name: "Monochrome",
        locked: true,
        bg: [8, 8, 10],
        wall: [90, 90, 100],
        pellet: [230, 230, 235],
        accent: [200, 200, 210],
        chomp: [235, 235, 240],
        ghostColors: [[180, 180, 190], [140, 140, 150], [210, 210, 220], [110, 110, 120]],
    },
];

const THEMES = THEME_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    locked: !!s.locked,
    colors: mk(s),
}));

// Active theme + a shuffle-bag over the unlocked themes: no repeat until the bag
// empties, then it refills and reshuffles.
let theme = THEMES[0].colors;
let themeName = THEMES[0].name;
let themeBag = [];

function refillThemeBag() {
    themeBag = THEMES.filter((t) => !t.locked);
    for (let i = themeBag.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const tmp = themeBag[i];
        themeBag[i] = themeBag[j];
        themeBag[j] = tmp;
    }
}

function pickTheme() {
    if (themeBag.length === 0) refillThemeBag();
    const t = themeBag.pop();
    theme = t.colors;
    themeName = t.name;
}

// -----------------------------------------------------------------------------
//  Maze. `grid` holds tile codes: '#' wall, '.' pellet, 'o' power pellet,
//  ' ' empty. `tunnelRows` is the set of rows whose left/right edges wrap.
// -----------------------------------------------------------------------------
let grid;
let pelletsLeft;
let tunnelRows = new Set([MID_ROW]);

// Deterministic PRNG so the harness can replay any failing maze from its seed.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Random symmetric maze. Sets module-level grid/pelletsLeft/tunnelRows and
// returns a descriptor; falls back to the v1 pillar lattice after 8 failed
// attempts. opts (all optional): { mirror, extraPower, knockRate } — later tasks
// vary these (difficulty knock rate, the funhouse mirror:false mutator, perk
// power pellets); the round caller passes difficulty(round).knockRate, and a
// bare generateMaze(round, rng) defaults knockRate to difficulty(round).knockRate.
function generateMaze(round, rng, opts) {
    opts = opts || {};
    const mirror = opts.mirror !== undefined ? opts.mirror : true;
    const knockRate = opts.knockRate !== undefined ? opts.knockRate : difficulty(round).knockRate;
    const extraPower = opts.extraPower || 0;

    for (let attempt = 0; attempt < 8; attempt++) {
        const result = carveMaze(round, rng, mirror, knockRate, extraPower);
        if (result) return result;
    }
    return fallbackMaze();
}

// One maze attempt. Returns a descriptor on success, null if it fails validation
// (an unreachable open cell or fewer than 60 pellets) so generateMaze can retry.
function carveMaze(round, rng, mirror, knockRate, extraPower) {
    const maxCol = mirror ? HALF - 1 : COLS - 2;

    // 1. Start all-wall, then carve a recursive backtracker over odd/odd cells.
    const g = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) row.push("#");
        g.push(row);
    }

    g[1][1] = " ";
    const stack = [[1, 1]];
    const steps = [[2, 0], [-2, 0], [0, 2], [0, -2]];
    while (stack.length) {
        const cur = stack[stack.length - 1];
        const c = cur[0];
        const r = cur[1];
        const neighbors = [];
        for (const s of steps) {
            const nc = c + s[0];
            const nr = r + s[1];
            if (nc >= 1 && nc <= maxCol && nr >= 1 && nr <= ROWS - 2 && g[nr][nc] === "#") neighbors.push(s);
        }
        if (neighbors.length === 0) {
            stack.pop();
            continue;
        }
        const s = neighbors[(rng() * neighbors.length) | 0];
        g[r + s[1] / 2][c + s[0] / 2] = " "; // knock the wall between
        g[r + s[1]][c + s[0]] = " ";
        stack.push([c + s[0], r + s[1]]);
    }

    // 2. Loop-knock: braid the tree by removing a fraction of the interior walls
    //    whose removal joins two already-open cells.
    const walls = [];
    for (let r = 1; r <= ROWS - 2; r++) {
        for (let c = 1; c <= maxCol; c++) {
            if (g[r][c] !== "#") continue;
            const openLR = g[r][c - 1] !== "#" && g[r][c + 1] !== "#";
            const openUD = g[r - 1][c] !== "#" && g[r + 1][c] !== "#";
            if (openLR || openUD) walls.push([c, r]);
        }
    }
    let knock = Math.floor(walls.length * knockRate);
    while (knock-- > 0 && walls.length) {
        const w = walls.splice((rng() * walls.length) | 0, 1)[0];
        g[w[1]][w[0]] = " ";
    }

    // 3. Mirror the carved half about the centre column.
    if (mirror) {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < CENTER_COL; c++) g[r][COLS - 1 - c] = g[r][c];
        }
    }

    grid = g;
    tunnelRows = new Set();

    // 4. Stamp constants: border ring, ghost pen, start cell, wrap tunnels.
    for (let c = 0; c < COLS; c++) {
        g[0][c] = "#";
        g[ROWS - 1][c] = "#";
    }
    for (let r = 0; r < ROWS; r++) {
        g[r][0] = "#";
        g[r][COLS - 1] = "#";
    }
    for (let r = HOME.r - 1; r <= HOME.r + 1; r++) {
        for (let c = HOME.c - 1; c <= HOME.c + 1; c++) g[r][c] = " ";
    }
    g[ROWS - 3][CENTER_COL] = " ";

    const tunnelCount = round >= 5 ? (rng() < 0.5 ? 2 : 1) : 1;
    const candidates = [];
    for (let r = 1; r <= ROWS - 2; r += 2) {
        if (r >= HOME.r - 1 && r <= HOME.r + 1) continue; // keep tunnels out of the pen
        candidates.push(r);
    }
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const tmp = candidates[i];
        candidates[i] = candidates[j];
        candidates[j] = tmp;
    }
    for (const r of candidates.slice(0, Math.min(tunnelCount, candidates.length))) {
        tunnelRows.add(r);
        g[r][0] = " ";
        g[r][1] = " ";
        g[r][COLS - 2] = " ";
        g[r][COLS - 1] = " ";
    }

    // 5. Pellets on every open cell outside the pen and start; power pellets at
    //    the four near-corners plus any granted by perks (extraPower, Task 7).
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            if (g[r][c] !== " ") continue;
            const inPen = c >= HOME.c - 1 && c <= HOME.c + 1 && r >= HOME.r - 1 && r <= HOME.r + 1;
            const isStart = c === CENTER_COL && r === ROWS - 3;
            if (!inPen && !isStart) g[r][c] = ".";
        }
    }

    const powerCells = [
        { c: 1, r: 1 },
        { c: COLS - 2, r: 1 },
        { c: 1, r: ROWS - 2 },
        { c: COLS - 2, r: ROWS - 2 },
    ];
    if (extraPower > 0) {
        const open = [];
        for (let r = 1; r < ROWS - 1; r++) {
            for (let c = 1; c < COLS - 1; c++) if (g[r][c] === ".") open.push({ c, r });
        }
        for (let i = open.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const tmp = open[i];
            open[i] = open[j];
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
        if (g[p.r][p.c] !== "#") g[p.r][p.c] = "o";
    }

    pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) if (g[r][c] === "." || g[r][c] === "o") pelletsLeft++;
    }

    // 6. Validate: flood fill from the start honouring tunnel wrap.
    if (pelletsLeft < 60) return null;
    if (!isFullyConnected()) return null;

    return { ok: true, grid: g, pellets: pelletsLeft, tunnelRows, powerCells };
}

// The v1.0 pillar lattice: a wall ring with isolated single-tile pillars on
// even/even interior cells (a pillar can never disconnect a corridor). Kept as
// the guaranteed-valid fallback when generation cannot produce a good maze.
function fallbackMaze() {
    const g = [];
    for (let r = 0; r < ROWS; r++) {
        const row = [];
        for (let c = 0; c < COLS; c++) {
            const border = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
            const pillar = r % 2 === 0 && c % 2 === 0;
            row.push(border || pillar ? "#" : ".");
        }
        g.push(row);
    }
    grid = g;
    tunnelRows = new Set([MID_ROW]);

    for (let r = HOME.r - 1; r <= HOME.r + 1; r++) {
        for (let c = HOME.c - 1; c <= HOME.c + 1; c++) g[r][c] = " ";
    }
    g[MID_ROW][0] = " ";
    g[MID_ROW][COLS - 1] = " ";
    g[MID_ROW][1] = " ";
    g[MID_ROW][COLS - 2] = " ";
    g[ROWS - 3][CENTER_COL] = " ";

    const powerCells = [
        { c: 1, r: 1 },
        { c: COLS - 2, r: 1 },
        { c: 1, r: ROWS - 2 },
        { c: COLS - 2, r: ROWS - 2 },
    ];
    for (const p of powerCells) {
        if (g[p.r][p.c] !== "#") g[p.r][p.c] = "o";
    }

    pelletsLeft = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) if (g[r][c] === "." || g[r][c] === "o") pelletsLeft++;
    }

    return { ok: false, grid: g, pellets: pelletsLeft, tunnelRows, powerCells };
}

// Flood fill from the start cell over the module grid, wrapping at tunnel rows.
// Returns true only if every open cell is reachable.
function isFullyConnected() {
    let total = 0;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) if (grid[r][c] !== "#") total++;
    }
    const seen = new Set();
    const stack = [[CENTER_COL, ROWS - 3]];
    while (stack.length) {
        const cell = stack.pop();
        const c = cell[0];
        const r = cell[1];
        const key = r * COLS + c;
        if (seen.has(key) || isWall(c, r)) continue;
        seen.add(key);
        for (const k of ["up", "down", "left", "right"]) {
            const d = DIRS[k];
            let nc = c + d.x;
            const nr = r + d.y;
            if (nr < 0 || nr >= ROWS) continue;
            if (nc < 0) nc = COLS - 1;
            else if (nc >= COLS) nc = 0;
            if (!isWall(nc, nr) && !seen.has(nr * COLS + nc)) stack.push([nc, nr]);
        }
    }
    return seen.size === total;
}

function isWall(c, r) {
    if (r < 0 || r >= ROWS) return true;
    // Off-grid columns are open only on tunnel rows (which wrap around).
    if (c < 0 || c >= COLS) return !tunnelRows.has(r);
    return grid[r][c] === "#";
}

// -----------------------------------------------------------------------------
//  Directions.
// -----------------------------------------------------------------------------
const DIRS = {
    none: { x: 0, y: 0 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
};

function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0);
}

function canStep(c, r, dir) {
    if (dir.x === 0 && dir.y === 0) return false;
    return !isWall(c + dir.x, r + dir.y);
}

// A phasing ghost ("phase" event) ignores walls but stays inside the interior
// ring and out of the pen — so it cannot leave the board or hide in the cage.
function canStepPhase(c, r, dir) {
    if (dir.x === 0 && dir.y === 0) return false;
    const nc = c + dir.x;
    const nr = r + dir.y;
    if (nc < 1 || nc >= COLS - 1 || nr < 1 || nr >= ROWS - 1) return false;
    return !inPen(nc, nr);
}

// Which stepping rule an entity obeys this frame: walls, or the phase override.
function stepFor(e, c, r, dir) {
    return e && e.phasing ? canStepPhase(c, r, dir) : canStep(c, r, dir);
}

// -----------------------------------------------------------------------------
//  Difficulty curve. The SINGLE source of every per-round scaling number: the
//  two speeds, fright duration, ghost mistake rate, the scatter/chase split, eye
//  speed and the maze knock rate. Nothing else in the file hard-codes these — all
//  callers read them through difficulty(round), so tuning the game means editing
//  this one function. Pure: same round in, same table out.
//
//    n    = steps since round 1 (round is 1-based)
//    over = extra ramp that only kicks in past round 12, capping the linear climb
// -----------------------------------------------------------------------------
function difficulty(round) {
    const n = round - 1;
    const over = Math.max(0, round - 12);
    return {
        ghostSpeed: 5.0 * Math.min(1.5 + 0.01 * over, 1 + 0.04 * n),
        chompSpeed: 5.6 * Math.min(1.15 + 0.005 * over, 1 + 0.015 * n),
        frightTime: Math.max(0, 6.5 - 0.9 * n),
        mistakeRate: Math.max(0, 0.2 - 0.04 * n),
        scatterTime: Math.max(0, 7 - 1.2 * n),
        chaseTime: 20,
        eyesSpeed: Math.min(12, 9 + 0.3 * n),
        knockRate: Math.max(0.05, 0.15 - 0.008 * n),
    };
}

// -----------------------------------------------------------------------------
//  Ghost events + Chomp pickups. Both tables are PURE DATA — no per-entry
//  callbacks. The engine reads `id` and branches; adding an entry never adds a
//  code path here, only in the one place that interprets its id. `time: 0`
//  entries are one-shots (armed flags), not timed durations.
// -----------------------------------------------------------------------------
const EVENTS = [
    { id: "rush", name: "RUSH!", hostile: true, time: 6 }, // ghosts x1.3 speed while active
    { id: "phase", name: "PHANTOM!", hostile: true, time: 3 }, // one random ghost ignores walls (in bounds, not the pen)
    { id: "revive", name: "NO REST!", hostile: true, time: 10 }, // eaten ghosts respawn at the pen instantly
    { id: "frenzy", name: "FRENZY!", hostile: true, time: 0 }, // one-shot: next power pellet scores, no fright
    { id: "blind", name: "LIGHTS OUT!", hostile: false, time: 4 }, // ghosts random-walk while active
    { id: "chill", name: "COLD SNAP!", hostile: false, time: 0 }, // one-shot: next power pellet also freezes ghosts 2 s
];

const PICKUPS = {
    good: [
        { id: "speed", name: "SPEED!", time: 6 }, // chomp x1.25
        { id: "shield", name: "SHIELD!", time: 0 }, // +1 shield charge (absorbs one hit, max 2)
        { id: "double", name: "DOUBLE!", time: 10 }, // scoreMult x2
        { id: "magnet", name: "MAGNET!", time: 8 }, // eat pellets within radius 2
        { id: "freeze", name: "FREEZE!", time: 3 }, // ghosts halt
    ],
    bad: [
        { id: "sticky", name: "STICKY FLOOR!", time: 4 }, // chomp x0.6
        { id: "reversed", name: "DIZZY!", time: 3, minRound: 8 }, // controls inverted (late rounds only)
    ],
};

// -----------------------------------------------------------------------------
//  Roguelite core (Task 7). Every perk mutates exactly ONE named knob so the
//  round's numbers are a pure fold: applyPerks() seeds a knob object from
//  difficulty(round) + baselines and applies each picked stack's mod(). The
//  engine reads ONLY that folded object — no perk-id branching scattered through
//  the loop — except the handful of genuinely stateful perks (secondWind,
//  headStart, vampire, bulldozer) whose reads stay centralised and few.
//
//  Six perks carry `locked: true` and never enter a draft this task; Task 8's
//  meta layer unlocks them. Stacking a perk = its mod applied once per stack.
// -----------------------------------------------------------------------------
const PERKS = [
    { id: "fleet",    name: "Fleet Feet",     desc: "Move 6% faster.",                     mod: (m) => (m.chompSpeed *= 1.06) },
    { id: "fright+",  name: "Long Dread",     desc: "Fright lasts 2s longer.",             mod: (m) => (m.frightTime += 2) },
    { id: "shield",   name: "Bubble",         desc: "Start each round with a shield.",     mod: (m) => (m.roundShield += 1) },
    { id: "magnet+",  name: "Crumb Magnet",   desc: "Pull pellets from further away.",     mod: (m) => (m.magnetRadius += 1) },
    { id: "combo+",   name: "Greed",          desc: "All score +25%.",                     mod: (m) => (m.scoreMult += 0.25) },
    { id: "pellet+",  name: "Fat Pellets",    desc: "Pellets worth +5.",                   mod: (m) => (m.pelletValue += 5) },
    { id: "chain+",   name: "Ghost Gourmet",  desc: "Ghost chains worth 50% more.",        mod: (m) => (m.chainMult *= 1.5) },
    { id: "life",     name: "Spare Heart",    desc: "One more life, right now.",           mod: (m) => (m.bonusLife += 1) },
    { id: "tunnel",   name: "Wind Tunnel",    desc: "Tunnels launch you 40% faster.",      mod: (m) => (m.tunnelBoost = 1.4) },
    { id: "grace",    name: "Drift King",     desc: "Corner earlier.",                     mod: (m) => (m.cornerGrace += 0.08) },
    { id: "fruity",   name: "Ripe Luck",      desc: "Fruit lingers 50% longer.",           mod: (m) => (m.fruitLife *= 1.5) },
    { id: "wind",     name: "Second Wind",    desc: "Cheat death once per run.",           mod: (m) => (m.secondWind = true) },
    { id: "sloweyes", name: "Tired Eyes",     desc: "Eaten ghosts crawl home.",            mod: (m) => (m.eyesSpeed *= 0.75) },
    { id: "scatter+", name: "Stage Fright",   desc: "Scatter lasts 2s longer.",            mod: (m) => (m.scatterTime += 2) },
    { id: "power+",   name: "Spice Rack",     desc: "+2 power pellets per maze.",          mod: (m) => (m.extraPower += 2) },
    { id: "luck",     name: "Loaded Dice",    desc: "Crates roll good 75% of the time.",   mod: (m) => (m.crateLuck = 0.75) },
    { id: "slowrun",  name: "Lead Boots",     desc: "The runner tires quicker.",           mod: (m) => (m.runnerSpeed *= 0.7) },
    { id: "tax",      name: "Ghost Tax",      desc: "+100 per ghost eaten.",               mod: (m) => (m.ghostFlat += 100) },
    { id: "start",    name: "Head Start",     desc: "Rounds open with ghosts frozen 3s.",  mod: (m) => (m.headStart = 3), locked: true },
    { id: "vamp",     name: "Pellet Vampire", desc: "Every 50 pellets: +1s fright.",       mod: (m) => (m.vampire = true), locked: true },
    { id: "toll",     name: "Toll Booth",     desc: "+50 score per tunnel pass.",          mod: (m) => (m.tunnelToll += 50), locked: true },
    { id: "dozer",    name: "Bulldozer",      desc: "Once per round, chew through a wall.",mod: (m) => (m.bulldozer += 1), locked: true },
    { id: "lucky",    name: "Lucky Draft",    desc: "Drafts offer 4 choices.",             mod: (m) => (m.draftSize = 4), locked: true },
    { id: "bank",     name: "Crumb Bank",     desc: "Round clear: +5% score bonus.",       mod: (m) => (m.bankRate += 0.05), locked: true },
];

// A cursed draft slot pairs its perk (applied TWICE) with one of these, applied
// once. Pure data — the fold treats a curse exactly like a perk mod.
const CURSES = [
    { id: "haste",  desc: "…but ghosts gain a speed tier.", mod: (m) => (m.ghostSpeed *= 1.08) },
    { id: "dim",    desc: "…but fright is halved.",         mod: (m) => (m.frightTime *= 0.5) },
    { id: "elite",  desc: "…but an extra elite spawns.",    mod: (m) => (m.extraElite += 1) },
    { id: "stingy", desc: "…but pellets are worth half.",   mod: (m) => (m.pelletValue = Math.max(1, m.pelletValue * 0.5)) },
];

// Elite affixes (round >= 5). Assigned per round to distinct random ghosts; the
// aura ring under the ghost is drawn in `tint`. Behaviours live in the engine
// loop, keyed off `g.affix` — one branch each, no table callbacks.
const ELITES = [
    { id: "swift",    name: "Swift",    tint: [255, 255, 255] }, // ×1.2 speed
    { id: "phasing",  name: "Phasing",  tint: [180, 120, 255] }, // every 7s: 1.5s wall-clip
    { id: "tank",     name: "Tank",     tint: [120, 200, 255] }, // needs 2 eats in one fright
    { id: "vengeful", name: "Vengeful", tint: [255, 120, 40] },  // +4% speed each ghost eaten (this round)
    { id: "splitter", name: "Splitter", tint: [120, 255, 120] }, // eaten → two 60%-speed minis, 150 pts each
];

// Round mutators (round >= 3, one roll, 40% none). The name suffixes the round
// banner ("ROUND 7 — INFERNO · FOG"). Knob-shaped effects (goldrush, rushhour)
// fold through applyPerks; the rest are read where they act (maze/ghosts/render).
const MUTATORS = [
    { id: "fog",      name: "FOG" },       // per-tile dim past radius from Chomp: alpha = clamp((dist - 4.5) / 2, 0, 0.95)
    { id: "greedy",   name: "GOLD RUSH" }, // pellets ×2 value, ghosts ×1.1 speed
    { id: "dark",     name: "BLACKOUT" },  // board darkened except pellets/power, which glow
    { id: "swarm",    name: "SWARM" },     // 5th ghost, Blinky targeting, spawns in pen
    { id: "mirror",   name: "FUNHOUSE" },  // skip the mirror step: asymmetric maze
    { id: "rushhour", name: "RUSH HOUR" }, // scatterTime = 0 this round
];

// The 3x3 ghost pen around HOME — spawners, pads and phasing ghosts all avoid it.
function inPen(c, r) {
    return c >= HOME.c - 1 && c <= HOME.c + 1 && r >= HOME.r - 1 && r <= HOME.r + 1;
}

// -----------------------------------------------------------------------------
//  Player-facing copy (Task 9). Every string a surface can show lives HERE, in
//  one table the audit reads top to bottom — arcade-punchy, no filler. The few
//  exclamation marks are the genre's own convention (READY!, combo pops); event
//  and pickup banner labels stay in their own data tables (EVENTS / PICKUPS),
//  reached by variable, never as a literal in a draw path. Entries that need a
//  value are tiny formatters, so the fold stays a lookup, not scattered concat.
// -----------------------------------------------------------------------------
const TEXT = {
    title: "CHOMP",
    ready: "READY!",
    paused: "PAUSED",
    secondWind: "SECOND WIND!",
    deaths: ["OOF.", "CAUGHT.", "SQUISHED."], // rotate one per lost life

    // Shared control hint, reused by the palette placeholder, the module
    // description, and the enable toast so the three never drift apart.
    controls: "Arrows/WASD move · P pause · R restart · Space start",

    scorePrefix: "SCORE ",
    shieldChip: (n) => "SHIELD ×" + n,

    // "ROUND 7 — INFERNO" (+ mutator: "ROUND 7 — INFERNO · FOG").
    roundBanner: (round, themeUpper, mutName) => "ROUND " + round + " — " + themeUpper + (mutName ? " · " + mutName : ""),

    draftTitle: "ROUND CLEAR — CHOOSE A PERK",
    cursed: "CURSED",
    crateMark: "?",
    draftHint: "← → select · enter confirm",

    highScores: "HIGH SCORES",
    noScores: "NO SCORES YET",
    runsLine: (runs, best) => runs + (runs === 1 ? " run" : " runs") + " · best round " + best,
    themesLine: (open, total) => open + " / " + total + " themes unlocked",
    sessionOnly: "this session only",
    startPrompt: "press a direction to start",

    newHigh: "NEW HIGH SCORE",
    runOver: (round) => "RUN OVER — ROUND " + round,
    crumbs: (n) => "+" + n + " crumbs",
    unlocked: (label) => "unlocked " + label,
    noBoard: "no scores recorded",
    scoreRow: (rank, s, r) => rank + ".   " + s + "   ·  R" + r,
    playAgain: "enter to play again",
    restartConfirm: "again? R to confirm",

    // Juice pops.
    combo: (n) => "×" + n + "!",
    gain: (n) => "+" + n,

    // Toasts (lower-case, they sit next to the app name).
    toastHigh: "new high score",
    toastTop: "top 10",
    toastUnlock: (label) => "unlocked " + label,
};

// -----------------------------------------------------------------------------
//  Persistence (Task 8). ONE feature-detected wrapper is the only code that ever
//  touches the `storage` global — everything else reads/writes through loadJson /
//  saveJson. `storage` may be absent on older builds; then store is null and the
//  game runs in a session-only mode (nothing persists, nothing throws).
// -----------------------------------------------------------------------------
const store = typeof storage !== "undefined" ? storage : null;

function loadJson(key, fallback) {
    if (!store) return fallback;
    try {
        const raw = store.get(key);
        return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
        return fallback;
    }
}

function saveJson(key, value) {
    if (!store) return;
    try {
        store.set(key, JSON.stringify(value));
    } catch (e) {
        /* caps or IO — the run continues, persistence is best-effort */
    }
}

// The two persisted documents, normalised so a partial/old blob (or a fresh
// install) always yields every field with a sane numeric default — no undefined
// or NaN ever reaches the unlock/knob paths.
function loadMeta() {
    const m = loadJson("chomp.meta", {});
    // Coerce every numeric field with Number(x) || 0: a partial/old blob may hold a
    // string (or nothing), and a bare `|| 0` would leave "200" a string that later
    // string-concats into the crumb fold. Number() forces a clean numeric default.
    return {
        pellets: Number(m.pellets) || 0,
        ghosts: Number(m.ghosts) || 0,
        runs: Number(m.runs) || 0,
        bestRound: Number(m.bestRound) || 0,
        crumbs: Number(m.crumbs) || 0,
        unlocked: Array.isArray(m.unlocked) ? m.unlocked.slice() : [],
    };
}

function loadHighscores() {
    const h = loadJson("chomp.highscores", {});
    const entries = Array.isArray(h.entries) ? h.entries.filter((e) => e && typeof e.s === "number") : [];
    return { entries };
}

// Meta progression: crumbs are LIFETIME-cumulative (never spent); each threshold
// is checked against the running total, so every run visibly makes progress.
const UNLOCKS = [
    { cost: 50,  kind: "perk",    id: "start" },
    { cost: 80,  kind: "theme",   id: "aurora" },
    { cost: 120, kind: "perk",    id: "vamp" },
    { cost: 180, kind: "theme",   id: "sandstorm" },
    { cost: 220, kind: "perk",    id: "toll" },
    { cost: 300, kind: "theme",   id: "deepsea" },
    { cost: 350, kind: "perk",    id: "dozer" },
    { cost: 450, kind: "theme",   id: "mono" },
    { cost: 520, kind: "perk",    id: "lucky" },
    { cost: 600, kind: "feature", id: "startdraft" }, // pick 1 of 3 perks at run start
    { cost: 750, kind: "perk",    id: "bank" },
];

// Reconcile the PERKS / THEMES `locked` flags against what meta.unlocked owns —
// the SINGLE source of truth for lock state. Idempotent and resettable: a fresh
// meta re-locks everything, an owned id opens it. The draft pool + theme bag then
// pick the change up naturally (they already filter on `locked`) — no forked pool.
function syncUnlocks(meta) {
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
function unlockLabel(u) {
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
function notify(msg) {
    if (typeof notification !== "undefined" && notification && notification.success) {
        try {
            notification.success("Chomp", msg);
        } catch (e) {
            /* toasts are cosmetic */
        }
    }
}

// -----------------------------------------------------------------------------
//  The game engine. Pure logic + a renderer that draws into any rectangle.
// -----------------------------------------------------------------------------
function createGame() {
    // Only the paces the difficulty curve does NOT own live as constants here.
    const FRIGHT_SPEED = 3.2; // frightened ghosts always crawl at this fixed pace
    const READY_TIME = 1.6; // "READY!" / round-banner dwell before play
    const DRAFT_TIME = 8.0; // draft dwell: auto-picks the highlighted card if nobody confirms

    // Spawner cadences + lifetimes, event/banner timing, pad + magnet knobs. All
    // the Task-6 numbers the difficulty curve does not own live here as constants.
    const FRUIT_EVERY = 18, FRUIT_LIFE = 9;
    const CRATE_EVERY = 25, CRATE_LIFE = 12;
    const RUNNER_EVERY = 45, RUNNER_LIFE = 15, RUNNER_ROUND = 4, RUNNER_SPEED = 0.85;
    const EVENT_MIN = 20, EVENT_SPAN = 10, EVENT_ROUND = 2;
    const PADS_ROUND = 6, PAD_COOLDOWN = 0.5;
    const BANNER_TIME = 1.8; // per-banner dwell; queued one-at-a-time, never stacked
    const MAGNET_RADIUS = 2, CHILL_FREEZE = 2;

    // ---- Task 9: juice + controls tuning ----
    // One lightweight vfx system (game.vfx) holds every transient — shakes, pellet
    // pops, floating score, combo pops, the round intro. Bounded by VFX_CAP so the
    // array can never run away (the final harness gate asserts it stays well < 200).
    const VFX_CAP = 140;
    const SHAKE_DEATH = { amp: 4, ttl: 0.4 }; // brief, per the spec
    const SHAKE_EAT = { amp: 2, ttl: 0.15 };
    const POP_TIME = 0.25, FLOAT_TIME = 0.6, COMBO_TIME = 0.9, INTRO_TIME = 0.4;
    const FRIGHT_FLASH = 1.5; // border flashes over the last 1.5 s of a fright
    const HEART_TILES = 3; // heartbeat edge pulse when a hunter is within 3 tiles
    const RESTART_CONFIRM = 2.0; // R opens a 2 s window; a second R restarts the run

    const game = {
        state: "ready", // ready | playing | dying | draft | over | paused
        round: 1,
        score: 0,
        lives: 3,
        timer: READY_TIME,
        frightTimer: 0,
        eatChain: 0,
        anim: 0, // global animation clock
        modePhase: "scatter", // scatter | chase — the global clock ghosts follow
        modeTimer: 0,
        ambusherId: -1, // which non-Blinky ghost ambushes this round (-1 = none)
        pelletsTotal: 0, // pellets at round start, for Cruise Elroy thresholds
        seedBase: 0, // per-run maze seed base; each round offsets it deterministically
        banner: null, // "ROUND N — THEME" shown during the new round's READY dwell
        chomp: null,
        ghosts: [],

        // ---- Task 6: events, effects, spawns, interactables ----
        fx: mulberry32(1), // dedicated PRNG for spawns/events — kept OFF Math.random
        //                    so ghost-AI randomness (and the harness) is untouched
        event: null, // { id, timeLeft } — at most one timed ghost event at a time
        eventTimer: 0, // countdown to the next event roll (round >= 2)
        eventsFired: 0, // lifetime count, for the harness
        frenzyArmed: false, // one-shot, consumed by the next triggerFright()
        chillArmed: false, // one-shot, consumed by the next triggerFright()
        phaseGhost: -1, // which ghost id phases during a "phase" event
        effects: [], // active Chomp effects: [{ id, timeLeft }] — Task 7 perks stack here
        shield: 0, // absorbed-hit charges, max 2
        speedMult: 1, // derived from effects each frame (Task 7 multiplies onto it)
        scoreMult: 1, // derived from effects each frame (× the folded scoreMult knob)

        // ---- Task 7: roguelite core ----
        perks: {}, // picked perk id -> stack count (a cursed pick adds 2)
        curses: {}, // picked curse id -> count (from cursed draft slots)
        knobs: null, // this round's folded numbers; applyPerks() is the single writer
        mutator: null, // this round's active mutator id, or null
        draft: null, // { cards, sel } while game.state === "draft"
        bonusLifeGranted: 0, // lives already handed out by the Spare Heart knob (grant-once)
        pelletsEaten: 0, // lifetime pellets, for the vampire perk
        secondWindUsed: false, // Second Wind cheats death once per run
        ghostsEatenThisRound: 0, // fuels the vengeful affix; reset each round
        roundElites: [], // [{ id, affix }] assigned this round — reapplied verbatim after a death
        headStartTimer: 0, // seconds the field stays frozen at a round's open

        spawns: [], // fruit / crate / runner entities on the board
        fruitTimer: 0,
        crateTimer: 0,
        runnerTimer: 0,
        pads: null, // [{c,r},{c,r}] linked teleport pair, or null (round < 6)
        banners: [], // FIFO of { text, color, timeLeft }; only banners[0] renders

        // ---- Task 8: persistence ----
        meta: null, // loaded chomp.meta this run (fold target at run end)
        highscores: null, // loaded chomp.highscores this run
        started: false, // false until the first direction press leaves the start screen
        recorded: false, // guards the run-end fold so it happens exactly once
        pendingStart: false, // true while the pre-round-1 start draft is open
        startdraftUnlocked: false, // the "startdraft" feature, derived from meta
        ghostsEaten: 0, // ghosts eaten this RUN (folds into meta.ghosts at run end)
        bulldozerCharges: 0, // Bulldozer wall-chews left this round (from knobs.bulldozer)
        lastRun: null, // { earned, rank, madeBoard, newHigh, entry, claimed } for the game-over screen

        // ---- Task 9: juice + controls ----
        vfx: [], // transient juice: { type, t, ttl, ... } — ticked in tickVfx, drawn in the vfx pass
        deathIx: 0, // rotates the death line across a run
        deathLine: "", // the line shown for the current death
        restartConfirm: 0, // seconds left in the R-to-restart confirm window (0 = closed)
    };

    function ghostStarts() {
        return [
            { c: HOME.c, r: HOME.r - 1 },
            { c: HOME.c - 1, r: HOME.r },
            { c: HOME.c, r: HOME.r },
            { c: HOME.c + 1, r: HOME.r },
        ];
    }

    // ---- Perks: the single fold ------------------------------------------------
    // Seed a knob object from difficulty(round) + baselines, then apply every
    // picked perk stack's mod and every curse, then fold the mutator's knob-shaped
    // effects. This is the ONLY writer of game.knobs; the engine reads from it.
    function applyPerks() {
        const d = difficulty(game.round);
        const m = {
            // From the difficulty curve — perks/curses bend these.
            chompSpeed: d.chompSpeed,
            ghostSpeed: d.ghostSpeed,
            frightTime: d.frightTime,
            scatterTime: d.scatterTime,
            chaseTime: d.chaseTime,
            eyesSpeed: d.eyesSpeed,
            // Baseline knobs (brief-exact).
            scoreMult: 1,
            pelletValue: 10,
            chainMult: 1,
            ghostFlat: 0,
            magnetRadius: 0,
            cornerGrace: 0.12,
            crateLuck: 0.5,
            extraPower: 0,
            roundShield: 0,
            bonusLife: 0,
            tunnelBoost: 1,
            tunnelToll: 0,
            fruitLife: FRUIT_LIFE,
            runnerSpeed: RUNNER_SPEED,
            extraElite: 0,
            draftSize: 3,
            bankRate: 0,
            // Stateful perks (locked/centralised) — read in exactly one place each.
            secondWind: false,
            vampire: false,
            headStart: 0,
            bulldozer: 0,
        };
        for (const id in game.perks) {
            const entry = PERKS.find((p) => p.id === id);
            if (!entry) continue;
            for (let k = 0; k < game.perks[id]; k++) entry.mod(m);
        }
        for (const id in game.curses) {
            const entry = CURSES.find((c) => c.id === id);
            if (!entry) continue;
            for (let k = 0; k < game.curses[id]; k++) entry.mod(m);
        }
        applyMutatorKnobs(m);
        game.knobs = m;
        return m;
    }

    // The two mutators whose effect is a number the fold already understands.
    function applyMutatorKnobs(m) {
        if (game.mutator === "greedy") {
            m.pelletValue *= 2;
            m.ghostSpeed *= 1.1;
        } else if (game.mutator === "rushhour") {
            m.scatterTime = 0;
        }
    }

    // Grant the perks that fire once at pick-time rather than every round. Spare
    // Heart adds a life the moment its knob climbs above what we've already paid.
    function grantImmediatePerks() {
        if (game.knobs.bonusLife > game.bonusLifeGranted) {
            game.lives += game.knobs.bonusLife - game.bonusLifeGranted;
            game.bonusLifeGranted = game.knobs.bonusLife;
        }
    }

    // Round-open perk application: hand out the starting shield, arm Head Start,
    // and clear the per-round vengeful counter. Called ONLY on a round open — never
    // on a death respawn: a death mid-round does not reopen the round, so the shield
    // is not re-granted (it survives via clearEphemeral), Head Start does not re-
    // freeze the field, and the vengeful counter carries its "this round" tally.
    function applyRoundStartPerks() {
        if (game.knobs.roundShield > 0) game.shield = Math.min(2, game.shield + game.knobs.roundShield);
        game.headStartTimer = game.knobs.headStart || 0;
        game.ghostsEatenThisRound = 0; // round-scoped: reset here, NOT on a death respawn
        game.bulldozerCharges = game.knobs.bulldozer || 0; // Bulldozer: once-per-round wall chews
    }

    // ---- Mutators + elites -----------------------------------------------------
    // One seeded roll per round from round 3: 40% no mutator, else a uniform pick.
    function rollMutator() {
        game.mutator = null;
        if (game.round < 3) return;
        if (game.fx() < 0.4) return;
        game.mutator = MUTATORS[(game.fx() * MUTATORS.length) | 0].id;
    }

    // Reset every ghost's affix + per-affix state to a clean, un-elite slate.
    function clearAffix(g) {
        g.affix = null;
        g.tankBites = 0;
        g.eatCd = 0;
        g.phaseCd = 0;
        g.phaseClip = 0;
    }

    // From round 5, roll 1 + extraElite distinct random ghosts onto a random affix,
    // seeded off game.fx so the harness can force outcomes. The assignment is
    // RECORDED in game.roundElites so a mid-round death can restore the SAME ghosts
    // to the SAME affixes (reapplyElites) instead of re-rolling. Rolls once a round.
    function assignElites() {
        for (const g of game.ghosts) clearAffix(g);
        game.roundElites = [];
        if (game.round < 5) return;
        const count = Math.min(game.ghosts.length, 1 + game.knobs.extraElite);
        const pool = game.ghosts.slice();
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (game.fx() * (i + 1)) | 0;
            const tmp = pool[i];
            pool[i] = pool[j];
            pool[j] = tmp;
        }
        for (let k = 0; k < count; k++) {
            const g = pool[k];
            g.affix = ELITES[(game.fx() * ELITES.length) | 0].id;
            if (g.affix === "phasing") g.phaseCd = 7;
            game.roundElites.push({ id: g.id, affix: g.affix });
        }
    }

    // After a death rebuilds the ghosts, restore this round's recorded affixes onto
    // the ghosts that still exist (base + swarm ids survive; minis do not persist a
    // death and were never elite). No re-roll — WHICH ghost is elite is fixed for
    // the round.
    function reapplyElites() {
        for (const g of game.ghosts) clearAffix(g);
        for (const rec of game.roundElites) {
            const g = game.ghosts.find((x) => x.id === rec.id);
            if (!g) continue;
            g.affix = rec.affix;
            if (g.affix === "phasing") g.phaseCd = 7;
        }
    }

    // A splitter, when eaten, leaves two 60%-speed minis in its place — worth 150
    // apiece, frightenable, no further splitting. Spawned frightened if a fright
    // is live so they can be cashed in immediately.
    function splitGhost(g) {
        for (let k = 0; k < 2; k++) {
            game.ghosts.push({
                id: 100 + game.ghosts.length,
                px: g.px,
                py: g.py,
                dir: DIRS.up,
                want: DIRS.up,
                mode: game.frightTimer > 0 ? "fright" : game.modePhase,
                color: theme.ghostColors[k % theme.ghostColors.length],
                phasing: false,
                padCd: 0,
                mini: true,
                affix: null,
                tankBites: 0,
                eatCd: 0,
                phaseCd: 0,
                phaseClip: 0,
            });
        }
    }

    // Every ghost eaten this round drives the vengeful affix; a splitter also
    // spawns its minis here.
    function onGhostEaten(g) {
        game.ghostsEatenThisRound++;
        game.ghostsEaten++; // run-lifetime tally for the meta fold at run end
        if (g.affix === "splitter") splitGhost(g);
    }

    // ---- Draft -----------------------------------------------------------------
    // Build the draft: draftSize distinct unlocked perks, each slot a 25% chance
    // cursed. All rolls come off the seeded game.fx stream so the harness replays.
    function buildDraft() {
        const size = Math.max(1, Math.min(4, game.knobs.draftSize | 0));
        const bag = PERKS.filter((p) => !p.locked);
        for (let i = bag.length - 1; i > 0; i--) {
            const j = (game.fx() * (i + 1)) | 0;
            const tmp = bag[i];
            bag[i] = bag[j];
            bag[j] = tmp;
        }
        const cards = bag.slice(0, Math.min(size, bag.length)).map((p) => {
            const cursed = game.fx() < 0.25;
            const curse = cursed ? CURSES[(game.fx() * CURSES.length) | 0] : null;
            return {
                perkId: p.id,
                name: p.name,
                desc: p.desc,
                cursed,
                curseId: curse ? curse.id : null,
                curseDesc: curse ? curse.desc : null,
            };
        });
        game.draft = { cards, sel: 0 };
    }

    // Commit a card: a cursed pick counts the perk twice and adds its curse. Then
    // refold and pay out any pick-time perks.
    function applyDraftPick(card) {
        if (!card) return;
        const inc = card.cursed ? 2 : 1;
        game.perks[card.perkId] = (game.perks[card.perkId] || 0) + inc;
        if (card.cursed && card.curseId) game.curses[card.curseId] = (game.curses[card.curseId] || 0) + 1;
        applyPerks();
        grantImmediatePerks();
    }

    function confirmDraft() {
        if (game.draft && game.draft.cards.length) applyDraftPick(game.draft.cards[game.draft.sel]);
        game.draft = null;
        if (game.pendingStart) {
            // The start-draft (startdraft unlock): the pick applies to round 1 rather
            // than advancing the round. Re-run the round-open perks so a picked
            // shield / Head Start / Bulldozer charge is live for round 1, then hand
            // control to the start screen (a direction press begins play).
            game.pendingStart = false;
            applyRoundStartPerks();
            game.state = "ready";
            game.timer = READY_TIME;
            startRoundIntro();
            return;
        }
        nextRound();
    }

    function draftMove(delta) {
        if (!game.draft) return;
        const n = game.draft.cards.length;
        game.draft.sel = (game.draft.sel + delta + n) % n;
    }

    // Per-round maze seed: deterministic given the run's seedBase, yet different
    // every round so each round is a fresh maze the harness can still replay.
    function mazeRng() {
        return mulberry32((game.seedBase + game.round * 0x9e3779b9) >>> 0);
    }

    function newMaze() {
        const d = difficulty(game.round);
        // FUNHOUSE skips the mirror step; power+ grants extra power pellets.
        const mirror = game.mutator !== "mirror";
        const extraPower = game.knobs ? game.knobs.extraPower : 0;
        generateMaze(game.round, mazeRng(), { mirror, extraPower, knockRate: d.knockRate });
        game.pelletsTotal = pelletsLeft;
        placePads();
    }

    // Teleport pads (round >= 6): the farthest-apart pair of open, non-pen cells.
    // Deterministic from the maze geometry — no RNG, so nothing here perturbs the
    // harness's seeded streams.
    function placePads() {
        game.pads = null;
        if (game.round < PADS_ROUND) return;
        const open = [];
        for (let r = 1; r < ROWS - 1; r++) {
            for (let c = 1; c < COLS - 1; c++) {
                if (grid[r][c] !== "#" && !inPen(c, r)) open.push({ c, r });
            }
        }
        if (open.length < 2) return;
        let a = open[0], b = open[1], bestD = -1;
        for (let i = 0; i < open.length; i++) {
            for (let j = i + 1; j < open.length; j++) {
                const dd = Math.abs(open[i].c - open[j].c) + Math.abs(open[i].r - open[j].r);
                if (dd > bestD) {
                    bestD = dd;
                    a = open[i];
                    b = open[j];
                }
            }
        }
        game.pads = [{ c: a.c, r: a.r }, { c: b.c, r: b.r }];
    }

    // The scatter/chase clock starts each round in scatter — unless this round's
    // scatterTime has decayed to 0, in which case ghosts chase from the whistle.
    function initModeClock() {
        const k = game.knobs || difficulty(game.round);
        game.modePhase = k.scatterTime > 0 ? "scatter" : "chase";
        game.modeTimer = k.scatterTime > 0 ? k.scatterTime : k.chaseTime;
    }

    // Put Chomp and the ghosts back on their start tiles (used by every reset).
    function placeEntities() {
        game.chomp = { px: CENTER_COL, py: ROWS - 3, dir: DIRS.up, want: DIRS.up, mouth: 0, padCd: 0, phasing: false, phaseTiles: 0, wrappedThisMove: false };
        game.ghosts = ghostStarts().map((s, i) => ({
            id: i,
            px: s.c,
            py: s.r,
            dir: DIRS.up,
            want: DIRS.up,
            mode: game.modePhase, // scatter | chase | fright | eyes
            color: theme.ghostColors[i % theme.ghostColors.length],
            phasing: false, // set true while this ghost is the "phase" event ghost or a phasing elite clips
            padCd: 0, // per-entity teleport cooldown (stops pad ping-pong)
            affix: null, // elite affix id (round >= 5), else null
            tankBites: 0, // Tank absorbs the first fright-eat
            eatCd: 0, // brief un-eatable window after a Tank absorbs a bite
            phaseCd: 0, // Phasing elite: seconds to the next wall-clip
            phaseClip: 0, // Phasing elite: seconds of wall-clip remaining
        }));
        // SWARM mutator: a fifth ghost that hunts Chomp like Blinky, born in the pen.
        if (game.mutator === "swarm") {
            game.ghosts.push({
                id: 4,
                px: HOME.c,
                py: HOME.r,
                dir: DIRS.up,
                want: DIRS.up,
                mode: game.modePhase,
                color: theme.ghostColors[0],
                phasing: false,
                padCd: 0,
                swarm: true,
                affix: null,
                tankBites: 0,
                eatCd: 0,
                phaseCd: 0,
                phaseClip: 0,
            });
        }
    }

    function reset(fullReset) {
        if (fullReset) {
            // Task 8: pull the persisted meta/high-scores fresh each run and reconcile
            // the lock flags, so unlocks earned on a previous run (this session or a
            // prior one) are live before the maze + theme are chosen below.
            game.meta = loadMeta();
            game.highscores = loadHighscores();
            syncUnlocks(game.meta);
            game.startdraftUnlocked = game.meta.unlocked.indexOf("startdraft") !== -1;
            game.started = false;
            game.recorded = false;
            game.lastRun = null;
            game.ghostsEaten = 0;

            game.round = 1;
            game.seedBase = Date.now() >>> 0;
            game.fx = mulberry32((game.seedBase ^ 0x51ed270b) >>> 0); // spawn/event stream, seeded off the run
            game.score = 0;
            game.lives = 3;
            game.perks = {}; // an unlock makes a perk DRAFTABLE, never auto-equipped — a run still opens perk-less
            game.curses = {};
            game.draft = null;
            game.bonusLifeGranted = 0;
            game.pelletsEaten = 0;
            game.secondWindUsed = false;
            game.deathIx = 0; // death-line rotation is per run
            game.deathLine = "";
            game.restartConfirm = 0;
            game.mutator = null;
            game.roundElites = [];
            game.ambusherId = -1; // the ambusher is a round >= 5 mechanic
            game.banner = null;
            game.eventTimer = EVENT_MIN + EVENT_SPAN * 0.5; // first event roll ~25 s into the run
            rollMutator(); // round 1 -> always null; keeps the fx cadence uniform
            applyPerks();
            newMaze();
            pickTheme();
        }
        applyPerks(); // knobs must exist before clearEphemeral / entities read them
        clearEphemeral(!fullReset); // a full run reset also drops the shield charge
        initModeClock();
        placeEntities();
        assignElites();
        applyRoundStartPerks();
        game.frightTimer = 0;
        game.eatChain = 0;
        game.state = "ready";
        game.timer = READY_TIME;

        // startdraft unlock: a full run opens with a 3-card draft before round 1.
        // The round-1 field is already set up behind the draft scrim; confirmDraft
        // applies the pick to round 1 (see confirmDraft's pendingStart branch).
        if (fullReset && game.startdraftUnlocked) {
            buildDraft();
            game.pendingStart = true;
            game.state = "draft";
            game.timer = DRAFT_TIME;
        } else {
            game.pendingStart = false;
        }
        if (game.state === "ready") startRoundIntro(); // maze fades up unless a start-draft is showing
    }

    // Move one entity center-to-center, making turn decisions at tile centres.
    function move(e, speed, dt, decide) {
        e.wrappedThisMove = false; // set true this frame if a tunnel wrap fires (read for the Toll Booth knob)
        let remaining = speed * dt;
        let guard = 0;
        while (remaining > 1e-6 && guard++ < 16) {
            let distToCenter;
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

    function tileOf(e) {
        return { c: Math.round(e.px), r: Math.round(e.py) };
    }

    // Cornering grace (Task 9): if the player is holding a PERPENDICULAR turn and
    // Chomp is within `grace` tiles of a cell centre where that turn is open, snap
    // to the centre and turn now — instead of overshooting and taking it a tile
    // late. Reads knobs.cornerGrace (Drift King widens it). Only ever tightens a
    // turn: it snaps to the nearest centre Chomp is already at or about to reach.
    function tryCorner(e, grace) {
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

    // The tile Chomp reaches at its next junction: walk its heading forward until
    // a cell that opens perpendicular (a junction) or the last cell before a wall.
    function ambushTarget(chompTile, dir) {
        if (dir.x === 0 && dir.y === 0) return chompTile;
        const perp = dir.x !== 0 ? [DIRS.up, DIRS.down] : [DIRS.left, DIRS.right];
        let c = chompTile.c;
        let r = chompTile.r;
        for (let guard = 0; guard < 40; guard++) {
            let nc = c + dir.x;
            const nr = r + dir.y;
            if (nc < 0) nc = COLS - 1;
            else if (nc >= COLS) nc = 0;
            if (isWall(nc, nr)) return { c, r }; // wall ahead: stop on this cell
            c = nc;
            r = nr;
            if (perp.some((p) => !isWall(c + p.x, r + p.y))) return { c, r }; // junction
        }
        return { c, r };
    }

    function ghostTarget(g, chompTile, blinkyTile) {
        if (g.mode === "eyes") return HOME;
        // The swarm ghost and splitter minis have no scatter corner of their own —
        // they hunt Chomp directly in every field mode (and dodge SCATTER[id] gaps).
        if (g.swarm || g.mini) return chompTile;
        if (g.mode === "scatter") return SCATTER[g.id];
        // chase
        if (game.round >= 5 && g.id === game.ambusherId) {
            // Ambusher: cut Chomp off at the tile it reaches at its next junction.
            return ambushTarget(chompTile, game.chomp.dir);
        }
        if (g.id === 0) return chompTile; // Blinky: straight at the player
        if (g.id === 1) {
            // Pinky: four tiles ahead of the player's heading.
            return { c: chompTile.c + game.chomp.dir.x * 4, r: chompTile.r + game.chomp.dir.y * 4 };
        }
        if (g.id === 2) {
            // Inky: reflect Blinky through the tile two ahead of the player.
            const ax = chompTile.c + game.chomp.dir.x * 2;
            const ay = chompTile.r + game.chomp.dir.y * 2;
            return { c: ax + (ax - blinkyTile.c), r: ay + (ay - blinkyTile.r) };
        }
        // Clyde: chase when far, flee to his corner when within 8 tiles.
        const dx = chompTile.c - g.px;
        const dy = chompTile.r - g.py;
        return dx * dx + dy * dy > 64 ? chompTile : SCATTER[3];
    }

    function sqDist(c, r, t) {
        return (c - t.c) * (c - t.c) + (r - t.r) * (r - t.r);
    }

    function chooseGhostDir(g, target, chompTile) {
        // Among open, non-reversing directions: greedily minimise distance to the
        // target, but let a couple of upgrades bend that rule (see below).
        const col = Math.round(g.px);
        const row = Math.round(g.py);
        const options = [];
        for (const key of ["up", "left", "down", "right"]) {
            const d = DIRS[key];
            if (isOpposite(d, g.dir)) continue;
            if (!stepFor(g, col, row, d)) continue;
            options.push(d);
        }
        if (options.length === 0) {
            g.want = { x: -g.dir.x, y: -g.dir.y }; // forced reverse (dead end)
            return;
        }
        // LIGHTS OUT: field ghosts (not fright/eyes) lose their target and wander.
        if (game.event && game.event.id === "blind" && (g.mode === "scatter" || g.mode === "chase")) {
            g.want = options[(game.fx() * options.length) | 0];
            return;
        }
        if (g.mode === "fright") {
            if (game.round >= 5) {
                // Smart flee: pick the turn that MAXIMISES distance to Chomp.
                let best = options[0];
                let far = -Infinity;
                for (const d of options) {
                    const dist = sqDist(col + d.x, row + d.y, chompTile);
                    if (dist > far) {
                        far = dist;
                        best = d;
                    }
                }
                g.want = best;
            } else {
                g.want = options[(Math.random() * options.length) | 0]; // erratic flee
            }
            return;
        }
        // Greedy toward target, tracking the runner-up so a "mistake" can take it.
        let best = options[0];
        let bestDist = Infinity;
        let second = null;
        let secondDist = Infinity;
        for (const d of options) {
            const dist = sqDist(col + d.x, row + d.y, target);
            if (dist < bestDist) {
                second = best;
                secondDist = bestDist;
                best = d;
                bestDist = dist;
            } else if (dist < secondDist) {
                second = d;
                secondDist = dist;
            }
        }
        if (g.mode !== "eyes" && second && Math.random() < difficulty(game.round).mistakeRate) {
            g.want = second; // early-round wobble: take the second-best turn
        } else {
            g.want = best;
        }
    }

    // Scatter/chase clock: alternate scatter(scatterTime) <-> chase(chaseTime).
    // When scatterTime has decayed to 0 the mode is permanently chase (no flips).
    // Frozen while any ghost is frightened, as the arcade does. Every flip
    // reverses and retargets the field ghosts — the classic "they all turn" tell.
    function tickModeClock(dt) {
        const k = game.knobs;
        if (k.scatterTime <= 0) return; // permanent chase (also the RUSH HOUR mutator)
        if (game.frightTimer > 0) return; // clock paused during fright
        game.modeTimer -= dt;
        if (game.modeTimer > 0) return;
        const next = game.modePhase === "scatter" ? "chase" : "scatter";
        game.modePhase = next;
        game.modeTimer = next === "scatter" ? k.scatterTime : k.chaseTime;
        for (const g of game.ghosts) {
            if (g.mode === "scatter" || g.mode === "chase") {
                g.mode = next;
                g.dir = { x: -g.dir.x, y: -g.dir.y };
                g.want = g.dir;
            }
        }
    }

    function update(dt) {
        // Clamp dt so a paused / backgrounded surface never makes a giant jump.
        dt = Math.min(dt, 0.05);
        if (game.restartConfirm > 0) game.restartConfirm -= dt; // the confirm window runs even while paused
        if (game.state === "paused") return; // frozen; P resumes
        game.anim += dt;
        tickVfx(dt); // juice advances in every live state (ready/dying/draft/playing), never while paused

        if (game.state === "ready" || game.state === "dying" || game.state === "over" || game.state === "draft") {
            if (onStartScreen()) return; // hold on the start screen until a direction press begins the run
            game.timer -= dt;
            if (game.state === "ready" && game.timer <= 0) {
                game.state = "playing";
                game.banner = null; // the round banner clears once play begins
            } else if (game.state === "dying" && game.timer <= 0) {
                if (game.lives <= 0) {
                    game.state = "over";
                    recordRun(); // out of lives -> fold the run into persistence, exactly once
                } else softReset();
            } else if (game.state === "draft" && game.timer <= 0) {
                confirmDraft(); // nobody confirmed in time -> take the highlighted card
            }
            return;
        }

        if (game.state !== "playing") return;

        const k = game.knobs; // this round's folded numbers — the only speed/score source the loop reads
        tickModeClock(dt);
        updateEffects(dt); // one ticking path for effects, the event, banners, scheduler
        if (game.headStartTimer > 0) game.headStartTimer -= dt; // Head Start: field frozen at round open

        // Player. Speed folds in the effect multiplier (speed/sticky + perks) and,
        // on a tunnel row, the Wind Tunnel launch knob.
        const chomp = game.chomp;
        chomp.mouth += dt * 9;
        chomp.phasing = chomp.phaseTiles > 0; // Bulldozer: a live wall-chew phases this frame
        const onTunnel = tunnelRows.has(Math.round(chomp.py));
        const preTileC = Math.round(chomp.px);
        const preTileR = Math.round(chomp.py);
        tryCorner(chomp, k.cornerGrace); // grace turns: snap-and-turn near a cell centre
        move(chomp, k.chompSpeed * game.speedMult * (onTunnel ? k.tunnelBoost : 1), dt, null);

        // Toll Booth: score on each tunnel wrap pass (knob read at the wrap site).
        if (chomp.wrappedThisMove && k.tunnelToll > 0) game.score += Math.round(k.tunnelToll * game.scoreMult);

        // Bulldozer: a live phase is spent the instant Chomp crosses into the wall tile.
        if (chomp.phaseTiles > 0) {
            if (Math.round(chomp.px) !== preTileC || Math.round(chomp.py) !== preTileR) chomp.phaseTiles = 0;
            chomp.phasing = chomp.phaseTiles > 0;
        }
        // Arm a new chew when Chomp is stalled, centred, and wants into an in-bounds
        // wall (never the border or the pen). Consumes one of this round's charges;
        // next frame's move() carries Chomp the single tile through.
        if (k.bulldozer > 0 && game.bulldozerCharges > 0 && chomp.phaseTiles === 0) {
            const cc = Math.round(chomp.px);
            const cr = Math.round(chomp.py);
            const centered = Math.abs(chomp.px - cc) < 1e-6 && Math.abs(chomp.py - cr) < 1e-6;
            const w = chomp.want;
            if (centered && w && (w.x !== 0 || w.y !== 0) && !canStep(cc, cr, w) && canStepPhase(cc, cr, w)) {
                game.bulldozerCharges--;
                chomp.phaseTiles = 1;
                chomp.dir = w; // commit to the chewed direction so the next move carries through
                chomp.phasing = true;
            }
        }

        // Eat pellets at the player's tile, then let the magnet sweep nearby ones.
        const pt = tileOf(chomp);
        if (pt.r >= 0 && pt.r < ROWS && pt.c >= 0 && pt.c < COLS) {
            const cell = grid[pt.r][pt.c];
            if (cell === ".") {
                grid[pt.r][pt.c] = " ";
                game.score += Math.round(k.pelletValue * game.scoreMult);
                pelletsLeft--;
                game.pelletsEaten++;
                popPellet(pt.c, pt.r, theme.pellet);
            } else if (cell === "o") {
                grid[pt.r][pt.c] = " ";
                game.score += Math.round(50 * game.scoreMult);
                pelletsLeft--;
                popPellet(pt.c, pt.r, theme.power);
                triggerFright();
            }
        }
        applyMagnet();
        if (pelletsLeft <= 0) {
            // Crumb Bank pays a clear bonus before the draft opens.
            if (k.bankRate > 0) game.score += Math.round(game.score * k.bankRate);
            buildDraft();
            game.state = "draft"; // round clear -> the perk draft
            game.timer = DRAFT_TIME;
            return;
        }

        // Fright countdown.
        if (game.frightTimer > 0) {
            game.frightTimer -= dt;
            if (game.frightTimer <= 0) {
                for (const g of game.ghosts) if (g.mode === "fright") g.mode = game.modePhase;
                game.eatChain = 0;
            }
        }

        // Ghosts. The active event is read as pure state: rush speeds the field up,
        // revive snaps eaten eyes straight to the pen, a freeze effect halts them,
        // and the phase-event ghost walks through walls (clamped, never the pen).
        const chompTile = tileOf(chomp);
        const blinkyTile = tileOf(game.ghosts[0]);
        const eventId = game.event ? game.event.id : null;
        const frozen = hasEffect("freeze");
        for (const g of game.ghosts) {
            if (g.eatCd > 0) g.eatCd -= dt; // Tank's brief post-absorb grace

            // Phasing elite: a 1.5 s wall-clip every 7 s. Reuses the phase-event
            // wall-skip rule, so g.phasing is the single flag both features drive.
            if (g.affix === "phasing" && g.mode !== "eyes") {
                if (g.phaseClip > 0) g.phaseClip -= dt;
                else {
                    g.phaseCd -= dt;
                    if (g.phaseCd <= 0) {
                        g.phaseClip = 1.5;
                        g.phaseCd = 7;
                    }
                }
            }
            g.phasing =
                ((eventId === "phase" && g.id === game.phaseGhost) || (g.affix === "phasing" && g.phaseClip > 0)) &&
                g.mode !== "eyes";

            if (eventId === "revive" && g.mode === "eyes") {
                g.px = HOME.c;
                g.py = HOME.r;
                g.dir = DIRS.up;
                g.want = DIRS.up;
                g.mode = game.frightTimer > 0 ? "fright" : game.modePhase;
            }

            if (frozen && g.mode !== "eyes") continue; // FREEZE / COLD SNAP: the field holds still
            if (game.headStartTimer > 0 && g.mode !== "eyes") continue; // Head Start: field frozen at open

            let speed;
            if (g.mode === "fright") speed = FRIGHT_SPEED;
            else if (g.mode === "eyes") speed = k.eyesSpeed;
            else {
                speed = k.ghostSpeed;
                if (g.id === 0 && !g.mini) {
                    // Cruise Elroy: Blinky accelerates as the maze empties.
                    const frac = game.pelletsTotal > 0 ? pelletsLeft / game.pelletsTotal : 1;
                    if (frac < 0.1) speed *= 1.2;
                    else if (frac < 0.3) speed *= 1.1;
                }
                if (g.affix === "swift") speed *= 1.2;
                if (g.affix === "vengeful") speed *= 1 + 0.04 * game.ghostsEatenThisRound;
                if (g.mini) speed *= 0.6;
            }
            if (eventId === "rush" && g.mode !== "eyes") speed *= 1.3; // RUSH

            const target = ghostTarget(g, chompTile, blinkyTile);
            move(g, speed, dt, (e) => chooseGhostDir(e, target, chompTile));

            // Eyes that reached home revive into the current mode phase.
            if (g.mode === "eyes") {
                const gt = tileOf(g);
                if (gt.c === HOME.c && gt.r === HOME.r) g.mode = game.frightTimer > 0 ? "fright" : game.modePhase;
            }
        }

        // Fruit / crate / runner cadence, runner motion, pad teleports, collection.
        updateSpawns(dt);

        // Collisions. Iterate a snapshot so splitter minis spawned mid-loop are not
        // eaten in the same frame. A shield charge (then Second Wind) absorbs a
        // lethal hit; the offending ghost retreats to the pen, lives untouched.
        for (const g of game.ghosts.slice()) {
            const dx = g.px - chomp.px;
            const dy = g.py - chomp.py;
            if (dx * dx + dy * dy < 0.45 * 0.45) {
                if (g.mode === "fright") {
                    if (g.eatCd > 0) continue; // recently absorbed a Tank bite — not eatable yet
                    if (g.affix === "tank" && g.tankBites < 1) {
                        g.tankBites++; // Tank shrugs off the first fright-eat
                        g.eatCd = 0.3;
                        g.dir = { x: -g.dir.x, y: -g.dir.y };
                        g.want = g.dir;
                        continue;
                    }
                    g.mode = "eyes";
                    let gain;
                    if (g.mini) {
                        gain = 150 * game.scoreMult; // a split mini is a flat 150
                    } else {
                        game.eatChain++;
                        gain = (200 * game.eatChain * k.chainMult + k.ghostFlat) * game.scoreMult;
                    }
                    game.score += Math.round(gain);
                    floatText(g.px, g.py, TEXT.gain(Math.round(gain)), theme.win); // the points rise off the kill
                    shake(SHAKE_EAT);
                    if (!g.mini && game.eatChain >= 2) comboPop(game.eatChain); // ×2!, ×3!… on a chain
                    onGhostEaten(g);
                } else if (g.mode !== "eyes") {
                    if (game.shield > 0) {
                        game.shield--; // absorbed — exactly one hit per charge
                        g.mode = "eyes";
                        g.dir = { x: -g.dir.x, y: -g.dir.y };
                        g.want = g.dir;
                        continue;
                    }
                    if (k.secondWind && !game.secondWindUsed) {
                        game.secondWindUsed = true; // cheat death once per run
                        g.mode = "eyes";
                        g.dir = { x: -g.dir.x, y: -g.dir.y };
                        g.want = g.dir;
                        queueBanner(TEXT.secondWind, theme.win);
                        continue;
                    }
                    game.lives--;
                    game.state = "dying";
                    game.timer = 1.2;
                    game.deathLine = TEXT.deaths[game.deathIx % TEXT.deaths.length]; // OOF. / CAUGHT. / SQUISHED.
                    game.deathIx++;
                    shake(SHAKE_DEATH);
                    break;
                }
            }
        }
    }

    // A power pellet was eaten. The two event one-shots are consumed HERE, each
    // exactly once: frenzy replaces the fright with a score burst, chill adds a
    // 2 s ghost freeze on top of the normal fright.
    function triggerFright() {
        if (game.frenzyArmed) {
            game.frenzyArmed = false; // consumed — this pellet scores instead of frightening
            game.score += Math.round(100 * game.round * game.scoreMult);
            return;
        }
        const chill = game.chillArmed;
        game.chillArmed = false; // consumed whether or not a fright follows
        let ft = game.knobs.frightTime; // Long Dread / the dim curse fold in here
        if (game.knobs.vampire) ft += Math.floor(game.pelletsEaten / 50); // Pellet Vampire bonus
        if (ft > 0) {
            game.frightTimer = ft;
            game.eatChain = 0;
            for (const g of game.ghosts) {
                if (g.mode !== "eyes") {
                    g.mode = "fright";
                    g.tankBites = 0; // a fresh fright resets the Tank's bite counter
                    g.eatCd = 0;
                    // Classic reverse on fright.
                    g.dir = { x: -g.dir.x, y: -g.dir.y };
                    g.want = g.dir;
                }
            }
        }
        if (chill) addEffect("freeze", CHILL_FREEZE); // COLD SNAP freezes even past the fright cutoff
    }

    // ---- Effects: one ticking path, current-multiplier helpers ----------------
    // Task 7 perks stack onto exactly these knobs (speedMult / scoreMult / shield
    // cap / crateLuck) instead of adding a parallel system.
    function hasEffect(id) {
        for (const e of game.effects) if (e.id === id) return true;
        return false;
    }

    function recomputeMultipliers() {
        let sp = 1;
        if (hasEffect("speed")) sp *= 1.25;
        if (hasEffect("sticky")) sp *= 0.6;
        game.speedMult = sp;
        // The DOUBLE pickup composes multiplicatively with the folded scoreMult knob.
        const km = game.knobs ? game.knobs.scoreMult : 1;
        game.scoreMult = (hasEffect("double") ? 2 : 1) * km;
    }

    function addEffect(id, time) {
        const ex = game.effects.find((e) => e.id === id);
        if (ex) ex.timeLeft = Math.max(ex.timeLeft, time); // refresh, never stack duplicates
        else game.effects.push({ id, timeLeft: time });
        recomputeMultipliers();
    }

    // Apply a resolved pickup by id. Timed entries land in game.effects; the two
    // instant ones (shield charge, and any future perk) branch by id. Guarded so a
    // late-round-only effect (reversed) can never apply below its minRound.
    function applyPickup(id) {
        const entry = PICKUPS.good.find((p) => p.id === id) || PICKUPS.bad.find((p) => p.id === id);
        if (!entry) return;
        if (entry.minRound && game.round < entry.minRound) return;
        if (id === "shield") game.shield = Math.min(2, game.shield + 1);
        else addEffect(id, entry.time);
        queueBanner(entry.name, theme.accent);
    }

    // A mystery crate rolls good against the crateLuck knob (baseline 0.5, 0.75
    // with Loaded Dice) then a uniform effect from that column, filtered by
    // minRound so DIZZY only ever appears from round 8.
    function rollCrate() {
        const good = game.fx() < game.knobs.crateLuck;
        let col = (good ? PICKUPS.good : PICKUPS.bad).filter((p) => !p.minRound || game.round >= p.minRound);
        if (col.length === 0) col = PICKUPS.good; // bad column is empty before round 8
        return col[(game.fx() * col.length) | 0].id;
    }

    function queueBanner(text, color) {
        game.banners.push({ text, color, timeLeft: BANNER_TIME }); // only banners[0] renders — no overlap
    }

    // ---- Event scheduler ------------------------------------------------------
    function rollEvent() {
        const hostileProb = Math.min(0.8, 0.4 + 0.05 * game.round);
        const wantHostile = game.fx() < hostileProb;
        const pool = EVENTS.filter((e) => e.hostile === wantHostile);
        triggerEvent(pool[(game.fx() * pool.length) | 0]);
    }

    function triggerEvent(entry) {
        if (!entry) return;
        game.eventsFired++;
        if (entry.id === "frenzy") game.frenzyArmed = true; // one-shot, no timed event
        else if (entry.id === "chill") game.chillArmed = true; // one-shot, no timed event
        else {
            game.event = { id: entry.id, timeLeft: entry.time };
            // Pick an eligible ghost OBJECT and store its id: the loop matches by id
            // (:g.id === game.phaseGhost), so an index would miss split minis (id
            // 100+) and the swarm ghost (id 4) whose ids are not their array slot.
            if (entry.id === "phase") {
                const eligible = game.ghosts.filter((g) => g.mode !== "eyes");
                const pick = eligible.length ? eligible : game.ghosts;
                game.phaseGhost = pick.length ? pick[(game.fx() * pick.length) | 0].id : -1;
            }
        }
        queueBanner(entry.name, entry.hostile ? theme.danger : theme.accent);
    }

    // The single ticking path for every timed value Task 6 owns: Chomp effects,
    // the active event, the banner queue, and the next-event schedule.
    function updateEffects(dt) {
        if (game.effects.length) {
            let changed = false;
            for (const e of game.effects) e.timeLeft -= dt;
            for (let i = game.effects.length - 1; i >= 0; i--) {
                if (game.effects[i].timeLeft <= 0) {
                    game.effects.splice(i, 1);
                    changed = true;
                }
            }
            if (changed) recomputeMultipliers();
        }

        if (game.event) {
            game.event.timeLeft -= dt;
            if (game.event.timeLeft <= 0) game.event = null;
        }

        if (game.banners.length) {
            game.banners[0].timeLeft -= dt;
            if (game.banners[0].timeLeft <= 0) game.banners.shift();
        }

        if (game.round >= EVENT_ROUND) {
            game.eventTimer -= dt;
            if (game.eventTimer <= 0) {
                rollEvent();
                game.eventTimer = EVENT_MIN + game.fx() * EVENT_SPAN; // next roll 20-30 s out
            }
        }
    }

    // ---- Spawners + interactables: one ticking path ---------------------------
    // Pick a random open, pellet-free, unoccupied, non-pen cell (or null).
    function pickFreeCell() {
        const free = [];
        for (let r = 1; r < ROWS - 1; r++) {
            for (let c = 1; c < COLS - 1; c++) {
                if (grid[r][c] !== " " || inPen(c, r)) continue;
                if (game.spawns.some((s) => s.c === c && s.r === r)) continue;
                free.push({ c, r });
            }
        }
        return free.length ? free[(game.fx() * free.length) | 0] : null;
    }

    function spawnFruit(cell) {
        const t = cell || pickFreeCell();
        const life = game.knobs ? game.knobs.fruitLife : FRUIT_LIFE; // Ripe Luck lengthens this
        if (t) game.spawns.push({ kind: "fruit", c: t.c, r: t.r, life });
    }

    function spawnCrate(cell, forced) {
        const t = cell || pickFreeCell();
        if (t) game.spawns.push({ kind: "crate", c: t.c, r: t.r, life: CRATE_LIFE, forced: forced || null });
    }

    function spawnRunner(cell) {
        const t = cell || pickFreeCell();
        if (!t) return;
        game.spawns.push({
            kind: "runner",
            c: t.c,
            r: t.r,
            px: t.c,
            py: t.r,
            dir: DIRS.left,
            want: DIRS.left,
            life: RUNNER_LIFE,
            padCd: 0,
        });
    }

    // Runner flees Chomp with the smart-flee rule (maximise distance at each
    // junction) at a fixed fraction of Chomp's nominal speed. Reuses move() — no
    // second movement integrator.
    function moveRunner(s, dt) {
        const chompTile = tileOf(game.chomp);
        // Lead Boots (runnerSpeed knob) tires the runner; chompSpeed is the folded base.
        move(s, game.knobs.chompSpeed * game.knobs.runnerSpeed, dt, (e, col, row) => {
            const options = [];
            for (const key of ["up", "left", "down", "right"]) {
                const dir = DIRS[key];
                if (isOpposite(dir, e.dir)) continue;
                if (!canStep(col, row, dir)) continue;
                options.push(dir);
            }
            if (options.length === 0) {
                e.want = { x: -e.dir.x, y: -e.dir.y };
                return;
            }
            let best = options[0];
            let far = -Infinity;
            for (const dir of options) {
                const dist = sqDist(col + dir.x, row + dir.y, chompTile);
                if (dist > far) {
                    far = dist;
                    best = dir;
                }
            }
            e.want = best;
        });
    }

    // Teleport pads: any entity centred on a pad (off cooldown) jumps to its twin
    // and takes a per-entity cooldown so it cannot immediately bounce back.
    function updatePads(dt) {
        if (!game.pads) return;
        const ents = [game.chomp];
        for (const g of game.ghosts) ents.push(g);
        for (const s of game.spawns) if (s.kind === "runner") ents.push(s);
        for (const e of ents) {
            if (e.padCd > 0) e.padCd -= dt;
            if (e.padCd > 0) continue;
            const c = Math.round(e.px);
            const r = Math.round(e.py);
            if (Math.abs(e.px - c) > 0.1 || Math.abs(e.py - r) > 0.1) continue; // only at a tile centre
            let idx = -1;
            if (game.pads[0].c === c && game.pads[0].r === r) idx = 0;
            else if (game.pads[1].c === c && game.pads[1].r === r) idx = 1;
            if (idx === -1) continue;
            const dest = game.pads[1 - idx];
            e.px = dest.c;
            e.py = dest.r;
            e.padCd = PAD_COOLDOWN;
        }
    }

    function collectSpawns() {
        const chomp = game.chomp;
        for (const s of game.spawns) {
            const sx = s.px !== undefined ? s.px : s.c;
            const sy = s.py !== undefined ? s.py : s.r;
            const dx = sx - chomp.px;
            const dy = sy - chomp.py;
            if (dx * dx + dy * dy >= 0.45 * 0.45) continue;
            s.dead = true;
            if (s.kind === "fruit") {
                const gain = 100 * game.round * game.scoreMult;
                game.score += Math.round(gain);
                floatText(sx, sy, TEXT.gain(Math.round(gain)), theme.win);
            } else if (s.kind === "runner") {
                const gain = 500 * game.round * game.scoreMult;
                game.score += Math.round(gain);
                floatText(sx, sy, TEXT.gain(Math.round(gain)), theme.win);
            } else if (s.kind === "crate") {
                const id = s.forced || rollCrate(); // one roll per crate — unchanged fx draw
                const bad = PICKUPS.bad.some((p) => p.id === id);
                const entry = (bad ? PICKUPS.bad : PICKUPS.good).find((p) => p.id === id);
                floatText(sx, sy, entry ? entry.name : TEXT.crateMark, bad ? theme.danger : theme.accent);
                applyPickup(id);
            }
        }
        if (game.spawns.some((s) => s.dead)) game.spawns = game.spawns.filter((s) => !s.dead);
    }

    function updateSpawns(dt) {
        for (const s of game.spawns) s.life -= dt;
        if (game.spawns.some((s) => s.life <= 0)) game.spawns = game.spawns.filter((s) => s.life > 0);

        game.fruitTimer -= dt;
        if (game.fruitTimer <= 0) {
            spawnFruit();
            game.fruitTimer = FRUIT_EVERY;
        }
        game.crateTimer -= dt;
        if (game.crateTimer <= 0) {
            spawnCrate();
            game.crateTimer = CRATE_EVERY;
        }
        if (game.round >= RUNNER_ROUND) {
            game.runnerTimer -= dt;
            if (game.runnerTimer <= 0) {
                spawnRunner();
                game.runnerTimer = RUNNER_EVERY;
            }
        }

        for (const s of game.spawns) if (s.kind === "runner") moveRunner(s, dt);
        updatePads(dt);
        collectSpawns();
    }

    // Magnet: sweep in loose pellets within reach (never power pellets — those
    // still demand a deliberate bite). Reach is the Crumb Magnet knob baseline plus
    // the MAGNET pickup's radius while it is active; nothing runs at reach 0.
    function applyMagnet() {
        const reach = game.knobs.magnetRadius + (hasEffect("magnet") ? MAGNET_RADIUS : 0);
        if (reach <= 0) return;
        const ct = tileOf(game.chomp);
        for (let dr = -reach; dr <= reach; dr++) {
            for (let dc = -reach; dc <= reach; dc++) {
                if (dc * dc + dr * dr > reach * reach) continue;
                const c = ct.c + dc;
                const r = ct.r + dr;
                if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
                if (grid[r][c] === ".") {
                    grid[r][c] = " ";
                    game.score += Math.round(game.knobs.pelletValue * game.scoreMult);
                    pelletsLeft--;
                    game.pelletsEaten++;
                }
            }
        }
    }

    // Clears the per-life ephemera (active event, effects, spawns, banners). The
    // event *schedule* (game.eventTimer) is deliberately NOT reset here — it free-
    // runs across deaths and round changes so events keep their cadence.
    function clearEphemeral(keepShield) {
        game.event = null;
        game.frenzyArmed = false;
        game.chillArmed = false;
        game.phaseGhost = -1;
        game.effects = [];
        if (!keepShield) game.shield = 0;
        game.headStartTimer = 0;
        game.spawns = [];
        game.banners = [];
        game.vfx = []; // drop lingering juice on any life/round change (they expire in < 1 s anyway)
        game.fruitTimer = FRUIT_EVERY;
        game.crateTimer = CRATE_EVERY;
        game.runnerTimer = RUNNER_EVERY;
        recomputeMultipliers();
    }

    function softReset() {
        // After a lost life: keep score, maze and round — reset positions + clock.
        // The shield charge survives a death; timed effects, spawns and events do not.
        clearEphemeral(true);
        initModeClock();
        placeEntities();
        reapplyElites(); // affixes are round-scoped: the same ghosts stay elite across a death
        game.frightTimer = 0;
        game.eatChain = 0;
        game.state = "ready";
        game.timer = READY_TIME;
    }

    // Round clear -> next round: roll the mutator, refold the perks, cut a fresh
    // maze (its knock rate, the funhouse mirror, perk power pellets) and theme, then
    // a "ROUND N — THEME · MUTATOR" banner. Score persists; a life every third
    // round, capped at 5. From round 5 one random non-Blinky ghost turns ambusher.
    function nextRound() {
        game.round++;
        game.lives = Math.min(5, game.lives + (game.round % 3 === 0 ? 1 : 0));
        rollMutator();
        applyPerks();
        newMaze();
        pickTheme();
        game.ambusherId = game.round >= 5 ? 1 + ((Math.random() * 3) | 0) : -1;
        const mut = game.mutator ? MUTATORS.find((m) => m.id === game.mutator) : null;
        game.banner = TEXT.roundBanner(game.round, themeName.toUpperCase(), mut ? mut.name : null);
        clearEphemeral(true); // carry the shield charge into the next round; drop the rest
        initModeClock();
        placeEntities();
        assignElites();
        applyRoundStartPerks();
        game.frightTimer = 0;
        game.eatChain = 0;
        game.state = "ready";
        game.timer = READY_TIME;
        startRoundIntro();
    }

    // ---- Task 8: run-end fold + start screen -----------------------------------
    // Fold a finished run into persistence — exactly once. Stats accumulate, the
    // score enters the top-10 board, crumbs tick up (lifetime, never spent), and
    // every newly affordable unlock is auto-claimed in table order. Best-effort:
    // with storage absent the fold still computes game.lastRun (so the game-over
    // screen renders) but nothing is written.
    function recordRun() {
        if (game.recorded) return;
        game.recorded = true;

        const meta = game.meta;
        const hs = game.highscores;

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
        const entry = { s: game.score, r: game.round, d: Date.now() };
        hs.entries.push(entry);
        hs.entries.sort((a, b) => b.s - a.s);
        const rank = hs.entries.indexOf(entry);
        if (hs.entries.length > 10) hs.entries = hs.entries.slice(0, 10);
        const madeBoard = rank < 10;
        const newHigh = rank === 0;

        // Auto-claim every unlock now affordable (thresholds are cumulative-lifetime),
        // in table order; syncUnlocks then reconciles the pool/bag lock flags.
        const claimed = [];
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

    // The start screen holds on round 1 until the first direction press — so the
    // title/board data can be read before a run begins.
    function onStartScreen() {
        return game.state === "ready" && game.round === 1 && !game.started;
    }

    function input(keyCode) {
        // Draft owns input while it is open: left/right (or A/D) select, confirm commits.
        if (game.state === "draft") {
            if (keyCode === keys.LEFT || keyCode === keys.A) draftMove(-1);
            else if (keyCode === keys.RIGHT || keyCode === keys.D) draftMove(1);
            else if (keyCode === keys.SPACE || keyCode === keys.ENTER) confirmDraft();
            return;
        }
        if (keyCode === keys.LEFT || keyCode === keys.A) setWant(DIRS.left);
        else if (keyCode === keys.RIGHT || keyCode === keys.D) setWant(DIRS.right);
        else if (keyCode === keys.UP || keyCode === keys.W) setWant(DIRS.up);
        else if (keyCode === keys.DOWN || keyCode === keys.S) setWant(DIRS.down);
        else if (keyCode === keys.P) togglePause();
        else if (keyCode === keys.R) requestRestart();
        else if (keyCode === keys.SPACE || keyCode === keys.ENTER) {
            if (game.state === "over") reset(true); // a run only restarts from over
        }
    }

    function togglePause() {
        if (game.state === "playing") game.state = "paused";
        else if (game.state === "paused") game.state = "playing";
    }

    // R once opens a 2 s confirm window; R again inside it restarts the run mid-flight
    // (from playing or paused). Space/Enter still restart from the game-over screen.
    // Autoplay bots never press R, so the harness never trips this.
    function requestRestart() {
        if (game.state !== "playing" && game.state !== "paused") return;
        if (game.restartConfirm > 0) {
            game.restartConfirm = 0;
            reset(true);
        } else {
            game.restartConfirm = RESTART_CONFIRM;
        }
    }

    function setWant(d) {
        if (game.state === "ready" || game.state === "playing") {
            // On the start screen, the first direction press begins the run: it
            // leaves the start screen but keeps the normal READY dwell before play.
            if (onStartScreen()) game.started = true;
            // DIZZY (round 8+ only, gated at pickup time) inverts the requested dir.
            if (hasEffect("reversed")) d = { x: -d.x, y: -d.y };
            game.chomp.want = d;
            // Allow instant reversal mid-corridor — feels right for this game.
            if (isOpposite(d, game.chomp.dir)) game.chomp.dir = d;
        }
    }

    // ---- Juice: one vfx system (Task 9) ----------------------------------------
    // game.vfx is a flat array of transient effects. Spawn helpers push, tickVfx
    // ages+reaps, and the render pass draws each by type — no per-effect subsystem,
    // no extra state elsewhere. Crucially, NONE of this touches game.fx or
    // Math.random: particle spread is a fixed radial fan and shake is driven by the
    // deterministic anim clock, so the seeded spawn/AI streams the harness replays
    // are never perturbed. The array is hard-capped so it can never run away.
    function pushVfx(e) {
        e.t = 0;
        game.vfx.push(e);
        if (game.vfx.length > VFX_CAP) game.vfx.splice(0, game.vfx.length - VFX_CAP); // shed oldest first
    }
    function shake(spec) {
        pushVfx({ type: "shake", amp: spec.amp, ttl: spec.ttl });
    }
    function popPellet(c, r, color) {
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI * 2; // fixed thirds — deterministic, no RNG
            pushVfx({ type: "pop", c, r, vx: Math.cos(ang) * 3, vy: Math.sin(ang) * 3, ttl: POP_TIME, color });
        }
    }
    function floatText(c, r, text, color) {
        pushVfx({ type: "float", c, r, text, color, ttl: FLOAT_TIME });
    }
    function comboPop(n) {
        pushVfx({ type: "combo", text: TEXT.combo(n), ttl: COMBO_TIME });
    }
    function startRoundIntro() {
        pushVfx({ type: "intro", ttl: INTRO_TIME });
    }
    function tickVfx(dt) {
        if (!game.vfx.length) return;
        for (const e of game.vfx) e.t += dt;
        for (let i = game.vfx.length - 1; i >= 0; i--) if (game.vfx[i].t >= game.vfx[i].ttl) game.vfx.splice(i, 1);
    }
    // The board-shake offset in pixels: the strongest live shake, decaying linearly,
    // wobbled by the anim clock. Applied once around the board draw in render().
    function shakeOffset() {
        let amp = 0;
        for (const e of game.vfx) {
            if (e.type !== "shake") continue;
            const a = e.amp * (1 - e.t / e.ttl);
            if (a > amp) amp = a;
        }
        if (amp <= 0) return { dx: 0, dy: 0 };
        return { dx: Math.sin(game.anim * 90) * amp, dy: Math.cos(game.anim * 78) * amp };
    }
    // 0..1 across the round intro (1 = fully faded in / no intro active).
    function introProgress() {
        for (const e of game.vfx) if (e.type === "intro") return e.t / e.ttl;
        return 1;
    }

    // ---- Rendering ---------------------------------------------------------
    function render(x, y, w, h) {
        renderer.roundedRect(x, y, w, h, 10, theme.bg);

        const hud = Math.max(18, Math.min(28, h * 0.09));
        const boardW = w;
        const boardH = h - hud;
        const tile = Math.max(4, Math.floor(Math.min(boardW / COLS, boardH / ROWS)));
        const mazeW = tile * COLS;
        const mazeH = tile * ROWS;
        // Screen shake offsets the whole board once — HUD and full-surface screens
        // stay put so text never jitters.
        const so = shakeOffset();
        const ox = x + (w - mazeW) / 2 + so.dx;
        const oy = y + hud + (boardH - mazeH) / 2 + so.dy;

        drawMaze(ox, oy, tile);
        drawPellets(ox, oy, tile);
        drawPads(ox, oy, tile);
        drawSpawns(ox, oy, tile);
        for (const g of game.ghosts) drawGhost(g, ox, oy, tile);
        drawChomp(ox, oy, tile);
        drawMutatorOverlay(ox, oy, tile); // FOG / BLACKOUT sit above the board, below the HUD
        drawIntroFade(ox, oy, mazeW, mazeH); // maze fades up from bg over the round intro
        drawDangerEdges(ox, oy, mazeW, mazeH); // heartbeat proximity + fright-end border flash
        drawBoardVfx(ox, oy, tile); // pellet pops + floating score, in board space (ride the shake)

        drawHud(x, y, w, hud);
        drawEffectChips(x, y, w, hud);
        // The draft / start / game-over screens take over the banner slot with their
        // own full-surface UI; otherwise the mid-play banner shows (a dim scrim first
        // when paused).
        if (game.state === "draft") drawDraft(x, y, w, h);
        else if (game.state === "over") drawGameOver(x, y, w, h);
        else if (onStartScreen()) drawStartScreen(x, y, w, h);
        else {
            if (game.state === "paused") renderer.roundedRect(x, y, w, h, 10, renderer.withAlpha(theme.bg, 150));
            drawBanner(x, y, w, h);
        }
        drawScreenVfx(x, y, w, h); // combo pops sit dead-centre, above everything
        drawRestartPrompt(x, y, w, h); // "again? R to confirm" while the window is open
    }

    // Board-space juice: pellet pops fly out and fade; floating score rises and
    // fades. Both are drawn with the shaken board origin so they track it.
    function drawBoardVfx(ox, oy, tile) {
        for (const e of game.vfx) {
            const k = e.t / e.ttl;
            if (e.type === "pop") {
                const cx = cellX(ox, e.c + e.vx * e.t, tile);
                const cy = cellY(oy, e.r + e.vy * e.t, tile);
                const rad = Math.max(1, tile * 0.12 * (1 - k));
                renderer.circle(cx, cy, rad, renderer.withAlpha(e.color, Math.round(255 * (1 - k))));
            } else if (e.type === "float") {
                const cx = cellX(ox, e.c, tile);
                const cy = cellY(oy, e.r, tile) - k * tile * 0.7; // rises as it fades
                const fs = tile * 0.5;
                const tw = renderer.textWidth("productsans-bold", e.text, fs);
                renderer.text("productsans-bold", e.text, cx - tw / 2, cy, fs, renderer.withAlpha(e.color, Math.round(255 * (1 - k))));
            }
        }
    }

    // Screen-space juice: combo pops punch in at centre and settle as they fade.
    function drawScreenVfx(x, y, w, h) {
        for (const e of game.vfx) {
            if (e.type !== "combo") continue;
            const k = e.t / e.ttl;
            const fs = Math.min(h * 0.14, w * 0.13) * (1 + 0.3 * (1 - k));
            const tw = renderer.textWidth("productsans-bold", e.text, fs);
            renderer.text("productsans-bold", e.text, x + (w - tw) / 2, y + h * 0.42, fs, renderer.withAlpha(theme.accent, Math.round(255 * (1 - k))));
        }
    }

    // Maze fades up from the background over INTRO_TIME: a bg veil that thins to
    // nothing as the intro completes.
    function drawIntroFade(ox, oy, mazeW, mazeH) {
        const p = introProgress();
        if (p >= 1) return;
        renderer.rect(ox, oy, mazeW, mazeH, renderer.withAlpha(theme.bg, Math.round((1 - p) * 255)));
    }

    // A danger edge around the board: a 2 Hz heartbeat that swells as a hunting
    // ghost closes within HEART_TILES, plus a fast border flash over the last
    // FRIGHT_FLASH seconds of a fright. Render-only — reads live state, owns none.
    function drawDangerEdges(ox, oy, mazeW, mazeH) {
        if (game.state !== "playing") return;
        let a = 0;
        let col = theme.danger;
        let nearest = Infinity;
        const ct = tileOf(game.chomp);
        for (const g of game.ghosts) {
            if (g.mode !== "scatter" && g.mode !== "chase") continue;
            const d = Math.abs(g.px - ct.c) + Math.abs(g.py - ct.r);
            if (d < nearest) nearest = d;
        }
        if (nearest <= HEART_TILES) {
            const prox = 1 - nearest / HEART_TILES;
            a = prox * (0.5 + 0.5 * Math.sin(game.anim * Math.PI * 4)) * 0.6; // pulse at 2 Hz
        }
        if (game.frightTimer > 0 && game.frightTimer < FRIGHT_FLASH) {
            const flash = Math.floor(game.frightTimer * 6) % 2 === 0 ? 0.5 : 0.15;
            if (flash > a) {
                a = flash;
                col = theme.frightFlash;
            }
        }
        if (a <= 0) return;
        const c = renderer.withAlpha(col, Math.round(Math.min(0.7, a) * 255));
        const t = Math.max(2, mazeW * 0.02);
        renderer.rect(ox, oy, mazeW, t, c);
        renderer.rect(ox, oy + mazeH - t, mazeW, t, c);
        renderer.rect(ox, oy, t, mazeH, c);
        renderer.rect(ox + mazeW - t, oy, t, mazeH, c);
    }

    // The R-to-restart confirm prompt, shown only while the window is open in play.
    function drawRestartPrompt(x, y, w, h) {
        if (game.restartConfirm <= 0) return;
        if (game.state !== "playing" && game.state !== "paused") return;
        const s = Math.min(h * 0.045, w * 0.05);
        drawCenteredText("productsans-bold", TEXT.restartConfirm, x + w / 2, y + h * 0.72, s, theme.danger, w * 0.9);
    }

    // FOG dims tiles past a radius from Chomp; BLACKOUT darkens the board but lets
    // the pellets glow. Both are pure overlays — no engine state, render only.
    function drawMutatorOverlay(ox, oy, tile) {
        if (game.mutator === "fog") {
            const ct = tileOf(game.chomp);
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const dist = Math.sqrt((c - ct.c) * (c - ct.c) + (r - ct.r) * (r - ct.r));
                    const a = Math.max(0, Math.min(0.95, (dist - 4.5) / 2));
                    if (a <= 0) continue;
                    renderer.rect(ox + c * tile, oy + r * tile, tile, tile, renderer.withAlpha(theme.bg, Math.round(a * 255)));
                }
            }
        } else if (game.mutator === "dark") {
            renderer.rect(ox, oy, tile * COLS, tile * ROWS, renderer.withAlpha(theme.bg, 150));
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < COLS; c++) {
                    const cell = grid[r][c];
                    if (cell === ".") {
                        renderer.circle(cellX(ox, c, tile), cellY(oy, r, tile), tile * 0.24, renderer.withAlpha(theme.pellet, 100));
                        renderer.circle(cellX(ox, c, tile), cellY(oy, r, tile), Math.max(1, tile * 0.1), theme.pellet);
                    } else if (cell === "o") {
                        renderer.circle(cellX(ox, c, tile), cellY(oy, r, tile), tile * 0.36, renderer.withAlpha(theme.power, 100));
                        renderer.circle(cellX(ox, c, tile), cellY(oy, r, tile), tile * 0.2, theme.power);
                    }
                }
            }
        }
    }

    function cellX(ox, c, tile) {
        return ox + c * tile + tile / 2;
    }
    function cellY(oy, r, tile) {
        return oy + r * tile + tile / 2;
    }

    function drawMaze(ox, oy, tile) {
        const inset = tile * 0.12;
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (grid[r][c] !== "#") continue;
                const px = ox + c * tile + inset;
                const py = oy + r * tile + inset;
                const s = tile - inset * 2;
                renderer.roundedRect(px, py, s, s, tile * 0.28, theme.wall);
                // Subtle top highlight so walls read with depth in every theme.
                renderer.roundedRect(px, py, s, Math.max(1, s * 0.32), tile * 0.28, renderer.withAlpha(theme.wallEdge, 40));
            }
        }
    }

    function drawPellets(ox, oy, tile) {
        const pulse = 0.5 + 0.5 * Math.sin(game.anim * 5);
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const cell = grid[r][c];
                if (cell === ".") {
                    renderer.circle(cellX(ox, c, tile), cellY(oy, r, tile), Math.max(1, tile * 0.1), theme.pellet);
                } else if (cell === "o") {
                    const rad = tile * (0.22 + 0.06 * pulse);
                    renderer.circle(cellX(ox, c, tile), cellY(oy, r, tile), rad, theme.power);
                }
            }
        }
    }

    function drawChomp(ox, oy, tile) {
        const chomp = game.chomp;
        const cx = cellX(ox, chomp.px, tile);
        const cy = cellY(oy, chomp.py, tile);
        const rad = tile * 0.42;
        renderer.circle(cx, cy, rad, theme.chomp);

        // Mouth: a background-coloured wedge faked with a thick stroke from the
        // centre toward the facing direction, opening and closing as it chomps.
        const open = game.state === "playing" ? 0.5 + 0.5 * Math.sin(chomp.mouth) : 0.2;
        const dir = chomp.dir.x === 0 && chomp.dir.y === 0 ? DIRS.left : chomp.dir;
        renderer.beginPath();
        renderer.strokeColor(theme.bg);
        renderer.strokeWidth(rad * open);
        renderer.moveTo(cx, cy);
        renderer.lineTo(cx + dir.x * rad * 1.05, cy + dir.y * rad * 1.05);
        renderer.stroke();
    }

    function drawGhost(g, ox, oy, tile) {
        const cx = cellX(ox, g.px, tile);
        const cy = cellY(oy, g.py, tile);
        const rad = tile * (g.mini ? 0.28 : 0.42); // split minis are visibly smaller
        const bx = cx - rad;
        const by = cy - rad;
        const size = rad * 2;

        // Elite aura: a ring under the ghost in its affix tint.
        if (g.affix) {
            const e = ELITES.find((el) => el.id === g.affix);
            if (e) {
                const tint = renderer.color(e.tint[0], e.tint[1], e.tint[2]);
                renderer.circle(cx, cy, rad * 1.25, renderer.withAlpha(tint, 70));
                renderer.circle(cx, cy, rad * 1.05, renderer.withAlpha(tint, 45));
            }
        }

        let body = g.color;
        let showBody = true;
        if (g.mode === "fright") {
            const flashing = game.frightTimer < 2 && Math.floor(game.frightTimer * 6) % 2 === 0;
            body = flashing ? theme.frightFlash : theme.fright;
        } else if (g.mode === "eyes") {
            showBody = false;
        }

        if (showBody) {
            // Rounded dome on top, flatter feet at the bottom.
            renderer.roundedRectVarying(bx, by, size, size, rad, rad, rad * 0.35, rad * 0.35, body);
        }

        // Eyes (hidden while frightened: classic blue face instead).
        if (g.mode === "fright") {
            const fc = Math.floor(game.frightTimer * 6) % 2 === 0 && game.frightTimer < 2 ? theme.fright : theme.frightFace;
            renderer.circle(cx - rad * 0.35, cy - rad * 0.1, rad * 0.16, fc);
            renderer.circle(cx + rad * 0.35, cy - rad * 0.1, rad * 0.16, fc);
        } else {
            const ex = rad * 0.34;
            const ey = -rad * 0.12;
            const er = rad * 0.3;
            const pr = rad * 0.16;
            const lookX = g.dir.x * er * 0.4;
            const lookY = g.dir.y * er * 0.4;
            renderer.circle(cx - ex, cy + ey, er, theme.eyeWhite);
            renderer.circle(cx + ex, cy + ey, er, theme.eyeWhite);
            renderer.circle(cx - ex + lookX, cy + ey + lookY, pr, theme.pupil);
            renderer.circle(cx + ex + lookX, cy + ey + lookY, pr, theme.pupil);
        }
    }

    // Teleport pads: a linked pair of rings in the accent colour.
    function drawPads(ox, oy, tile) {
        if (!game.pads) return;
        for (const p of game.pads) {
            const cx = cellX(ox, p.c, tile);
            const cy = cellY(oy, p.r, tile);
            renderer.circle(cx, cy, tile * 0.34, renderer.withAlpha(theme.accent, 60));
            renderer.circle(cx, cy, tile * 0.18, theme.accent);
        }
    }

    // Fruit (accent dot), crate (panel square with a "?"), runner (small sprite).
    function drawSpawns(ox, oy, tile) {
        for (const s of game.spawns) {
            const sc = s.px !== undefined ? s.px : s.c;
            const sr = s.py !== undefined ? s.py : s.r;
            const cx = cellX(ox, sc, tile);
            const cy = cellY(oy, sr, tile);
            if (s.kind === "fruit") {
                renderer.circle(cx, cy, tile * 0.3, theme.danger);
                renderer.circle(cx, cy - tile * 0.28, tile * 0.1, theme.win);
            } else if (s.kind === "crate") {
                const q = tile * 0.32;
                renderer.roundedRect(cx - q, cy - q, q * 2, q * 2, tile * 0.14, theme.power);
                renderer.text("productsans-bold", TEXT.crateMark, cx - q * 0.4, cy, tile * 0.6, theme.bg);
            } else if (s.kind === "runner") {
                renderer.circle(cx, cy, tile * 0.28, theme.win);
                renderer.circle(cx - tile * 0.1, cy - tile * 0.05, tile * 0.06, theme.bg);
                renderer.circle(cx + tile * 0.1, cy - tile * 0.05, tile * 0.06, theme.bg);
            }
        }
    }

    // Small chips for the active Chomp effects, shield charge and the live event —
    // a text label plus a seconds readout. The Task-9 juice (pops, floating score,
    // combo pops, the danger edge) is additive; these chips stay as the precise,
    // always-legible readout of exactly what is active and for how long.
    function drawEffectChips(x, y, w, hud) {
        const chips = [];
        for (const e of game.effects) chips.push({ label: e.id.toUpperCase(), t: e.timeLeft, col: theme.accent });
        if (game.shield > 0) chips.push({ label: TEXT.shieldChip(game.shield), t: null, col: theme.win });
        if (game.event) {
            const ev = EVENTS.find((e) => e.id === game.event.id);
            chips.push({ label: ev ? ev.name : game.event.id, t: game.event.timeLeft, col: theme.danger });
        }
        if (chips.length === 0) return;
        const cy = y + hud + hud * 0.5;
        const fs = hud * 0.4;
        let cx = x + 12;
        for (const chip of chips) {
            const txt = chip.t != null ? chip.label + " " + chip.t.toFixed(1) : chip.label;
            const tw = renderer.textWidth("productsans-medium", txt, fs);
            renderer.roundedRect(cx, cy - fs * 0.7, tw + fs, fs * 1.5, fs * 0.4, renderer.withAlpha(chip.col, 40));
            renderer.text("productsans-medium", txt, cx + fs * 0.5, cy, fs, chip.col);
            cx += tw + fs * 1.8;
        }
    }

    function drawHud(x, y, w, hud) {
        renderer.roundedRect(x + 6, y + 4, w - 12, hud - 4, 8, theme.panel);
        const fy = y + hud / 2;
        renderer.text("productsans-bold", TEXT.scorePrefix + game.score, x + 14, fy, hud * 0.55, theme.text);

        // Current theme name, centred and dimmed — proof the theme is applied.
        const tn = themeName.toUpperCase();
        const tnw = renderer.textWidth("productsans-medium", tn, hud * 0.42);
        renderer.text("productsans-medium", tn, x + (w - tnw) / 2, fy, hud * 0.42, theme.dim);

        // Lives as little chomp circles on the right.
        const r = hud * 0.26;
        let lx = x + w - 16 - r;
        for (let i = 0; i < game.lives; i++) {
            renderer.circle(lx, fy, r, theme.chomp);
            lx -= r * 2.6;
        }
    }

    function drawBanner(x, y, w, h) {
        let msg = null;
        let col = theme.accent;
        if (game.state === "ready") {
            msg = game.banner || TEXT.ready; // the round banner, else the countdown
        } else if (game.state === "paused") {
            msg = TEXT.paused;
            col = theme.dim;
        } else if (game.state === "dying") {
            msg = game.deathLine || TEXT.deaths[0]; // OOF. / CAUGHT. / SQUISHED.
            col = theme.danger;
        } else if (game.banners.length) {
            // Mid-play event / pickup banner — only the front of the queue shows, so
            // banners never overlap; each dwells its full window before the next.
            msg = game.banners[0].text;
            col = game.banners[0].color;
        }
        if (!msg) return;

        let size = Math.min(h * 0.16, w * 0.12);
        const maxW = w * 0.9;
        let tw = renderer.textWidth("productsans-bold", msg, size);
        if (tw > maxW) {
            size *= maxW / tw; // shrink the long "ROUND N — THEME" banner to fit
            tw = renderer.textWidth("productsans-bold", msg, size);
        }
        // The round banner slides in from the left as the maze fades up.
        const slide = game.state === "ready" ? (1 - introProgress()) * w * 0.35 : 0;
        const tx = x + (w - tw) / 2 - slide;
        const ty = y + h * 0.5;
        renderer.text("productsans-bold", msg, tx, ty, size, col);
    }

    // The perk draft — one renderer for both surfaces. A scrim, a title, a row of
    // cards (the selected one lit, cursed ones in the danger colour with their
    // curse spelled out), and the control hint.
    function drawDraft(x, y, w, h) {
        const d = game.draft;
        renderer.roundedRect(x, y, w, h, 10, renderer.withAlpha(theme.bg, 225)); // freeze-frame scrim
        if (!d || !d.cards.length) return;

        const title = TEXT.draftTitle;
        let ts = Math.min(h * 0.07, w * 0.05);
        let ttw = renderer.textWidth("productsans-bold", title, ts);
        if (ttw > w * 0.9) {
            ts *= (w * 0.9) / ttw;
            ttw = renderer.textWidth("productsans-bold", title, ts);
        }
        renderer.text("productsans-bold", title, x + (w - ttw) / 2, y + h * 0.16, ts, theme.win);

        const n = d.cards.length;
        const gap = w * 0.025;
        const cardW = Math.min(w * 0.27, (w * 0.92 - gap * (n - 1)) / n);
        const cardH = h * 0.5;
        const totalW = cardW * n + gap * (n - 1);
        let cx = x + (w - totalW) / 2;
        const cy = y + h * 0.26;
        for (let i = 0; i < n; i++) {
            const card = d.cards[i];
            const sel = i === d.sel;
            const accent = card.cursed ? theme.danger : theme.accent;
            const pad = cardW * 0.1;
            renderer.roundedRect(cx, cy, cardW, cardH, cardH * 0.07, renderer.withAlpha(theme.panel, sel ? 255 : 150));
            if (sel) renderer.roundedRect(cx, cy, cardW, cardH * 0.05, cardH * 0.025, accent); // selected: lit top bar

            const ns = cardW * 0.13;
            renderer.text("productsans-bold", card.name, cx + pad, cy + cardH * 0.2, ns, accent);
            const ds = cardW * 0.088;
            renderer.text("productsans-medium", card.desc, cx + pad, cy + cardH * 0.42, ds, theme.text);
            if (card.cursed) {
                renderer.text("productsans-bold", TEXT.cursed, cx + pad, cy + cardH * 0.66, ds, theme.danger);
                renderer.text("productsans-medium", card.curseDesc, cx + pad, cy + cardH * 0.82, ds * 0.95, theme.danger);
            }
            cx += cardW + gap;
        }

        const hint = TEXT.draftHint;
        const hs = ts * 0.5;
        const hw = renderer.textWidth("productsans-medium", hint, hs);
        renderer.text("productsans-medium", hint, x + (w - hw) / 2, y + h * 0.88, hs, theme.dim);
    }

    // ---- Task 8 screens --------------------------------------------------------
    // Shared: draw `text` centred on cx, shrinking to fit maxW.
    function drawCenteredText(font, text, cx, cy, size, color, maxW) {
        let s = size;
        let tw = renderer.textWidth(font, text, s);
        if (maxW && tw > maxW) {
            s *= maxW / tw;
            tw = renderer.textWidth(font, text, s);
        }
        renderer.text(font, text, cx - tw / 2, cy, s, color);
    }

    // Start screen (round 1, pre-input): title, top-3 scores, the lifetime line,
    // the theme-unlock count, and the prompt. Storage absent -> "this session only".
    function drawStartScreen(x, y, w, h) {
        renderer.roundedRect(x, y, w, h, 10, renderer.withAlpha(theme.bg, 225));
        const cx = x + w / 2;
        const maxW = w * 0.9;
        const ls = Math.min(h * 0.045, w * 0.05);

        drawCenteredText("productsans-bold", TEXT.title, cx, y + h * 0.2, Math.min(h * 0.14, w * 0.16), theme.accent, maxW);

        let ly = y + h * 0.36;
        const top = game.highscores ? game.highscores.entries.slice(0, 3) : [];
        drawCenteredText("productsans-bold", top.length ? TEXT.highScores : TEXT.noScores, cx, ly, ls, theme.text, maxW);
        ly += ls * 1.5;
        for (let i = 0; i < top.length; i++) {
            drawCenteredText("productsans-medium", TEXT.scoreRow(i + 1, top[i].s, top[i].r), cx, ly, ls, theme.dim, maxW);
            ly += ls * 1.35;
        }

        const meta = game.meta || { runs: 0, bestRound: 0 };
        ly += ls * 0.3;
        drawCenteredText("productsans-medium", TEXT.runsLine(meta.runs, meta.bestRound), cx, ly, ls * 0.92, theme.dim, maxW);
        ly += ls * 1.35;
        const unlockedThemes = THEMES.filter((t) => !t.locked).length;
        drawCenteredText("productsans-medium", TEXT.themesLine(unlockedThemes, THEMES.length), cx, ly, ls * 0.92, theme.dim, maxW);
        ly += ls * 1.35;
        if (!store) drawCenteredText("productsans-medium", TEXT.sessionOnly, cx, ly, ls * 0.92, theme.danger, maxW);

        drawCenteredText("productsans-bold", TEXT.startPrompt, cx, y + h * 0.88, ls, theme.accent, maxW);
    }

    // Game-over board: the full top-10 (this run lit), crumbs earned, unlocks
    // claimed this run, and — storage absent — the session-only note. A rank-1
    // finish flashes NEW HIGH SCORE (danger <-> accent) in place of the title.
    function drawGameOver(x, y, w, h) {
        renderer.roundedRect(x, y, w, h, 10, renderer.withAlpha(theme.bg, 230));
        const cx = x + w / 2;
        const maxW = w * 0.9;
        const lr = game.lastRun;

        const flash = Math.floor(game.anim * 4) % 2 === 0;
        const titleCol = lr && lr.newHigh ? (flash ? theme.danger : theme.accent) : theme.danger;
        const title = lr && lr.newHigh ? TEXT.newHigh : TEXT.runOver(game.round);
        drawCenteredText("productsans-bold", title, cx, y + h * 0.13, Math.min(h * 0.1, w * 0.11), titleCol, maxW);

        const entries = game.highscores ? game.highscores.entries : [];
        const ls = Math.min(h * 0.04, w * 0.042);
        let ly = y + h * 0.24;
        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const isRun = lr && e === lr.entry;
            const line = TEXT.scoreRow(i + 1, e.s, e.r);
            drawCenteredText(isRun ? "productsans-bold" : "productsans-medium", line, cx, ly, ls, isRun ? theme.accent : theme.dim, maxW);
            ly += ls * 1.3;
        }
        if (entries.length === 0) {
            drawCenteredText("productsans-medium", TEXT.noBoard, cx, ly, ls, theme.dim, maxW);
            ly += ls * 1.3;
        }

        if (lr) {
            ly += ls * 0.4;
            drawCenteredText("productsans-bold", TEXT.crumbs(lr.earned), cx, ly, ls * 1.1, theme.win, maxW);
            ly += ls * 1.5;
            for (const u of lr.claimed) {
                drawCenteredText("productsans-medium", TEXT.unlocked(unlockLabel(u)), cx, ly, ls * 0.95, theme.accent, maxW);
                ly += ls * 1.25;
            }
        }

        if (!store) drawCenteredText("productsans-medium", TEXT.sessionOnly, cx, y + h * 0.9, ls * 0.9, theme.danger, maxW);
        drawCenteredText("productsans-medium", TEXT.playAgain, cx, y + h * 0.95, ls, theme.dim, maxW);
    }

    reset(true);
    return {
        update,
        render,
        input,
        reset,
        state: () => game.state,
        get round() {
            return game.round;
        },
        // Read-only introspection for the harness autoplay bot (and Task 7's draft
        // UI). Never touched by the in-game surfaces.
        snapshot: () => ({
            state: game.state,
            round: game.round,
            score: game.score,
            lives: game.lives,
            pelletsLeft,
            chomp: { c: Math.round(game.chomp.px), r: Math.round(game.chomp.py), dir: game.chomp.dir },
            mutator: game.mutator,
            ghosts: game.ghosts.map((g) => ({ c: Math.round(g.px), r: Math.round(g.py), mode: g.mode, affix: g.affix || null, mini: !!g.mini })),
        }),
        // Test-only surface, gated so the in-game build never sees it. Lets the
        // harness force-spawn a specific pickup/event, jump rounds and read the
        // Task-6 internals it needs to assert on.
        ...(typeof globalThis !== "undefined" && globalThis.__CHOMP_TEST__
            ? {
                  __test: {
                      state: game,
                      constants: { BANNER_TIME, PAD_COOLDOWN, EVENT_MIN, EVENT_SPAN },
                      forceEvent: (id) => triggerEvent(EVENTS.find((e) => e.id === id)),
                      // Drop a crate resolved to a specific pickup at Chomp's tile.
                      forcePickup: (id, cell) => {
                          const t = cell || tileOf(game.chomp);
                          spawnCrate({ c: t.c, r: t.r }, id);
                      },
                      spawnFruit: (cell) => spawnFruit(cell),
                      spawnCrate: (cell, forced) => spawnCrate(cell, forced),
                      spawnRunner: (cell) => spawnRunner(cell),
                      applyPickup: (id) => applyPickup(id),
                      // Empty the board so the next playing update opens the draft.
                      forceClear: () => {
                          pelletsLeft = 0;
                      },
                      setChompTile: (c, r) => {
                          game.chomp.px = c;
                          game.chomp.py = r;
                          game.chomp.padCd = 0;
                      },
                      setGhost: (i, c, r, mode) => {
                          const g = game.ghosts[i];
                          g.px = c;
                          g.py = r;
                          if (mode) g.mode = mode;
                          g.padCd = 0;
                      },
                      // ---- Task 7 test seams ----
                      // Read the folded knobs / stacks; set perk & curse stacks and refold.
                      knobs: () => game.knobs,
                      perks: () => game.perks,
                      curses: () => game.curses,
                      setPerks: (perks, curses) => {
                          game.perks = perks || {};
                          game.curses = curses || {};
                          return applyPerks();
                      },
                      recomputeKnobs: () => applyPerks(),
                      // ---- Task 8 test seams ----
                      hasStore: () => store !== null,
                      meta: () => game.meta,
                      highscores: () => game.highscores,
                      lastRun: () => game.lastRun,
                      recordRun: () => recordRun(),
                      onStartScreen: () => onStartScreen(),
                      startdraftUnlocked: () => game.startdraftUnlocked,
                      bulldozerCharges: () => game.bulldozerCharges,
                      applyRoundStart: () => applyRoundStartPerks(),
                      // What is actually persisted right now (re-read through the wrapper).
                      persistedMeta: () => loadMeta(),
                      persistedHighscores: () => loadHighscores(),
                      unlockedPerkIds: () => PERKS.filter((p) => !p.locked).map((p) => p.id),
                      unlockedThemeIds: () => THEMES.filter((t) => !t.locked).map((t) => t.id),
                      // Refill the shuffle bag from the currently-unlocked themes and
                      // report its ids — proves an unlocked theme joins the bag.
                      refillThemeBagIds: () => {
                          refillThemeBag();
                          return themeBag.map((t) => t.id);
                      },
                      // Build a fresh (seeded) draft and report its perk ids.
                      draftPerkIds: () => {
                          buildDraft();
                          return game.draft.cards.map((c) => c.perkId);
                      },
                      // Draft: build one (seeded), read it, or inject a specific pick.
                      buildDraft: () => {
                          buildDraft();
                          return game.draft;
                      },
                      draft: () => game.draft,
                      draftPick: (id, cursed, curseId) => applyDraftPick({ perkId: id, cursed: !!cursed, curseId: curseId || null }),
                      // Force this round's mutator (refolds knobs so goldrush/rushhour land).
                      setMutator: (id) => {
                          game.mutator = id || null;
                          return applyPerks();
                      },
                      // Force an elite affix onto a ghost, resetting its per-affix state.
                      setAffix: (i, id) => {
                          const g = game.ghosts[i];
                          g.affix = id || null;
                          g.tankBites = 0;
                          g.eatCd = 0;
                          g.phaseClip = 0;
                          g.phaseCd = 7;
                      },
                      // Clean playing round at N (optionally forcing a mutator), so the
                      // harness can test round-gated features directly.
                      jumpToRound: (n, mutator) => {
                          game.round = n;
                          game.ambusherId = n >= 5 ? 1 + ((Math.random() * 3) | 0) : -1;
                          game.mutator = mutator !== undefined ? mutator || null : null;
                          applyPerks();
                          newMaze();
                          clearEphemeral(false);
                          game.eventTimer = EVENT_MIN + EVENT_SPAN * 0.5;
                          initModeClock();
                          placeEntities();
                          assignElites();
                          applyRoundStartPerks();
                          game.frightTimer = 0;
                          game.eatChain = 0;
                          game.banner = null;
                          game.state = "playing";
                          game.timer = 0;
                      },
                  },
              }
            : {}),
    };
}

// =============================================================================
//  Surface 1 — the command palette view (uses the `palette` API).
// =============================================================================
const paletteGame = createGame();

palette.createView({
    id: "chomp",
    title: "Chomp",
    description: "Play Chomp in the command palette",
    placeholder: "Chomp — " + TEXT.controls,
    footer: [
        { key: "← ↑ → ↓ / WASD", label: "Move" },
        { key: "P", label: "Pause" },
        { key: "R", label: "Restart" },
        { key: "Enter", label: "Start" },
    ],
    render: function (x, y, w, h, dt) {
        paletteGame.update(dt);
        paletteGame.render(x, y, w, h);
    },
    keyPressed: function (keyCode, _mods) {
        paletteGame.input(keyCode);
        return true;
    },
});

// =============================================================================
//  Surface 2 — the fullscreen overlay module (zero new client APIs).
//  Enable the module to play over the HUD; arrow keys steer via keyPress.
// =============================================================================
script.registerModule(
    {
        name: "Chomp",
        description: "Play Chomp as a fullscreen overlay. " + TEXT.controls + ".",
    },
    function (module) {
        module.addBool("Open in palette", true);

        const overlayGame = createGame();
        let lastMs = null;

        module.on("enable", function () {
            lastMs = null;
            if (module.getBool("Open in palette")) {
                // Prefer the richer palette surface when asked; the palette view
                // owns paletteGame, so don't reset the overlay's shared maze out
                // from under a mid-run palette game.
                palette.openView("chomp");
            } else {
                overlayGame.reset(true);
                notify(TEXT.controls);
            }
        });

        module.on("renderScreen", function () {
            if (module.getBool("Open in palette")) return; // palette view is driving

            // Wall-clock delta in seconds (falls back to a fixed step).
            let dt = 1 / 60;
            if (typeof Date !== "undefined" && Date.now) {
                const now = Date.now();
                if (lastMs !== null) dt = (now - lastMs) / 1000;
                lastMs = now;
            }
            overlayGame.update(dt);

            const sw = client.getScaledWidth();
            const sh = client.getScaledHeight();
            const size = Math.min(sw, sh) * 0.78;
            const bx = (sw - size) / 2;
            const by = (sh - size) / 2;

            renderer.shadow(bx, by, size, size, 14, 40, 0, 8, renderer.color(0, 0, 0, 150));
            overlayGame.render(bx, by, size, size);
        });

        module.on("keyPress", function (event) {
            if (module.getBool("Open in palette")) return;
            overlayGame.input(event.getCode());
        });
    },
);

// =============================================================================
//  Test hook — exposes the pure engine to the node harness (see chomp-harness).
//  Only present when a test sets globalThis.__CHOMP_TEST__; never in-game.
// =============================================================================
if (typeof globalThis !== "undefined" && globalThis.__CHOMP_TEST__) {
    globalThis.__chomp_test = {
        createGame,
        generateMaze,
        difficulty,
        THEMES,
        mulberry32,
        EVENTS,
        PICKUPS,
        PERKS,
        CURSES,
        ELITES,
        MUTATORS,
        UNLOCKS,
        // Engine views onto the current maze for the harness autoplay bot.
        ROWS,
        COLS,
        DIRS,
        isWall,
        grid: () => grid,
        pelletsLeft: () => pelletsLeft,
        themeName: () => themeName,
        tunnelRows: () => tunnelRows,
    };
}

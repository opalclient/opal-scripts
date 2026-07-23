// =============================================================================
//  game/config.ts — copy, colour themes, and the difficulty curve.
// =============================================================================
//
//  The three data surfaces the whole game reads through: the TEXT table (every
//  player-facing string), the THEMES set (14 colour schemes, packed to ARGB ints
//  via renderer.color at load), and difficulty(round) — the SINGLE home of every
//  per-round curve constant. Uses the ambient `renderer` global to pack colours;
//  it imports no engine module.
// =============================================================================

// A colour as an [r, g, b] triple, before it is packed to an ARGB int.
export type Rgb = [number, number, number];

function clamp8(v: number): number {
    return Math.max(0, Math.min(255, Math.round(v)));
}

function shade(rgb: Rgb, f: number): Rgb {
    return [clamp8(rgb[0] * f), clamp8(rgb[1] * f), clamp8(rgb[2] * f)];
}

// A theme spec supplies the signature colours; mk() fills the rest, and any spec
// key may override a derived default.
export interface ThemeSpec {
    id: string;
    name: string;
    locked?: boolean;
    bg: Rgb;
    panel?: Rgb;
    wall: Rgb;
    wallEdge?: Rgb;
    pellet: Rgb;
    power?: Rgb;
    chomp?: Rgb;
    text?: Rgb;
    dim?: Rgb;
    accent: Rgb;
    fright?: Rgb;
    frightFlash?: Rgb;
    frightFace?: Rgb;
    eyeWhite?: Rgb;
    pupil?: Rgb;
    danger?: Rgb;
    win?: Rgb;
    ghostColors: Rgb[];
}

// A full colour set as ARGB ints — what the renderer reads through the module's
// active theme.
export interface ThemeColors {
    bg: number;
    panel: number;
    wall: number;
    wallEdge: number;
    pellet: number;
    power: number;
    chomp: number;
    text: number;
    dim: number;
    accent: number;
    fright: number;
    frightFlash: number;
    frightFace: number;
    eyeWhite: number;
    pupil: number;
    danger: number;
    win: number;
    ghostColors: number[];
}

export interface Theme {
    id: string;
    name: string;
    locked: boolean;
    colors: ThemeColors;
}

// Build a full ARGB colour set from a spec: signature colours packed directly,
// the rest derived (a couple shaded toward the palette, fright/eye colours near
// universal), with any spec key overriding its default. Colours pack through
// renderer.color() so they become valid ARGB ints — never raw 0xAARRGGBB
// literals (JS doubles above 2^31 truncate wrong).
function mk(spec: ThemeSpec): ThemeColors {
    const col = (a: Rgb): number => renderer.color(a[0], a[1], a[2]);
    return {
        bg: col(spec.bg),
        panel: col(spec.panel ?? shade(spec.bg, 2.0)),
        wall: col(spec.wall),
        wallEdge: col(spec.wallEdge ?? shade(spec.wall, 1.5)),
        pellet: col(spec.pellet),
        power: col(spec.power ?? spec.accent),
        chomp: col(spec.chomp ?? spec.accent),
        text: col(spec.text ?? [244, 244, 250]),
        dim: col(spec.dim ?? [150, 150, 170]),
        accent: col(spec.accent),
        fright: col(spec.fright ?? [36, 60, 210]),
        frightFlash: col(spec.frightFlash ?? [232, 232, 248]),
        frightFace: col(spec.frightFace ?? [245, 230, 130]),
        eyeWhite: col(spec.eyeWhite ?? [248, 248, 255]),
        pupil: col(spec.pupil ?? [28, 28, 64]),
        danger: col(spec.danger ?? [255, 96, 96]),
        win: col(spec.win ?? [120, 235, 150]),
        ghostColors: spec.ghostColors.map(col),
    };
}

// 10 base themes ship unlocked; 4 more carry `locked` and open via meta.
const THEME_SPECS: ThemeSpec[] = [
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
        ghostColors: [
            [255, 70, 70],
            [255, 173, 205],
            [80, 220, 235],
            [255, 176, 76],
        ],
    },
    {
        id: "neon",
        name: "Neon",
        bg: [8, 4, 20],
        wall: [190, 40, 255],
        pellet: [120, 255, 220],
        accent: [57, 255, 20],
        chomp: [57, 255, 20],
        ghostColors: [
            [255, 40, 200],
            [160, 255, 60],
            [60, 240, 255],
            [255, 240, 60],
        ],
    },
    {
        id: "inferno",
        name: "Inferno",
        bg: [20, 4, 2],
        wall: [214, 64, 20],
        pellet: [255, 180, 120],
        accent: [255, 120, 40],
        chomp: [255, 200, 90],
        ghostColors: [
            [255, 80, 40],
            [255, 140, 50],
            [220, 40, 20],
            [255, 190, 90],
        ],
    },
    {
        id: "glacier",
        name: "Glacier",
        bg: [4, 10, 22],
        wall: [60, 140, 220],
        pellet: [200, 235, 255],
        accent: [140, 220, 255],
        chomp: [200, 240, 255],
        ghostColors: [
            [120, 200, 255],
            [200, 235, 255],
            [80, 150, 230],
            [150, 220, 250],
        ],
    },
    {
        id: "toxic",
        name: "Toxic",
        bg: [6, 14, 4],
        wall: [60, 180, 40],
        pellet: [210, 255, 140],
        accent: [170, 255, 60],
        chomp: [200, 255, 90],
        ghostColors: [
            [120, 230, 60],
            [180, 255, 80],
            [80, 200, 50],
            [220, 255, 120],
        ],
    },
    {
        id: "vaporwave",
        name: "Vaporwave",
        bg: [16, 6, 24],
        wall: [255, 110, 199],
        pellet: [160, 220, 255],
        accent: [255, 180, 240],
        chomp: [120, 240, 240],
        ghostColors: [
            [255, 120, 200],
            [120, 230, 230],
            [255, 160, 240],
            [140, 200, 255],
        ],
    },
    {
        id: "midnight",
        name: "Midnight",
        bg: [2, 2, 8],
        wall: [40, 40, 90],
        pellet: [180, 180, 220],
        accent: [120, 120, 255],
        chomp: [170, 170, 245],
        ghostColors: [
            [120, 110, 200],
            [150, 140, 220],
            [90, 80, 170],
            [170, 160, 235],
        ],
    },
    {
        id: "matrix",
        name: "Matrix",
        bg: [0, 8, 0],
        wall: [0, 140, 60],
        pellet: [120, 255, 120],
        accent: [0, 255, 90],
        chomp: [120, 255, 150],
        ghostColors: [
            [0, 200, 80],
            [60, 255, 120],
            [0, 150, 60],
            [120, 255, 150],
        ],
    },
    {
        id: "sunset",
        name: "Sunset",
        bg: [18, 8, 14],
        wall: [230, 120, 60],
        pellet: [255, 220, 160],
        accent: [255, 170, 90],
        chomp: [255, 210, 120],
        ghostColors: [
            [255, 150, 80],
            [200, 110, 200],
            [255, 190, 110],
            [230, 130, 160],
        ],
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
        ghostColors: [
            [200, 40, 50],
            [160, 20, 30],
            [230, 70, 80],
            [120, 10, 20],
        ],
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
        ghostColors: [
            [80, 255, 180],
            [120, 200, 255],
            [200, 120, 255],
            [160, 255, 220],
        ],
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
        ghostColors: [
            [230, 180, 90],
            [255, 210, 120],
            [200, 150, 70],
            [240, 200, 110],
        ],
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
        ghostColors: [
            [40, 160, 200],
            [80, 220, 230],
            [30, 120, 180],
            [120, 230, 240],
        ],
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
        ghostColors: [
            [180, 180, 190],
            [140, 140, 150],
            [210, 210, 220],
            [110, 110, 120],
        ],
    },
];

// Active-theme wiring (the shuffle bag, the module-level active theme) lives in
// W4's config consumption; this file owns the built, ready-to-read set.
export const THEMES: Theme[] = THEME_SPECS.map((s) => ({
    id: s.id,
    name: s.name,
    locked: !!s.locked,
    colors: mk(s),
}));

// Player-facing copy. Every string a surface can show lives HERE. Entries that
// need a value are tiny formatters, so the fold stays a lookup, not scattered
// concatenation. Event/pickup banner labels stay in their own tables (see
// content.ts), reached by variable, never as a literal in a draw path.
export const TEXT = {
    title: "CHOMP",
    ready: "READY!",
    paused: "PAUSED",
    secondWind: "SECOND WIND!",
    deaths: ["OOF.", "CAUGHT.", "SQUISHED."], // rotate one per lost life

    // Shared control hint, reused by the palette placeholder, the module
    // description, and the enable toast so the three never drift apart.
    controls: "Arrows/WASD move · P pause · R restart · Space start",

    scorePrefix: "SCORE ",
    shieldChip: (n: number): string => `SHIELD ×${n}`,

    // "ROUND 7 — INFERNO" (+ mutator: "ROUND 7 — INFERNO · FOG").
    roundBanner: (round: number, themeUpper: string, mutName: string | null): string =>
        `ROUND ${round} — ${themeUpper}${mutName ? ` · ${mutName}` : ""}`,

    draftTitle: "ROUND CLEAR — CHOOSE A PERK",
    cursed: "CURSED",
    crateMark: "?",
    draftHint: "← → select · enter confirm",

    highScores: "HIGH SCORES",
    noScores: "NO SCORES YET",
    runsLine: (runs: number, best: number): string => `${runs}${runs === 1 ? " run" : " runs"} · best round ${best}`,
    themesLine: (open: number, total: number): string => `${open} / ${total} themes unlocked`,
    sessionOnly: "this session only",
    startPrompt: "press a direction to start",

    newHigh: "NEW HIGH SCORE",
    runOver: (round: number): string => `RUN OVER — ROUND ${round}`,
    crumbs: (n: number): string => `+${n} crumbs`,
    unlocked: (label: string): string => `unlocked ${label}`,
    noBoard: "no scores recorded",
    scoreRow: (rank: number, s: number, r: number): string => `${rank}.   ${s}   ·  R${r}`,
    playAgain: "enter to play again",
    restartConfirm: "again? R to confirm",

    // Juice pops.
    combo: (n: number): string => `×${n}!`,
    gain: (n: number): string => `+${n}`,

    // Toasts (lower-case, they sit next to the app name).
    toastHigh: "new high score",
    toastTop: "top 10",
    toastUnlock: (label: string): string => `unlocked ${label}`,
};

// The curve values every per-round scaling number reads through.
export interface Difficulty {
    ghostSpeed: number;
    chompSpeed: number;
    frightTime: number;
    mistakeRate: number;
    scatterTime: number;
    chaseTime: number;
    eyesSpeed: number;
    knockRate: number;
}

// The SINGLE source of every per-round scaling number. Pure: same round in, same
// table out. `n` = steps since round 1; `over` = the extra ramp past round 12.
export function difficulty(round: number): Difficulty {
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

// =============================================================================
//  game/content.ts — the roguelite content tables.
// =============================================================================
//
//  PERKS / CURSES / ELITES / MUTATORS / EVENTS / PICKUPS / UNLOCKS as PURE DATA
//  — no per-entry engine branching. A perk/curse carries a `mod` that mutates
//  exactly one Knob; the engine reads only the folded Knobs object (see
//  applyPerks in W4's state.ts). Elite/mutator/event/pickup entries carry an
//  `id` the loop branches on, one place each. `time: 0` event/pickup entries are
//  one-shots (armed flags), not durations.
// =============================================================================

// The folded per-round numbers a run's perks/curses/mutators bend. difficulty()
// seeds the curve fields; the baselines and stateful flags start here. This is
// the single object every `mod` writes and the engine reads.
export interface Knobs {
    // From the difficulty curve — perks/curses bend these.
    chompSpeed: number;
    ghostSpeed: number;
    frightTime: number;
    scatterTime: number;
    chaseTime: number;
    eyesSpeed: number;
    // Baseline knobs.
    scoreMult: number;
    pelletValue: number;
    chainMult: number;
    ghostFlat: number;
    magnetRadius: number;
    cornerGrace: number;
    crateLuck: number;
    extraPower: number;
    roundShield: number;
    bonusLife: number;
    tunnelBoost: number;
    tunnelToll: number;
    fruitLife: number;
    runnerSpeed: number;
    extraElite: number;
    draftSize: number;
    bankRate: number;
    // Stateful perks (locked/centralised) — read in exactly one place each.
    secondWind: boolean;
    vampire: boolean;
    headStart: number;
    bulldozer: number;
}

export interface GameEvent {
    id: string;
    name: string;
    hostile: boolean;
    time: number;
}

// Ghost events. `time: 0` entries are one-shots (armed flags), not durations.
export const EVENTS: GameEvent[] = [
    { id: "rush", name: "RUSH!", hostile: true, time: 6 }, // ghosts x1.3 speed while active
    { id: "phase", name: "PHANTOM!", hostile: true, time: 3 }, // one random ghost ignores walls (in bounds, not the pen)
    { id: "revive", name: "NO REST!", hostile: true, time: 10 }, // eaten ghosts respawn at the pen instantly
    { id: "frenzy", name: "FRENZY!", hostile: true, time: 0 }, // one-shot: next power pellet scores, no fright
    { id: "blind", name: "LIGHTS OUT!", hostile: false, time: 4 }, // ghosts random-walk while active
    { id: "chill", name: "COLD SNAP!", hostile: false, time: 0 }, // one-shot: next power pellet also freezes ghosts 2 s
];

export interface Pickup {
    id: string;
    name: string;
    time: number;
    minRound?: number;
}

export const PICKUPS: { good: Pickup[]; bad: Pickup[] } = {
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

export interface Perk {
    id: string;
    name: string;
    desc: string;
    mod: (m: Knobs) => void;
    locked?: boolean;
}

// Every perk mutates exactly ONE named knob. Six carry `locked: true` and open
// via the meta layer. Stacking a perk = its mod applied once per stack.
export const PERKS: Perk[] = [
    { id: "fleet", name: "Fleet Feet", desc: "Move 6% faster.", mod: (m) => (m.chompSpeed *= 1.06) },
    { id: "fright+", name: "Long Dread", desc: "Fright lasts 2s longer.", mod: (m) => (m.frightTime += 2) },
    { id: "shield", name: "Bubble", desc: "Start each round with a shield.", mod: (m) => (m.roundShield += 1) },
    { id: "magnet+", name: "Crumb Magnet", desc: "Pull pellets from further away.", mod: (m) => (m.magnetRadius += 1) },
    { id: "combo+", name: "Greed", desc: "All score +25%.", mod: (m) => (m.scoreMult += 0.25) },
    { id: "pellet+", name: "Fat Pellets", desc: "Pellets worth +5.", mod: (m) => (m.pelletValue += 5) },
    { id: "chain+", name: "Ghost Gourmet", desc: "Ghost chains worth 50% more.", mod: (m) => (m.chainMult *= 1.5) },
    { id: "life", name: "Spare Heart", desc: "One more life, right now.", mod: (m) => (m.bonusLife += 1) },
    { id: "tunnel", name: "Wind Tunnel", desc: "Tunnels launch you 40% faster.", mod: (m) => (m.tunnelBoost = 1.4) },
    { id: "grace", name: "Drift King", desc: "Corner earlier.", mod: (m) => (m.cornerGrace += 0.08) },
    { id: "fruity", name: "Ripe Luck", desc: "Fruit lingers 50% longer.", mod: (m) => (m.fruitLife *= 1.5) },
    { id: "wind", name: "Second Wind", desc: "Cheat death once per run.", mod: (m) => (m.secondWind = true) },
    { id: "sloweyes", name: "Tired Eyes", desc: "Eaten ghosts crawl home.", mod: (m) => (m.eyesSpeed *= 0.75) },
    { id: "scatter+", name: "Stage Fright", desc: "Scatter lasts 2s longer.", mod: (m) => (m.scatterTime += 2) },
    { id: "power+", name: "Spice Rack", desc: "+2 power pellets per maze.", mod: (m) => (m.extraPower += 2) },
    { id: "luck", name: "Loaded Dice", desc: "Crates roll good 75% of the time.", mod: (m) => (m.crateLuck = 0.75) },
    { id: "slowrun", name: "Lead Boots", desc: "The runner tires quicker.", mod: (m) => (m.runnerSpeed *= 0.7) },
    { id: "tax", name: "Ghost Tax", desc: "+100 per ghost eaten.", mod: (m) => (m.ghostFlat += 100) },
    {
        id: "start",
        name: "Head Start",
        desc: "Rounds open with ghosts frozen 3s.",
        mod: (m) => (m.headStart = 3),
        locked: true,
    },
    {
        id: "vamp",
        name: "Pellet Vampire",
        desc: "Every 50 pellets: +1s fright.",
        mod: (m) => (m.vampire = true),
        locked: true,
    },
    {
        id: "toll",
        name: "Toll Booth",
        desc: "+50 score per tunnel pass.",
        mod: (m) => (m.tunnelToll += 50),
        locked: true,
    },
    {
        id: "dozer",
        name: "Bulldozer",
        desc: "Once per round, chew through a wall.",
        mod: (m) => (m.bulldozer += 1),
        locked: true,
    },
    { id: "lucky", name: "Lucky Draft", desc: "Drafts offer 4 choices.", mod: (m) => (m.draftSize = 4), locked: true },
    {
        id: "bank",
        name: "Crumb Bank",
        desc: "Round clear: +5% score bonus.",
        mod: (m) => (m.bankRate += 0.05),
        locked: true,
    },
];

export interface Curse {
    id: string;
    desc: string;
    mod: (m: Knobs) => void;
}

// A cursed draft slot pairs its perk (applied TWICE) with one of these, applied
// once. The fold treats a curse exactly like a perk mod.
export const CURSES: Curse[] = [
    { id: "haste", desc: "…but ghosts gain a speed tier.", mod: (m) => (m.ghostSpeed *= 1.08) },
    { id: "dim", desc: "…but fright is halved.", mod: (m) => (m.frightTime *= 0.5) },
    { id: "elite", desc: "…but an extra elite spawns.", mod: (m) => (m.extraElite += 1) },
    {
        id: "stingy",
        desc: "…but pellets are worth half.",
        mod: (m) => (m.pelletValue = Math.max(1, m.pelletValue * 0.5)),
    },
];

export interface Elite {
    id: string;
    name: string;
    tint: [number, number, number];
}

// Elite affixes (round >= 5). The aura ring under the ghost is drawn in `tint`;
// behaviours live in the engine loop, keyed off the affix id.
export const ELITES: Elite[] = [
    { id: "swift", name: "Swift", tint: [255, 255, 255] }, // ×1.2 speed
    { id: "phasing", name: "Phasing", tint: [180, 120, 255] }, // every 7s: 1.5s wall-clip
    { id: "tank", name: "Tank", tint: [120, 200, 255] }, // needs 2 eats in one fright
    { id: "vengeful", name: "Vengeful", tint: [255, 120, 40] }, // +4% speed each ghost eaten (this round)
    { id: "splitter", name: "Splitter", tint: [120, 255, 120] }, // eaten → two 60%-speed minis, 150 pts each
];

export interface Mutator {
    id: string;
    name: string;
}

// Round mutators (round >= 3, one roll, 40% none). The name suffixes the round
// banner. Knob-shaped effects fold through applyPerks; the rest are read where
// they act (maze / ghosts / render).
export const MUTATORS: Mutator[] = [
    { id: "fog", name: "FOG" }, // per-tile dim past a radius from Chomp
    { id: "greedy", name: "GOLD RUSH" }, // pellets ×2 value, ghosts ×1.1 speed
    { id: "dark", name: "BLACKOUT" }, // board darkened except pellets/power, which glow
    { id: "swarm", name: "SWARM" }, // 5th ghost, Blinky targeting, spawns in pen
    { id: "mirror", name: "FUNHOUSE" }, // skip the mirror step: asymmetric maze
    { id: "rushhour", name: "RUSH HOUR" }, // scatterTime = 0 this round
];

export interface Unlock {
    cost: number;
    kind: "perk" | "theme" | "feature";
    id: string;
}

// Meta progression: crumbs are LIFETIME-cumulative (never spent); each threshold
// is checked against the running total, so every run visibly makes progress.
export const UNLOCKS: Unlock[] = [
    { cost: 50, kind: "perk", id: "start" },
    { cost: 80, kind: "theme", id: "aurora" },
    { cost: 120, kind: "perk", id: "vamp" },
    { cost: 180, kind: "theme", id: "sandstorm" },
    { cost: 220, kind: "perk", id: "toll" },
    { cost: 300, kind: "theme", id: "deepsea" },
    { cost: 350, kind: "perk", id: "dozer" },
    { cost: 450, kind: "theme", id: "mono" },
    { cost: 520, kind: "perk", id: "lucky" },
    { cost: 600, kind: "feature", id: "startdraft" }, // pick 1 of 3 perks at run start
    { cost: 750, kind: "perk", id: "bank" },
];

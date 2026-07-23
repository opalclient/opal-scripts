// =============================================================================
//  game/state.ts — createGame: the run/round/draft state machine.
// =============================================================================
//
//  The engine's spine. Owns the game state object and the per-instance vfx
//  system, folds difficulty(round) + the picked perks/curses/mutator into the
//  round's knobs (the single writer of game.knobs), drives the update loop and
//  the reset / soft-reset / next-round flows, routes input, and wires the ai /
//  systems / render / meta modules onto the shared game. Two module-level
//  singletons live off in leaf modules exactly as the original module-level
//  state did: the maze (engine/grid) and the active theme + bag (game/config),
//  both shared across the palette and overlay surfaces.
//
//  Mechanical transplant of Chomp.js's createGame: same numbers, same logic, and
//  crucially the SAME RNG CALL ORDER on both the Math.random and game.fx streams,
//  so the node harness replays byte-for-byte.
// =============================================================================

import { CENTER_COL, type Cell, COLS, type Coord, generateMaze, HOME, inPen, maze, ROWS } from "../engine/grid";
import { canStep, canStepPhase, DIRS, type Dir, isOpposite, move, tileOf, tryCorner } from "../engine/movement";
import { mulberry32 } from "../engine/rng";
import { store } from "../engine/storage";
import { createVfx, SHAKE_DEATH, SHAKE_EAT, type Vfx } from "../engine/vfx";
import { createAi } from "./ai";
import { active, difficulty, pickTheme, refillThemeBag, TEXT, THEMES } from "./config";
import { CURSES, EVENTS, type Knobs, MUTATORS, PERKS, type Unlock } from "./content";
import { loadHighscores, loadMeta, recordRun, syncUnlocks } from "./meta";
import { createRender } from "./render";
import {
    BANNER_TIME,
    createSystems,
    EVENT_MIN,
    EVENT_SPAN,
    FRUIT_LIFE,
    PAD_COOLDOWN,
    PADS_ROUND,
    RUNNER_SPEED,
} from "./systems";

// ---- Shared game types ------------------------------------------------------

export type GameStateName = "ready" | "playing" | "dying" | "draft" | "over" | "paused";
export type ModePhase = "scatter" | "chase";
export type GhostMode = ModePhase | "fright" | "eyes";

export interface Chomp {
    px: number;
    py: number;
    dir: Dir;
    want: Dir;
    mouth: number;
    padCd: number;
    phasing: boolean;
    phaseTiles: number;
    wrappedThisMove: boolean;
}

export interface Ghost {
    id: number;
    px: number;
    py: number;
    dir: Dir;
    want: Dir;
    mode: GhostMode;
    color: number;
    phasing: boolean;
    padCd: number;
    affix: string | null;
    tankBites: number;
    eatCd: number;
    phaseCd: number;
    phaseClip: number;
    mini?: boolean;
    swarm?: boolean;
    wrappedThisMove?: boolean;
}

export interface RunnerSpawn {
    kind: "runner";
    c: number;
    r: number;
    px: number;
    py: number;
    dir: Dir;
    want: Dir;
    life: number;
    padCd: number;
    dead?: boolean;
    wrappedThisMove?: boolean;
}

export interface ItemSpawn {
    kind: "fruit" | "crate";
    c: number;
    r: number;
    life: number;
    forced?: string | null;
    dead?: boolean;
    px?: undefined;
    py?: undefined;
}

export type Spawn = RunnerSpawn | ItemSpawn;

export interface GameEffectState {
    id: string;
    timeLeft: number;
}

export interface ActiveEvent {
    id: string;
    timeLeft: number;
}

export interface Banner {
    text: string;
    color: number;
    timeLeft: number;
}

export interface Card {
    perkId: string;
    name: string;
    desc: string;
    cursed: boolean;
    curseId: string | null;
    curseDesc: string | null;
}

export interface Draft {
    cards: Card[];
    sel: number;
}

export interface EliteRecord {
    id: number;
    affix: string;
}

export interface Entry {
    s: number;
    r: number;
    d: number;
}

export interface Meta {
    pellets: number;
    ghosts: number;
    runs: number;
    bestRound: number;
    crumbs: number;
    unlocked: string[];
}

export interface Highscores {
    entries: Entry[];
}

export interface LastRun {
    earned: number;
    rank: number;
    madeBoard: boolean;
    newHigh: boolean;
    entry: Entry;
    claimed: Unlock[];
}

export interface GameState {
    state: GameStateName;
    round: number;
    score: number;
    lives: number;
    timer: number;
    frightTimer: number;
    eatChain: number;
    anim: number;
    modePhase: ModePhase;
    modeTimer: number;
    ambusherId: number;
    pelletsTotal: number;
    seedBase: number;
    banner: string | null;
    chomp: Chomp;
    ghosts: Ghost[];
    fx: () => number;
    event: ActiveEvent | null;
    eventTimer: number;
    eventsFired: number;
    frenzyArmed: boolean;
    chillArmed: boolean;
    phaseGhost: number;
    effects: GameEffectState[];
    shield: number;
    speedMult: number;
    scoreMult: number;
    perks: Record<string, number>;
    curses: Record<string, number>;
    knobs: Knobs | null;
    mutator: string | null;
    draft: Draft | null;
    bonusLifeGranted: number;
    pelletsEaten: number;
    secondWindUsed: boolean;
    ghostsEatenThisRound: number;
    roundElites: EliteRecord[];
    headStartTimer: number;
    spawns: Spawn[];
    fruitTimer: number;
    crateTimer: number;
    runnerTimer: number;
    pads: [Coord, Coord] | null;
    banners: Banner[];
    meta: Meta | null;
    highscores: Highscores | null;
    started: boolean;
    recorded: boolean;
    pendingStart: boolean;
    startdraftUnlocked: boolean;
    ghostsEaten: number;
    bulldozerCharges: number;
    lastRun: LastRun | null;
    vfx: Vfx[];
    deathIx: number;
    deathLine: string;
    restartConfirm: number;
}

interface DraftPick {
    perkId: string;
    cursed: boolean;
    curseId: string | null;
}

// -----------------------------------------------------------------------------
//  The game engine. Pure logic + a renderer that draws into any rectangle.
// -----------------------------------------------------------------------------
export function createGame() {
    // Only the paces the difficulty curve does NOT own live as constants here.
    const FRIGHT_SPEED = 3.2; // frightened ghosts always crawl at this fixed pace
    const READY_TIME = 1.6; // "READY!" / round-banner dwell before play
    const DRAFT_TIME = 8.0; // draft dwell: auto-picks the highlighted card if nobody confirms
    const RESTART_CONFIRM = 2.0; // R opens a 2 s window; a second R restarts the run

    const game: GameState = {
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
        // A valid placeholder Chomp; placeEntities replaces it on the reset below,
        // before any read — no behaviour rides on this initial object.
        chomp: {
            px: CENTER_COL,
            py: ROWS - 3,
            dir: DIRS.up,
            want: DIRS.up,
            mouth: 0,
            padCd: 0,
            phasing: false,
            phaseTiles: 0,
            wrappedThisMove: false,
        },
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
        vfx: [], // transient juice — replaced with the vfx system's live array just below
        deathIx: 0, // rotates the death line across a run
        deathLine: "", // the line shown for the current death
        restartConfirm: 0, // seconds left in the R-to-restart confirm window (0 = closed)
    };

    // One lightweight vfx system per game instance. game.vfx is its live array, so
    // the harness's `st.vfx.length` reads the same list the system mutates in place
    // (clearEphemeral calls vfx.clear(), never reassigns, keeping them linked).
    const vfx = createVfx();
    game.vfx = vfx.list;

    function ghostStarts(): Coord[] {
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
    function applyPerks(): Knobs {
        const d = difficulty(game.round);
        const m: Knobs = {
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
            const stacks = game.perks[id] as number;
            for (let k = 0; k < stacks; k++) entry.mod(m);
        }
        for (const id in game.curses) {
            const entry = CURSES.find((c) => c.id === id);
            if (!entry) continue;
            const stacks = game.curses[id] as number;
            for (let k = 0; k < stacks; k++) entry.mod(m);
        }
        applyMutatorKnobs(m);
        game.knobs = m;
        return m;
    }

    // The two mutators whose effect is a number the fold already understands.
    function applyMutatorKnobs(m: Knobs): void {
        if (game.mutator === "greedy") {
            m.pelletValue *= 2;
            m.ghostSpeed *= 1.1;
        } else if (game.mutator === "rushhour") {
            m.scatterTime = 0;
        }
    }

    // Grant the perks that fire once at pick-time rather than every round. Spare
    // Heart adds a life the moment its knob climbs above what we've already paid.
    function grantImmediatePerks(): void {
        const k = game.knobs as Knobs;
        if (k.bonusLife > game.bonusLifeGranted) {
            game.lives += k.bonusLife - game.bonusLifeGranted;
            game.bonusLifeGranted = k.bonusLife;
        }
    }

    // Round-open perk application: hand out the starting shield, arm Head Start,
    // and clear the per-round vengeful counter. Called ONLY on a round open — never
    // on a death respawn: a death mid-round does not reopen the round, so the shield
    // is not re-granted (it survives via clearEphemeral), Head Start does not re-
    // freeze the field, and the vengeful counter carries its "this round" tally.
    function applyRoundStartPerks(): void {
        const k = game.knobs as Knobs;
        if (k.roundShield > 0) game.shield = Math.min(2, game.shield + k.roundShield);
        game.headStartTimer = k.headStart || 0;
        game.ghostsEatenThisRound = 0; // round-scoped: reset here, NOT on a death respawn
        game.bulldozerCharges = k.bulldozer || 0; // Bulldozer: once-per-round wall chews
    }

    // One seeded roll per round from round 3: 40% no mutator, else a uniform pick.
    function rollMutator(): void {
        game.mutator = null;
        if (game.round < 3) return;
        if (game.fx() < 0.4) return;
        game.mutator = (MUTATORS[(game.fx() * MUTATORS.length) | 0] as (typeof MUTATORS)[number]).id;
    }

    // Per-round maze seed: deterministic given the run's seedBase, yet different
    // every round so each round is a fresh maze the harness can still replay.
    function mazeRng(): () => number {
        return mulberry32((game.seedBase + game.round * 0x9e3779b9) >>> 0);
    }

    function newMaze(): void {
        const d = difficulty(game.round);
        // FUNHOUSE skips the mirror step; power+ grants extra power pellets.
        const mirror = game.mutator !== "mirror";
        const extraPower = game.knobs ? game.knobs.extraPower : 0;
        generateMaze(game.round, mazeRng(), { mirror, extraPower, knockRate: d.knockRate });
        game.pelletsTotal = maze.pelletsLeft;
        placePads();
    }

    // Teleport pads (round >= 6): the farthest-apart pair of open, non-pen cells.
    // Deterministic from the maze geometry — no RNG, so nothing here perturbs the
    // harness's seeded streams.
    function placePads(): void {
        game.pads = null;
        if (game.round < PADS_ROUND) return;
        const open: Coord[] = [];
        for (let r = 1; r < ROWS - 1; r++) {
            const row = maze.grid[r] as Cell[];
            for (let c = 1; c < COLS - 1; c++) {
                if (row[c] !== "#" && !inPen(c, r)) open.push({ c, r });
            }
        }
        if (open.length < 2) return;
        let a = open[0] as Coord;
        let b = open[1] as Coord;
        let bestD = -1;
        for (let i = 0; i < open.length; i++) {
            for (let j = i + 1; j < open.length; j++) {
                const oi = open[i] as Coord;
                const oj = open[j] as Coord;
                const dd = Math.abs(oi.c - oj.c) + Math.abs(oi.r - oj.r);
                if (dd > bestD) {
                    bestD = dd;
                    a = oi;
                    b = oj;
                }
            }
        }
        game.pads = [
            { c: a.c, r: a.r },
            { c: b.c, r: b.r },
        ];
    }

    // The scatter/chase clock starts each round in scatter — unless this round's
    // scatterTime has decayed to 0, in which case ghosts chase from the whistle.
    function initModeClock(): void {
        const k = game.knobs || difficulty(game.round);
        game.modePhase = k.scatterTime > 0 ? "scatter" : "chase";
        game.modeTimer = k.scatterTime > 0 ? k.scatterTime : k.chaseTime;
    }

    // Put Chomp and the ghosts back on their start tiles (used by every reset).
    function placeEntities(): void {
        const theme = active.theme;
        game.chomp = {
            px: CENTER_COL,
            py: ROWS - 3,
            dir: DIRS.up,
            want: DIRS.up,
            mouth: 0,
            padCd: 0,
            phasing: false,
            phaseTiles: 0,
            wrappedThisMove: false,
        };
        game.ghosts = ghostStarts().map(
            (s, i): Ghost => ({
                id: i,
                px: s.c,
                py: s.r,
                dir: DIRS.up,
                want: DIRS.up,
                mode: game.modePhase, // scatter | chase | fright | eyes
                color: theme.ghostColors[i % theme.ghostColors.length] as number,
                phasing: false, // set true while this ghost is the "phase" event ghost or a phasing elite clips
                padCd: 0, // per-entity teleport cooldown (stops pad ping-pong)
                affix: null, // elite affix id (round >= 5), else null
                tankBites: 0, // Tank absorbs the first fright-eat
                eatCd: 0, // brief un-eatable window after a Tank absorbs a bite
                phaseCd: 0, // Phasing elite: seconds to the next wall-clip
                phaseClip: 0, // Phasing elite: seconds of wall-clip remaining
            }),
        );
        // SWARM mutator: a fifth ghost that hunts Chomp like Blinky, born in the pen.
        if (game.mutator === "swarm") {
            game.ghosts.push({
                id: 4,
                px: HOME.c,
                py: HOME.r,
                dir: DIRS.up,
                want: DIRS.up,
                mode: game.modePhase,
                color: theme.ghostColors[0] as number,
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

    function reset(fullReset: boolean): void {
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
        systems.clearEphemeral(!fullReset); // a full run reset also drops the shield charge
        initModeClock();
        placeEntities();
        ai.assignElites();
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
        if (game.state === "ready") vfx.startRoundIntro(); // maze fades up unless a start-draft is showing
    }

    // ---- Draft -----------------------------------------------------------------
    // Build the draft: draftSize distinct unlocked perks, each slot a 25% chance
    // cursed. All rolls come off the seeded game.fx stream so the harness replays.
    function buildDraft(): void {
        const size = Math.max(1, Math.min(4, (game.knobs as Knobs).draftSize | 0));
        const bag = PERKS.filter((p) => !p.locked);
        for (let i = bag.length - 1; i > 0; i--) {
            const j = (game.fx() * (i + 1)) | 0;
            const tmp = bag[i] as (typeof bag)[number];
            bag[i] = bag[j] as (typeof bag)[number];
            bag[j] = tmp;
        }
        const cards: Card[] = bag.slice(0, Math.min(size, bag.length)).map((p) => {
            const cursed = game.fx() < 0.25;
            const curse = cursed ? (CURSES[(game.fx() * CURSES.length) | 0] as (typeof CURSES)[number]) : null;
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
    function applyDraftPick(card: DraftPick | null | undefined): void {
        if (!card) return;
        const inc = card.cursed ? 2 : 1;
        game.perks[card.perkId] = (game.perks[card.perkId] || 0) + inc;
        if (card.cursed && card.curseId) game.curses[card.curseId] = (game.curses[card.curseId] || 0) + 1;
        applyPerks();
        grantImmediatePerks();
    }

    function confirmDraft(): void {
        if (game.draft?.cards.length) applyDraftPick(game.draft.cards[game.draft.sel]);
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
            vfx.startRoundIntro();
            return;
        }
        nextRound();
    }

    function draftMove(delta: number): void {
        if (!game.draft) return;
        const n = game.draft.cards.length;
        game.draft.sel = (game.draft.sel + delta + n) % n;
    }

    function update(dt: number): void {
        // Clamp dt so a paused / backgrounded surface never makes a giant jump.
        dt = Math.min(dt, 0.05);
        if (game.restartConfirm > 0) game.restartConfirm -= dt; // the confirm window runs even while paused
        if (game.state === "paused") return; // frozen; P resumes
        game.anim += dt;
        vfx.tick(dt); // juice advances in every live state (ready/dying/draft/playing), never while paused

        if (game.state === "ready" || game.state === "dying" || game.state === "over" || game.state === "draft") {
            if (onStartScreen()) return; // hold on the start screen until a direction press begins the run
            game.timer -= dt;
            if (game.state === "ready" && game.timer <= 0) {
                game.state = "playing";
                game.banner = null; // the round banner clears once play begins
            } else if (game.state === "dying" && game.timer <= 0) {
                if (game.lives <= 0) {
                    game.state = "over";
                    recordRun(game); // out of lives -> fold the run into persistence, exactly once
                } else softReset();
            } else if (game.state === "draft" && game.timer <= 0) {
                confirmDraft(); // nobody confirmed in time -> take the highlighted card
            }
            return;
        }

        if (game.state !== "playing") return;

        const k = game.knobs as Knobs; // this round's folded numbers — the only speed/score source the loop reads
        ai.tickModeClock(dt);
        systems.updateEffects(dt); // one ticking path for effects, the event, banners, scheduler
        if (game.headStartTimer > 0) game.headStartTimer -= dt; // Head Start: field frozen at round open

        // Player. Speed folds in the effect multiplier (speed/sticky + perks) and,
        // on a tunnel row, the Wind Tunnel launch knob.
        const chomp = game.chomp;
        chomp.mouth += dt * 9;
        chomp.phasing = chomp.phaseTiles > 0; // Bulldozer: a live wall-chew phases this frame
        const onTunnel = maze.tunnelRows.has(Math.round(chomp.py));
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
            const row = maze.grid[pt.r] as Cell[];
            const cell = row[pt.c];
            if (cell === ".") {
                row[pt.c] = " ";
                game.score += Math.round(k.pelletValue * game.scoreMult);
                maze.pelletsLeft--;
                game.pelletsEaten++;
                vfx.popPellet(pt.c, pt.r, active.theme.pellet);
            } else if (cell === "o") {
                row[pt.c] = " ";
                game.score += Math.round(50 * game.scoreMult);
                maze.pelletsLeft--;
                vfx.popPellet(pt.c, pt.r, active.theme.power);
                systems.triggerFright();
            }
        }
        systems.applyMagnet();
        if (maze.pelletsLeft <= 0) {
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
        const blinkyTile = tileOf(game.ghosts[0] as Ghost);
        const eventId = game.event ? game.event.id : null;
        const frozen = systems.hasEffect("freeze");
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

            let speed: number;
            if (g.mode === "fright") speed = FRIGHT_SPEED;
            else if (g.mode === "eyes") speed = k.eyesSpeed;
            else {
                speed = k.ghostSpeed;
                if (g.id === 0 && !g.mini) {
                    // Cruise Elroy: Blinky accelerates as the maze empties.
                    const frac = game.pelletsTotal > 0 ? maze.pelletsLeft / game.pelletsTotal : 1;
                    if (frac < 0.1) speed *= 1.2;
                    else if (frac < 0.3) speed *= 1.1;
                }
                if (g.affix === "swift") speed *= 1.2;
                if (g.affix === "vengeful") speed *= 1 + 0.04 * game.ghostsEatenThisRound;
                if (g.mini) speed *= 0.6;
            }
            if (eventId === "rush" && g.mode !== "eyes") speed *= 1.3; // RUSH

            const target = ai.ghostTarget(g, chompTile, blinkyTile);
            move(g, speed, dt, (e) => ai.chooseGhostDir(e, target, chompTile));

            // Eyes that reached home revive into the current mode phase.
            if (g.mode === "eyes") {
                const gt = tileOf(g);
                if (gt.c === HOME.c && gt.r === HOME.r) g.mode = game.frightTimer > 0 ? "fright" : game.modePhase;
            }
        }

        // Fruit / crate / runner cadence, runner motion, pad teleports, collection.
        systems.updateSpawns(dt);

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
                    let gain: number;
                    if (g.mini) {
                        gain = 150 * game.scoreMult; // a split mini is a flat 150
                    } else {
                        game.eatChain++;
                        gain = (200 * game.eatChain * k.chainMult + k.ghostFlat) * game.scoreMult;
                    }
                    game.score += Math.round(gain);
                    vfx.floatText(g.px, g.py, TEXT.gain(Math.round(gain)), active.theme.win); // the points rise off the kill
                    vfx.shake(SHAKE_EAT);
                    if (!g.mini && game.eatChain >= 2) vfx.comboPop(TEXT.combo(game.eatChain)); // ×2!, ×3!… on a chain
                    ai.onGhostEaten(g);
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
                        systems.queueBanner(TEXT.secondWind, active.theme.win);
                        continue;
                    }
                    game.lives--;
                    game.state = "dying";
                    game.timer = 1.2;
                    game.deathLine = TEXT.deaths[game.deathIx % TEXT.deaths.length] as string; // OOF. / CAUGHT. / SQUISHED.
                    game.deathIx++;
                    vfx.shake(SHAKE_DEATH);
                    break;
                }
            }
        }
    }

    function softReset(): void {
        // After a lost life: keep score, maze and round — reset positions + clock.
        // The shield charge survives a death; timed effects, spawns and events do not.
        systems.clearEphemeral(true);
        initModeClock();
        placeEntities();
        ai.reapplyElites(); // affixes are round-scoped: the same ghosts stay elite across a death
        game.frightTimer = 0;
        game.eatChain = 0;
        game.state = "ready";
        game.timer = READY_TIME;
    }

    // Round clear -> next round: roll the mutator, refold the perks, cut a fresh
    // maze (its knock rate, the funhouse mirror, perk power pellets) and theme, then
    // a "ROUND N — THEME · MUTATOR" banner. Score persists; a life every third
    // round, capped at 5. From round 5 one random non-Blinky ghost turns ambusher.
    function nextRound(): void {
        game.round++;
        game.lives = Math.min(5, game.lives + (game.round % 3 === 0 ? 1 : 0));
        rollMutator();
        applyPerks();
        newMaze();
        pickTheme();
        game.ambusherId = game.round >= 5 ? 1 + ((Math.random() * 3) | 0) : -1;
        const mut = game.mutator ? MUTATORS.find((m) => m.id === game.mutator) : null;
        game.banner = TEXT.roundBanner(game.round, active.themeName.toUpperCase(), mut ? mut.name : null);
        systems.clearEphemeral(true); // carry the shield charge into the next round; drop the rest
        initModeClock();
        placeEntities();
        ai.assignElites();
        applyRoundStartPerks();
        game.frightTimer = 0;
        game.eatChain = 0;
        game.state = "ready";
        game.timer = READY_TIME;
        vfx.startRoundIntro();
    }

    // The start screen holds on round 1 until the first direction press — so the
    // title/board data can be read before a run begins.
    function onStartScreen(): boolean {
        return game.state === "ready" && game.round === 1 && !game.started;
    }

    function input(keyCode: number): void {
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

    function togglePause(): void {
        if (game.state === "playing") game.state = "paused";
        else if (game.state === "paused") game.state = "playing";
    }

    // R once opens a 2 s confirm window; R again inside it restarts the run mid-flight
    // (from playing or paused). Space/Enter still restart from the game-over screen.
    // Autoplay bots never press R, so the harness never trips this.
    function requestRestart(): void {
        if (game.state !== "playing" && game.state !== "paused") return;
        if (game.restartConfirm > 0) {
            game.restartConfirm = 0;
            reset(true);
        } else {
            game.restartConfirm = RESTART_CONFIRM;
        }
    }

    function setWant(d: Dir): void {
        if (game.state === "ready" || game.state === "playing") {
            // On the start screen, the first direction press begins the run: it
            // leaves the start screen but keeps the normal READY dwell before play.
            if (onStartScreen()) game.started = true;
            // DIZZY (round 8+ only, gated at pickup time) inverts the requested dir.
            if (systems.hasEffect("reversed")) d = { x: -d.x, y: -d.y };
            game.chomp.want = d;
            // Allow instant reversal mid-corridor — feels right for this game.
            if (isOpposite(d, game.chomp.dir)) game.chomp.dir = d;
        }
    }

    // Wire the modules onto the shared game (order matters only in that these must
    // exist before reset(true) runs the loop's first tick paths).
    const ai = createAi(game);
    const systems = createSystems(game, vfx);
    const view = createRender(game, vfx, onStartScreen);

    reset(true);

    const testFlag = (globalThis as unknown as { __CHOMP_TEST__?: boolean }).__CHOMP_TEST__;

    return {
        update,
        render: view.render,
        input,
        reset,
        state: (): GameStateName => game.state,
        get round(): number {
            return game.round;
        },
        // Read-only introspection for the harness autoplay bot (and Task 7's draft
        // UI). Never touched by the in-game surfaces.
        snapshot: () => ({
            state: game.state,
            round: game.round,
            score: game.score,
            lives: game.lives,
            pelletsLeft: maze.pelletsLeft,
            chomp: { c: Math.round(game.chomp.px), r: Math.round(game.chomp.py), dir: game.chomp.dir },
            mutator: game.mutator,
            ghosts: game.ghosts.map((g) => ({
                c: Math.round(g.px),
                r: Math.round(g.py),
                mode: g.mode,
                affix: g.affix || null,
                mini: !!g.mini,
            })),
        }),
        // Test-only surface, gated so the in-game build never sees it. Lets the
        // harness force-spawn a specific pickup/event, jump rounds and read the
        // Task-6 internals it needs to assert on.
        ...(typeof globalThis !== "undefined" && testFlag
            ? {
                  __test: {
                      state: game,
                      constants: { BANNER_TIME, PAD_COOLDOWN, EVENT_MIN, EVENT_SPAN },
                      forceEvent: (id: string) => systems.triggerEvent(EVENTS.find((e) => e.id === id)),
                      // Drop a crate resolved to a specific pickup at Chomp's tile.
                      forcePickup: (id: string, cell?: Coord) => {
                          const t = cell || tileOf(game.chomp);
                          systems.spawnCrate({ c: t.c, r: t.r }, id);
                      },
                      spawnFruit: (cell?: Coord | null) => systems.spawnFruit(cell),
                      spawnCrate: (cell?: Coord | null, forced?: string | null) => systems.spawnCrate(cell, forced),
                      spawnRunner: (cell?: Coord | null) => systems.spawnRunner(cell),
                      applyPickup: (id: string) => systems.applyPickup(id),
                      // Empty the board so the next playing update opens the draft.
                      forceClear: () => {
                          maze.pelletsLeft = 0;
                      },
                      setChompTile: (c: number, r: number) => {
                          game.chomp.px = c;
                          game.chomp.py = r;
                          game.chomp.padCd = 0;
                      },
                      setGhost: (i: number, c: number, r: number, mode?: GhostMode) => {
                          const g = game.ghosts[i];
                          if (!g) return;
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
                      setPerks: (perks?: Record<string, number>, curses?: Record<string, number>) => {
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
                      recordRun: () => recordRun(game),
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
                      refillThemeBagIds: () => refillThemeBag().map((t) => t.id),
                      // Build a fresh (seeded) draft and report its perk ids.
                      draftPerkIds: () => {
                          buildDraft();
                          return (game.draft as Draft).cards.map((c) => c.perkId);
                      },
                      // Draft: build one (seeded), read it, or inject a specific pick.
                      buildDraft: () => {
                          buildDraft();
                          return game.draft;
                      },
                      draft: () => game.draft,
                      draftPick: (id: string, cursed?: boolean, curseId?: string | null) =>
                          applyDraftPick({ perkId: id, cursed: !!cursed, curseId: curseId || null }),
                      // Force this round's mutator (refolds knobs so goldrush/rushhour land).
                      setMutator: (id?: string | null) => {
                          game.mutator = id || null;
                          return applyPerks();
                      },
                      // Force an elite affix onto a ghost, resetting its per-affix state.
                      setAffix: (i: number, id?: string | null) => {
                          const g = game.ghosts[i];
                          if (!g) return;
                          g.affix = id || null;
                          g.tankBites = 0;
                          g.eatCd = 0;
                          g.phaseClip = 0;
                          g.phaseCd = 7;
                      },
                      // Clean playing round at N (optionally forcing a mutator), so the
                      // harness can test round-gated features directly.
                      jumpToRound: (n: number, mutator?: string | null) => {
                          game.round = n;
                          game.ambusherId = n >= 5 ? 1 + ((Math.random() * 3) | 0) : -1;
                          game.mutator = mutator !== undefined ? mutator || null : null;
                          applyPerks();
                          newMaze();
                          systems.clearEphemeral(false);
                          game.eventTimer = EVENT_MIN + EVENT_SPAN * 0.5;
                          initModeClock();
                          placeEntities();
                          ai.assignElites();
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

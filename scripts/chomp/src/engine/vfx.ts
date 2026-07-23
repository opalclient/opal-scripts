// =============================================================================
//  engine/vfx.ts — one bounded transient-effects system.
// =============================================================================
//
//  Generic juice plumbing, no game content. A flat, hard-capped array of
//  transient effects with spawn helpers (shake / pop / float / combo / intro),
//  a tick that ages and reaps, and the two read helpers the draw pass needs
//  (shake offset, intro progress). Drawing lives in W4's render.ts — this file
//  owns only the state and its lifecycle.
//
//  None of this touches any RNG: particle spread is a fixed radial fan and shake
//  reads a passed animation clock, so the seeded streams the harness replays are
//  never perturbed. The array is hard-capped so it can never run away.
// =============================================================================

export const VFX_CAP = 140;

export interface ShakeSpec {
    amp: number;
    ttl: number;
}

export const SHAKE_DEATH: ShakeSpec = { amp: 4, ttl: 0.4 };
export const SHAKE_EAT: ShakeSpec = { amp: 2, ttl: 0.15 };

const POP_TIME = 0.25;
const FLOAT_TIME = 0.6;
const COMBO_TIME = 0.9;
const INTRO_TIME = 0.4;

export type VfxType = "shake" | "pop" | "float" | "combo" | "intro";

export interface Vfx {
    type: VfxType;
    t: number;
    ttl: number;
    amp?: number;
    c?: number;
    r?: number;
    vx?: number;
    vy?: number;
    text?: string;
    color?: number;
}

type VfxSpawn = Omit<Vfx, "t">;

// A per-game vfx system: each createGame() owns its own, so two live surfaces
// never share transient state.
export function createVfx() {
    const list: Vfx[] = [];

    // Push a transient (t starts at 0), shedding the oldest first past the cap.
    function push(e: VfxSpawn): void {
        list.push({ ...e, t: 0 });
        if (list.length > VFX_CAP) list.splice(0, list.length - VFX_CAP);
    }

    function shake(spec: ShakeSpec): void {
        push({ type: "shake", amp: spec.amp, ttl: spec.ttl });
    }

    function popPellet(c: number, r: number, color: number): void {
        for (let i = 0; i < 3; i++) {
            const ang = (i / 3) * Math.PI * 2; // fixed thirds — deterministic, no RNG
            push({ type: "pop", c, r, vx: Math.cos(ang) * 3, vy: Math.sin(ang) * 3, ttl: POP_TIME, color });
        }
    }

    function floatText(c: number, r: number, text: string, color: number): void {
        push({ type: "float", c, r, text, color, ttl: FLOAT_TIME });
    }

    // Caller passes the already-formatted label (e.g. TEXT.combo(n)); vfx owns no
    // game copy.
    function comboPop(text: string): void {
        push({ type: "combo", text, ttl: COMBO_TIME });
    }

    function startRoundIntro(): void {
        push({ type: "intro", ttl: INTRO_TIME });
    }

    // Age every transient, then reap the expired ones.
    function tick(dt: number): void {
        if (!list.length) return;
        for (const e of list) e.t += dt;
        for (let i = list.length - 1; i >= 0; i--) {
            const e = list[i];
            if (e && e.t >= e.ttl) list.splice(i, 1);
        }
    }

    // Board-shake offset in pixels: the strongest live shake, decaying linearly,
    // wobbled by the passed animation clock.
    function shakeOffset(anim: number): { dx: number; dy: number } {
        let amp = 0;
        for (const e of list) {
            if (e.type !== "shake") continue;
            const a = (e.amp ?? 0) * (1 - e.t / e.ttl);
            if (a > amp) amp = a;
        }
        if (amp <= 0) return { dx: 0, dy: 0 };
        return { dx: Math.sin(anim * 90) * amp, dy: Math.cos(anim * 78) * amp };
    }

    // 0..1 across the round intro (1 = faded in / no intro active).
    function introProgress(): number {
        for (const e of list) if (e.type === "intro") return e.t / e.ttl;
        return 1;
    }

    // Drop every transient — a life or round change clears lingering juice.
    function clear(): void {
        list.length = 0;
    }

    return {
        list,
        push,
        shake,
        popPellet,
        floatText,
        comboPop,
        startRoundIntro,
        tick,
        shakeOffset,
        introProgress,
        clear,
    };
}

export type VfxSystem = ReturnType<typeof createVfx>;

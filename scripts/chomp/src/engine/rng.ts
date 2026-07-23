// =============================================================================
//  engine/rng.ts — deterministic randomness primitives.
// =============================================================================
//
//  Generic arcade plumbing, no game content: a seedable PRNG plus the
//  shuffle-bag mechanism (Fisher-Yates + no-repeat-until-empty draw). The game
//  wires these to concrete sources — the harness seeds the maze/spawn streams,
//  the theme picker fills a bag from the unlocked themes (see game/ in W4).
// =============================================================================

// Deterministic PRNG so the harness can replay any seeded stream from its seed.
// Verbatim mulberry32 — the [0,1) generator every seeded system in the game uses.
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Fisher-Yates shuffle in place, drawing from the supplied [0,1) generator. One
// `rand()` call per element from the top down — the exact call order the game's
// seeded streams depend on.
export function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = (rand() * (i + 1)) | 0;
        const tmp = arr[i] as T;
        arr[i] = arr[j] as T;
        arr[j] = tmp;
    }
    return arr;
}

// A no-repeat-until-empty bag: `next()` pops one item, refilling and reshuffling
// from `refill()` once the bag runs dry. `refill()` is re-read every reload, so a
// source that grows (e.g. a newly unlocked theme) is picked up on the next cycle.
export class ShuffleBag<T> {
    private items: T[] = [];

    constructor(
        private readonly refill: () => T[],
        private readonly rand: () => number,
    ) {}

    next(): T | undefined {
        if (this.items.length === 0) this.reload();
        return this.items.pop();
    }

    // Refill and reshuffle now, returning the fresh bag contents.
    reload(): T[] {
        this.items = shuffleInPlace(this.refill(), this.rand);
        return this.items;
    }
}

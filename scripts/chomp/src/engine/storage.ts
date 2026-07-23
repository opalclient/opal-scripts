// =============================================================================
//  engine/storage.ts — persistence, feature-detected.
// =============================================================================
//
//  The ONLY file that touches the ambient `storage` global. Everything else
//  reads and writes through loadJson / saveJson (and checks `store` for the
//  session-only fallback). `storage` may be absent on older builds; then `store`
//  is null and every call is a no-op that never throws — the run just doesn't
//  persist.
// =============================================================================

// Feature-detect once. `store` is null when the build has no storage global.
export const store = typeof storage !== "undefined" ? storage : null;

// Read and JSON-parse a key, returning `fallback` when storage is absent, the
// key is unset (get() answers null), or the stored blob fails to parse.
export function loadJson<T>(key: string, fallback: T): T {
    if (!store) return fallback;
    try {
        const raw = store.get(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}

// Serialise and store a value. A no-op without storage; swallows cap/IO errors
// so the run continues — persistence is best-effort.
export function saveJson(key: string, value: unknown): void {
    if (!store) return;
    try {
        store.set(key, JSON.stringify(value));
    } catch {
        /* caps or IO — the run continues, persistence is best-effort */
    }
}

// =============================================================================
//  Packet No Fall  —  a preMovementPacket example for Opal
// =============================================================================
//
//  WHAT IT DOES
//  ------------
//  Demonstrates packet mutation via the packet scripting API: while the
//  player is genuinely airborne and already falling, every outgoing movement
//  packet has its `onGround` flag forced to `true` before it leaves the
//  client — telling the server the player never left the ground. The server
//  derives fall damage from the on-ground transitions it sees in movement
//  packets, not from any client-reported fall distance, so this is the
//  actual mechanism a "NoFall" style module is built from.
//
//  WHICH GLOBALS / EVENTS
//  -----------------------
//    • preMovementPacket — read/write access to the outbound movement
//      packet; `e.setOnGround(true)` is the mutation this script exists to
//      demonstrate.
//    • player  — getFallDistance() / isOnGround() gate WHEN to spoof, so the
//      packet is left untouched while the player is actually grounded.
//    • timer   — rate-limits an optional debug notification to roughly
//      once/second instead of once per packet (movement packets can fire
//      more than once in a single client tick).
//    • client  — client.print() for the rate-limited debug line.
//
//  A REAL FALL CHECK, NOT A BLANKET OVERRIDE
//  -------------------------------------------
//  The spoof only applies while `!player.isOnGround() && player.getFallDistance() > 0`
//  — i.e. actually airborne AND already falling. It does nothing during a
//  jump's ascent (fall distance stays 0 until you start descending again)
//  and nothing once you land, so a real landing still processes normally the
//  moment that condition goes false.
//
//  WHY MUTATE INSTEAD OF CANCEL
//  --------------------------------
//  `preMovementPacket` also exposes `e.cancel()`, and the four generic
//  packet events (`sendPacket` / `receivePacket` / `instantaneousSendPacket`
//  / `instantaneousReceivePacket`) expose `e.getType()` — the packet class's
//  simple name, e.g. `"ServerboundMovePlayerPacket"` — so a script could drop
//  specific packet types outright with something like:
//
//    module.on("sendPacket", (e) => {
//        if (e.getType() === "ServerboundMovePlayerPacket") e.cancel();
//    });
//
//  Cancelling a movement packet entirely desyncs the server's view of your
//  position and rotation, not just your on-ground state — a much blunter
//  tool than rewriting one field. Mutation is the right fit here;
//  cancellation is the right fit when a packet class shouldn't be
//  sent/handled at all.
//
//  Settings:
//    • Debug Log — print a rate-limited chat line whenever the spoof fires.
//
//  Author: Opal  ·  An example of the packet scripting API.
// =============================================================================

const script = registerScript({
    name: "Packet No Fall",
    version: "1.0.0",
    authors: ["Opal"],
});

/**
 * Whether the outgoing movement packet should have its on-ground flag
 * spoofed this tick: only while genuinely airborne and already falling —
 * never while standing still, and never mid-ascent on a jump.
 *
 * @returns {boolean} Whether to force `onGround` true on the outgoing packet.
 */
function shouldSpoofOnGround() {
    return !player.isOnGround() && player.getFallDistance() > 0;
}

script.registerModule(
    {
        name: "Packet No Fall",
        description: "Spoofs onGround in the movement packet while falling, so the server never sees a fall landing.",
    },
    (module) => {
        // ---- Settings -------------------------------------------------------
        module.addBool("Debug Log", false);

        // ---- State ------------------------------------------------------------
        /** Rate-limits the debug log so a multi-packet tick doesn't spam it. */
        const logTimer = timer.create();

        module.on("enable", () => {
            logTimer.reset();
        });

        module.on("preMovementPacket", (e) => {
            if (!shouldSpoofOnGround()) return;

            e.setOnGround(true);

            if (module.getBool("Debug Log") && logTimer.passedAndReset(1000)) {
                client.print("[Packet No Fall] spoofed onGround (fall distance " + player.getFallDistance().toFixed(1) + ")");
            }
        });
    },
);

// -----------------------------------------------------------------------------
//  Test hook. `module` does not exist inside the Opal/GraalVM runtime, so this
//  is always skipped there — it only runs under plain Node, where tests/
//  import the pure fall check and drive the registered `preMovementPacket`
//  handler directly. See tests/PacketNoFall.test.js.
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
    module.exports = { shouldSpoofOnGround };
}

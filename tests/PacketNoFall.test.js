// Tests character/PacketNoFall.js: the pure `shouldSpoofOnGround()` gate, and
// the registered `preMovementPacket` handler itself — driven directly via
// `getRegisteredHandler()` and a fake event from `opal-stub.js`, per that
// file's header for why this is the one script in the gallery whose handler
// (not just its pure helpers) gets exercised here.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const stub = require("./opal-stub");
const { shouldSpoofOnGround } = require("../character/PacketNoFall.js");

test("shouldSpoofOnGround is true only while airborne and already falling", () => {
    const originalIsOnGround = player.isOnGround;
    const originalGetFallDistance = player.getFallDistance;
    try {
        player.isOnGround = () => true;
        player.getFallDistance = () => 0;
        assert.equal(shouldSpoofOnGround(), false); // standing still

        player.isOnGround = () => false;
        player.getFallDistance = () => 0;
        assert.equal(shouldSpoofOnGround(), false); // ascending a jump, not falling yet

        player.isOnGround = () => false;
        player.getFallDistance = () => 4.5;
        assert.equal(shouldSpoofOnGround(), true); // actually falling
    } finally {
        player.isOnGround = originalIsOnGround;
        player.getFallDistance = originalGetFallDistance;
    }
});

test("preMovementPacket handler spoofs onGround true while falling", () => {
    const originalIsOnGround = player.isOnGround;
    const originalGetFallDistance = player.getFallDistance;
    try {
        player.isOnGround = () => false;
        player.getFallDistance = () => 6;

        const handler = stub.getRegisteredHandler("preMovementPacket");
        assert.equal(typeof handler, "function");

        const event = stub.makeFakePreMovementPacketEvent({ onGround: false });
        handler(event);

        assert.deepEqual(event.calls.setOnGround, [true]);
    } finally {
        player.isOnGround = originalIsOnGround;
        player.getFallDistance = originalGetFallDistance;
    }
});

test("preMovementPacket handler leaves the packet alone while grounded", () => {
    const originalIsOnGround = player.isOnGround;
    const originalGetFallDistance = player.getFallDistance;
    try {
        player.isOnGround = () => true;
        player.getFallDistance = () => 0;

        const handler = stub.getRegisteredHandler("preMovementPacket");
        const event = stub.makeFakePreMovementPacketEvent({ onGround: true });
        handler(event);

        assert.deepEqual(event.calls.setOnGround, []);
    } finally {
        player.isOnGround = originalIsOnGround;
        player.getFallDistance = originalGetFallDistance;
    }
});

test("preMovementPacket handler leaves the packet alone mid-ascent on a jump", () => {
    const originalIsOnGround = player.isOnGround;
    const originalGetFallDistance = player.getFallDistance;
    try {
        player.isOnGround = () => false;
        player.getFallDistance = () => 0; // ascending: airborne but not yet falling

        const handler = stub.getRegisteredHandler("preMovementPacket");
        const event = stub.makeFakePreMovementPacketEvent({ onGround: false });
        handler(event);

        assert.deepEqual(event.calls.setOnGround, []);
    } finally {
        player.isOnGround = originalIsOnGround;
        player.getFallDistance = originalGetFallDistance;
    }
});

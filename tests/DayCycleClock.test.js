// Tests the pure tick/clock conversion helpers exported by
// world/DayCycleClock.js — see the header comment there, and
// tests/opal-stub.js for why this require() works at all under plain Node.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("./opal-stub");
const { ticksToHour, formatClock, phaseLabel, TICKS_PER_DAY } = require("../world/DayCycleClock.js");

test("ticksToHour matches the documented anchor ticks", () => {
    assert.equal(ticksToHour(0), 6); // sunrise
    assert.equal(ticksToHour(6000), 12); // noon
    assert.equal(ticksToHour(12000), 18); // sunset
    assert.equal(ticksToHour(18000), 0); // midnight
});

test("ticksToHour wraps a full day back to the same hour", () => {
    assert.equal(ticksToHour(0), ticksToHour(TICKS_PER_DAY));
    assert.equal(ticksToHour(3000), ticksToHour(3000 + TICKS_PER_DAY));
});

test("ticksToHour handles negative/out-of-range ticks by wrapping positive", () => {
    const hour = ticksToHour(-6000); // one "day" before sunrise -> should equal ticksToHour(18000)
    assert.equal(hour, ticksToHour(18000));
});

test("formatClock renders 24h format zero-padded", () => {
    assert.equal(formatClock(6, false), "06:00");
    assert.equal(formatClock(0, false), "00:00");
    assert.equal(formatClock(23.5, false), "23:30");
});

test("formatClock renders 12h format with AM/PM and no leading zero on the hour", () => {
    assert.equal(formatClock(0, true), "12:00 AM");
    assert.equal(formatClock(12, true), "12:00 PM");
    assert.equal(formatClock(13, true), "1:00 PM");
    assert.equal(formatClock(6, true), "6:00 AM");
});

test("phaseLabel buckets hours into the expected day phases", () => {
    assert.equal(phaseLabel(0), "Night");
    assert.equal(phaseLabel(6), "Morning");
    assert.equal(phaseLabel(12), "Midday");
    assert.equal(phaseLabel(16), "Evening");
    assert.equal(phaseLabel(20), "Night");
});

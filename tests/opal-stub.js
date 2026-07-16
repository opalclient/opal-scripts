// =============================================================================
//  Opal engine stub — a minimal fake of the scripting globals for Node tests
// =============================================================================
//
//  Every example script in this gallery is a single, drop-in .js file that
//  calls `registerScript(...)` at the top level and expects the proxy
//  globals (`renderer`, `player`, `world`, ...) to already exist — because
//  inside the real Opal/GraalVM engine, they do. Plain Node does not have
//  them, so `require("../core/Whatever.js")` would throw a ReferenceError on
//  the very first line.
//
//  This module installs just enough of those globals on `globalThis` for a
//  script file to load top-to-bottom without throwing, so a test can then
//  pull the pure, engine-independent helper functions a script chooses to
//  export (see the `module.exports` guard near the bottom of a handful of
//  files — `DayCycleClock.js`, `FallWarning.js`, `AutoToolSwitcher.js`).
//
//  This is intentionally NOT a faithful emulator of the real engine. Event
//  handlers registered via `module.on(...)` are stored but never invoked;
//  `renderer`/`overlay`/`palette` methods are no-ops. That's fine — the
//  render/tick logic that actually calls those methods is exactly the part
//  this repo does not unit test (see CLAUDE.md: "UI/render paths are hard to
//  unit-test; cover what you can" — what you *can* cover here is the pure
//  math/formatting/string-matching helpers, and that's what this stub exists
//  to unlock).
//
//  Usage:
//    require("./opal-stub");             // installs the globals once
//    const { toolKeywordFor } = require("../character/AutoToolSwitcher.js");
// =============================================================================

/**
 * Every fake `module` handle created via `makeFakeModule()`, in registration
 * order. Lets the exported `getRegisteredHandler()` hand a test the exact
 * function a script passed to `module.on(...)`, so a test can drive an event
 * handler directly (see tests/PacketNoFall.test.js) instead of only covering
 * pure, engine-independent helpers. Declared outside the install guard so it
 * stays reachable even though the guard body below only runs once per process.
 */
const registeredFakeModules = [];

if (!globalThis.__opalStubInstalled) {
    globalThis.__opalStubInstalled = true;

    const noop = () => {};
    const noopReturning = (value) => () => value;

    /** A minimal fake `module` handle passed to every registerModule callback. */
    function makeFakeModule() {
        const settings = new Map();
        const handlers = new Map();
        const fakeModule = {
            addBool: (name, def) => settings.set(name, def),
            addNumber: (name, def) => settings.set(name, def),
            addMode: (name, options) => settings.set(name, options[0]),
            addGroup: noop,
            getBool: (name) => Boolean(settings.get(name)),
            setBool: (name, v) => settings.set(name, v),
            getNumber: (name) => Number(settings.get(name) || 0),
            setNumber: (name, v) => settings.set(name, v),
            getMode: (name) => String(settings.get(name) || ""),
            isModeEqual: (name, option) => String(settings.get(name) || "").toLowerCase() === String(option).toLowerCase(),
            on: (event, handler) => handlers.set(event, handler),
            /** Test-only escape hatch (not part of the real OpalModule API) — see `getRegisteredHandler`. */
            __handlers: handlers,
        };
        registeredFakeModules.push(fakeModule);
        return fakeModule;
    }

    globalThis.registerScript = (_config) => ({
        registerModule: (_meta, callback) => callback(makeFakeModule()),
    });

    const colorFns = {
        color: (r, g, b, a) => (((a === undefined ? 255 : a) << 24) | (r << 16) | (g << 8) | b) >>> 0,
        withAlpha: noopReturning(0),
        applyOpacity: noopReturning(0),
        interpolate: noopReturning(0),
        darker: noopReturning(0),
        brighter: noopReturning(0),
    };

    globalThis.renderer = Object.assign(
        {
            rect: noop,
            roundedRect: noop,
            roundedRectVarying: noop,
            circle: noop,
            rectGradient: noop,
            roundedRectGradient: noop,
            rectOutline: noop,
            roundedRectOutline: noop,
            rectStroke: noop,
            rainbowRect: noop,
            shadow: noop,
            blurFill: noop,
            glowFill: noop,
            innerGlow: noop,
            loadImage: noopReturning({ isValid: () => false }),
            image: noop,
            imageTinted: noop,
            destroyImage: noop,
            beginPath: noop,
            moveTo: noop,
            lineTo: noop,
            quadTo: noop,
            cubicTo: noop,
            strokeColor: noop,
            strokeWidth: noop,
            stroke: noop,
            closePath: noop,
            text: noopReturning(0),
            textShadow: noopReturning(0),
            textGradient: noop,
            textWidth: noopReturning(0),
            textHeight: noopReturning(0),
            wrapText: noopReturning([]),
            trimText: noopReturning(""),
            scale: (_f, _x, _y, _w, _h, content) => content(),
            rotate: (_deg, _x, _y, _w, _h, content) => content(),
            scissor: (_x, _y, _w, _h, content) => content(),
            globalAlpha: noop,
        },
        colorFns,
    );

    globalThis.notification = {
        success: noop,
        error: noop,
        warn: noop,
        info: noop,
        show: noop,
    };

    globalThis.overlay = {
        createIsland: noopReturning("stub-island"),
        showIsland: noop,
        hideIsland: noop,
        destroyIsland: noop,
        setIslandWidth: noop,
        setIslandHeight: noop,
        setIslandPriority: noop,
    };

    globalThis.modules = {
        exists: noopReturning(false),
        isEnabled: noopReturning(false),
        setEnabled: noop,
        toggle: noop,
        getCategory: noopReturning(null),
        getSuffix: noopReturning(null),
        isVisible: noopReturning(true),
        setVisible: noop,
        listAll: noopReturning([]),
        listCategory: noopReturning([]),
        listEnabled: noopReturning([]),
    };

    globalThis.client = {
        print: noop,
        success: noop,
        error: noop,
        getModule: noopReturning(null),
        isModuleEnabled: noopReturning(false),
        setModuleEnabled: noop,
        sendChat: noop,
        runCommand: noop,
        getScaledWidth: noopReturning(1920),
        getScaledHeight: noopReturning(1080),
        getScaleFactor: noopReturning(1),
        getFramebufferWidth: noopReturning(1920),
        getFramebufferHeight: noopReturning(1080),
        getThemePrimary: noopReturning(0),
        getThemeSecondary: noopReturning(0),
        getAnimatedThemeColor: noopReturning(0),
        getTickDelta: noopReturning(0),
        getFPS: noopReturning(60),
    };

    globalThis.player = {
        getEyePosition: noopReturning(null),
        getPosition: noopReturning(null),
        getBlockPosition: noopReturning({ getX: noopReturning(0), getY: noopReturning(0), getZ: noopReturning(0) }),
        getVelocity: noopReturning(null),
        getYaw: noopReturning(0),
        getPitch: noopReturning(0),
        getFallDistance: noopReturning(0),
        isOnGround: noopReturning(true),
        isInAir: noopReturning(false),
        getAirTicks: noopReturning(0),
        getGroundTicks: noopReturning(0),
        isSneaking: noopReturning(false),
        isSprinting: noopReturning(false),
        isUsingItem: noopReturning(false),
        getHealth: noopReturning(20),
        getMaxHealth: noopReturning(20),
        getAbsorption: noopReturning(0),
        canCrit: noopReturning(false),
        getAttackDamage: noopReturning(1),
        getEntityInteractionRange: noopReturning(3),
        isHoldingWeapon: noopReturning(false),
        getDistanceToEntity: noopReturning(-1),
        getClosestPoint: noopReturning(null),
        isBoxEmpty: noopReturning(true),
        isBoxEmptyBelow: noopReturning(true),
        getBoundingBox: noopReturning(null),
        getStandingEyeHeight: noopReturning(1.62),
        swingHand: noop,
        useItem: noop,
    };

    globalThis.movement = {
        getBlocksPerSecond: noopReturning(0),
        getSpeed: noopReturning(0),
        yawPos: noopReturning([0, 0]),
        setEntitySpeed: noop,
        setSpeed: noop,
        getSwiftnessSpeed: (speed) => speed,
        getMoveYaw: noopReturning(0),
        getDirectionDegrees: noopReturning(0),
        getDirectionRadians: noopReturning(0),
        getDirection: noopReturning(0),
        isMoving: noopReturning(false),
    };

    globalThis.rotation = {
        set: noop,
        setSmooth: noop,
        getRotationFromPosition: noopReturning({ getYaw: noopReturning(0), getPitch: noopReturning(0) }),
        getRotationFromBlock: noopReturning(null),
        getRotationFromRaycastedBlock: noopReturning(null),
        getRotationFromRaycastedEntity: noopReturning(null),
        getRotationVector: noopReturning(null),
        getRotation: noopReturning({ getYaw: noopReturning(0), getPitch: noopReturning(0) }),
        getRotationDifference: noopReturning(0),
        getCursorDelta: noopReturning(0),
        patchConstantRotation: (target) => target,
        getSensitivityModifiedRotation: (v) => v,
        getSentRotation: (v) => v,
        getSensitivityModifiedRotationVec: (v) => v,
        getVanillaRotation: (v) => v,
        getDuplicateWrapped: (v) => v,
        getEntityFOV: noopReturning(0),
        isEntityInFOV: noopReturning(true),
    };

    globalThis.inventory = {
        setSlot: noop,
        setSlotSilent: noop,
        setSlotFullSilent: noop,
        sendSlotPacket: noop,
        getSelectedSlot: noopReturning(0),
        findBlock: noopReturning(-1),
        findItem: noopReturning(-1),
        findItemInInventory: noopReturning(-1),
        getStack: noopReturning(null),
        getMainHandStack: noopReturning(null),
        getOffHandStack: noopReturning(null),
        isHeldItemBlock: noopReturning(false),
        isBlock: noopReturning(false),
        getItemName: noopReturning(""),
        getItemCount: noopReturning(0),
        countItem: noopReturning(0),
        countBlocks: noopReturning(0),
    };

    globalThis.world = {
        isAir: noopReturning(false),
        isReplaceable: noopReturning(false),
        isSolid: noopReturning(true),
        getBlockName: noopReturning(""),
        getBlockState: noopReturning(null),
        getBlock: noopReturning(null),
        getBlockHardness: noopReturning(0),
        hasAdjacentBlock: noopReturning(false),
        getAdjacentDirections: noopReturning({ isEmpty: () => true, get: noopReturning(null) }),
        getEntities: noopReturning([]),
        getLivingEntitiesInRange: noopReturning({ isEmpty: () => true, size: () => 0, get: noopReturning(null) }),
        getTime: noopReturning(0),
        getTimeOfDay: noopReturning(0),
        getDimension: noopReturning("minecraft:overworld"),
    };

    globalThis.esp = {
        getEntityBox2D: noopReturning(null),
        project: noopReturning(null),
        projectVec: noopReturning(null),
        getInterpolatedPosition: noopReturning(null),
        lerp: (start, end, t) => start + (end - start) * t,
        isOnScreen: noopReturning(false),
        isEntityOnScreen: noopReturning(false),
    };

    function makeFakePaletteModule() {
        const settings = new Map();
        return {
            addBool: (name, def) => settings.set(name, def),
            addNumber: (name, def) => settings.set(name, def),
            addMode: (name, options) => settings.set(name, options[0]),
            addGroup: noop,
            getBool: (name) => Boolean(settings.get(name)),
            getNumber: (name) => Number(settings.get(name) || 0),
            getMode: (name) => String(settings.get(name) || ""),
            isModeEqual: (name, option) => String(settings.get(name) || "").toLowerCase() === String(option).toLowerCase(),
            on: noop,
        };
    }
    void makeFakePaletteModule; // reserved for future palette-view tests

    globalThis.palette = {
        createView: noopReturning("stub-view"),
        openView: noop,
        removeView: noop,
    };

    globalThis.keys = new Proxy(
        {},
        {
            get: () => 0,
        },
    );

    globalThis.mc = {
        player: null,
        world: null,
        interactionManager: {
            interactBlock: noop,
            updateBlockBreakingProgress: noopReturning(false),
            cancelBlockBreaking: noop,
            isBreakingBlock: noopReturning(false),
            attackEntity: noop,
            interactItem: noop,
            stopUsingItem: noop,
        },
        getPlayer: noopReturning(null),
        getWorld: noopReturning(null),
        getInteractionManager: noopReturning(null),
    };

    /** A real (Date.now()-backed) stopwatch, so `passed`/`passedAndReset` are
     * actually meaningful in a test rather than hardcoded stubs. */
    function makeFakeStopwatch() {
        let last = Date.now();
        return {
            reset: () => {
                last = Date.now();
            },
            elapsed: () => Date.now() - last,
            passed: (ms) => Date.now() - last >= ms,
            passedAndReset: (ms) => {
                const now = Date.now();
                if (now - last >= ms) {
                    last = now;
                    return true;
                }
                return false;
            },
        };
    }

    globalThis.timer = {
        create: makeFakeStopwatch,
        now: () => Date.now(),
    };

    globalThis.MAIN_HAND = "MAIN_HAND";
    globalThis.OFF_HAND = "OFF_HAND";

    globalThis.BlockPos = class BlockPos {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
        getX() {
            return this.x;
        }
        getY() {
            return this.y;
        }
        getZ() {
            return this.z;
        }
        offset(direction) {
            return direction && direction.apply ? direction.apply(this) : this;
        }
    };

    globalThis.Vec2f = class Vec2f {
        constructor(yaw, pitch) {
            this.yaw = yaw;
            this.pitch = pitch;
        }
        getYaw() {
            return this.yaw;
        }
        getPitch() {
            return this.pitch;
        }
    };

    globalThis.Vec3d = class Vec3d {
        constructor(x, y, z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    };
    globalThis.Vec3i = globalThis.Vec3d;

    globalThis.MathHelper = Math;

    globalThis.Color = class Color {
        constructor(r, g, b, a) {
            this.rgb = (((a === undefined ? 255 : a) << 24) | (r << 16) | (g << 8) | b) >>> 0;
        }
        getRGB() {
            return this.rgb;
        }
    };
}

// =============================================================================
//  Test-only helpers (exported, not installed on globalThis)
//
//  These are not part of the real Opal engine — they exist so a test can (a)
//  reach the handler a script registered via `module.on(...)` and (b) build a
//  fake event payload matching the shapes in opal-globals.d.ts, so it can
//  drive that handler directly. See tests/PacketNoFall.test.js.
// =============================================================================

/**
 * Returns the handler a script registered for `eventName` via
 * `module.on(eventName, handler)`. Defaults to the most recently registered
 * module (the common one-module-per-script case); pass `moduleIndex` for a
 * script that registers more than one module.
 *
 * @param {string} eventName e.g. "preMovementPacket".
 * @param {number} [moduleIndex] Index into registration order; defaults to the last-registered module.
 * @returns {Function|undefined} The registered handler, or undefined if none was registered.
 */
function getRegisteredHandler(eventName, moduleIndex = registeredFakeModules.length - 1) {
    const fakeModule = registeredFakeModules[moduleIndex];
    return fakeModule ? fakeModule.__handlers.get(eventName) : undefined;
}

/**
 * Builds a fake `preMovementPacket` event payload (see `PreMovementPacketEvent`
 * in opal-globals.d.ts). Every setter records its calls in `.calls.<method>`
 * so a test can assert exactly what a handler mutated.
 *
 * @param {object} [overrides] Initial getter values (x/y/z/yaw/pitch/onGround/sprinting/horizontalCollision/forceInput/cancelled).
 */
function makeFakePreMovementPacketEvent(overrides = {}) {
    const state = Object.assign(
        {
            x: 0,
            y: 64,
            z: 0,
            yaw: 0,
            pitch: 0,
            onGround: false,
            sprinting: false,
            horizontalCollision: false,
            forceInput: false,
            cancelled: false,
        },
        overrides,
    );
    const calls = {
        setX: [],
        setY: [],
        setZ: [],
        setYaw: [],
        setPitch: [],
        setOnGround: [],
        setSprinting: [],
        setHorizontalCollision: [],
        setForceInput: [],
        cancel: 0,
    };
    return {
        getX: () => state.x,
        getY: () => state.y,
        getZ: () => state.z,
        setX: (v) => {
            calls.setX.push(v);
            state.x = v;
        },
        setY: (v) => {
            calls.setY.push(v);
            state.y = v;
        },
        setZ: (v) => {
            calls.setZ.push(v);
            state.z = v;
        },
        getYaw: () => state.yaw,
        getPitch: () => state.pitch,
        setYaw: (v) => {
            calls.setYaw.push(v);
            state.yaw = v;
        },
        setPitch: (v) => {
            calls.setPitch.push(v);
            state.pitch = v;
        },
        isOnGround: () => state.onGround,
        setOnGround: (v) => {
            calls.setOnGround.push(v);
            state.onGround = v;
        },
        isSprinting: () => state.sprinting,
        setSprinting: (v) => {
            calls.setSprinting.push(v);
            state.sprinting = v;
        },
        isHorizontalCollision: () => state.horizontalCollision,
        setHorizontalCollision: (v) => {
            calls.setHorizontalCollision.push(v);
            state.horizontalCollision = v;
        },
        isForceInput: () => state.forceInput,
        setForceInput: (v) => {
            calls.setForceInput.push(v);
            state.forceInput = v;
        },
        isCancelled: () => state.cancelled,
        cancel: () => {
            calls.cancel += 1;
            state.cancelled = true;
        },
        /** Test-only: every setter/cancel call the handler under test made. */
        calls,
    };
}

/** Builds a fake read-only `postMovementPacket` event payload. */
function makeFakePostMovementPacketEvent(overrides = {}) {
    const state = Object.assign({ x: 0, y: 64, z: 0, yaw: 0, pitch: 0, onGround: true, sprinting: false }, overrides);
    return {
        getX: () => state.x,
        getY: () => state.y,
        getZ: () => state.z,
        getYaw: () => state.yaw,
        getPitch: () => state.pitch,
        isOnGround: () => state.onGround,
        isSprinting: () => state.sprinting,
    };
}

/**
 * Builds a fake payload for the shared `sendPacket`/`receivePacket`/
 * `instantaneousSendPacket`/`instantaneousReceivePacket` shape (`PacketEvent`
 * in opal-globals.d.ts).
 *
 * @param {string} [type] Simple packet class name, e.g. "ServerboundMovePlayerPacket".
 */
function makeFakePacketEvent(type = "ServerboundMovePlayerPacket", overrides = {}) {
    const state = Object.assign({ cancelled: false }, overrides);
    const calls = { cancel: 0 };
    return {
        getType: () => type,
        isCancelled: () => state.cancelled,
        cancel: () => {
            calls.cancel += 1;
            state.cancelled = true;
        },
        calls,
    };
}

/** Builds a fake `chatReceived` event payload. */
function makeFakeChatReceivedEvent(overrides = {}) {
    const state = Object.assign({ message: "", overlay: false, cancelled: false }, overrides);
    const calls = { setOverlay: [], cancel: 0 };
    return {
        getMessage: () => state.message,
        isOverlay: () => state.overlay,
        setOverlay: (v) => {
            calls.setOverlay.push(v);
            state.overlay = v;
        },
        isCancelled: () => state.cancelled,
        cancel: () => {
            calls.cancel += 1;
            state.cancelled = true;
        },
        calls,
    };
}

/** Builds a fake `attack` event payload. */
function makeFakeAttackEvent(overrides = {}) {
    const state = Object.assign(
        { targetName: "", targetId: 0, targetHealth: -1, targetMaxHealth: -1, targetDistance: -1 },
        overrides,
    );
    return {
        getTargetName: () => state.targetName,
        getTargetId: () => state.targetId,
        getTargetHealth: () => state.targetHealth,
        getTargetMaxHealth: () => state.targetMaxHealth,
        getTargetDistance: () => state.targetDistance,
    };
}

/** Builds a fake `jump` event payload. */
function makeFakeJumpEvent(overrides = {}) {
    const state = Object.assign({ sprinting: false, cancelled: false }, overrides);
    const calls = { setSprinting: [], cancel: 0 };
    return {
        isSprinting: () => state.sprinting,
        setSprinting: (v) => {
            calls.setSprinting.push(v);
            state.sprinting = v;
        },
        isCancelled: () => state.cancelled,
        cancel: () => {
            calls.cancel += 1;
            state.cancelled = true;
        },
        calls,
    };
}

module.exports = {
    getRegisteredHandler,
    makeFakePreMovementPacketEvent,
    makeFakePostMovementPacketEvent,
    makeFakePacketEvent,
    makeFakeChatReceivedEvent,
    makeFakeAttackEvent,
    makeFakeJumpEvent,
};

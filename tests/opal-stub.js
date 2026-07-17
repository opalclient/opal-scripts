// =============================================================================
//  Opal engine stub — a fake of the scripting globals for Node tests
// =============================================================================
//
//  READ THIS BEFORE YOU TRUST A GREEN RUN
//  ---------------------------------------
//  This stub CANNOT prove a sandbox denial. It involves no host object and no
//  GraalVM context — it is plain JavaScript pretending to be Java. A member
//  this file happens to answer may still be completely unreachable in-game.
//  The real gate for API *shape* is `ScriptRepositorySandboxTest` in the
//  `opal` repo, which evals through a live Graal context against real host
//  objects under the actual `HostAccess.EXPLICIT` policy.
//
//  This blind spot shipped six bugs. Earlier versions of this file faked host
//  objects with plain JS object literals, which cheerfully answer any call —
//  so the suite encoded the API the scripts *assumed* rather than the one the
//  sandbox *serves*, and stayed green while `mc.player` (27 call sites),
//  `box.x` (NaN coordinates), `entity.getName().getString()`, `.length` on a
//  returned list, and two deleted methods were all silently broken in-game.
//
//  WHAT THIS FILE NOW DOES ABOUT IT
//  ---------------------------------
//  Every fake below mirrors the *real* contract as closely as plain JS can:
//
//    • Fakes are throwing proxies (see `hostObject`). Reading a member the
//      real proxy does not export throws immediately instead of returning
//      `undefined`. This is deliberately STRICTER than the sandbox — in-game,
//      an un-annotated *field* read is silently `undefined` and only a *call*
//      throws `Unknown identifier`. Failing loudly on both is the entire point.
//    • Collections are `ScriptList`-shaped: `size()`, `isEmpty()`, `get(i)`
//      and nothing else. No `.length`, no indexing, no iteration — `for..of`
//      and `list[0]` fail here exactly as they are broken in-game.
//    • No bean properties. `mc.player` and `mc.world` do not exist; GraalJS
//      does no bean-property mapping under `HostAccess.EXPLICIT`, so only
//      `mc.getPlayer()` / `mc.getWorld()` resolve.
//    • No bare Java objects. Entities are `ScriptEntity`-shaped, vectors
//      `ScriptVec3`-shaped, boxes `ScriptBox2D`/`ScriptBox3D`-shaped, item
//      stacks `ScriptItemStack`-shaped, images `ScriptImage`-shaped.
//    • Opaque tokens (`mc.getWorld()`, `HitResult`) are memberless brands.
//
//  WHAT IT STILL DOES NOT DO
//  --------------------------
//  It is not a faithful emulator. Event handlers registered via `module.on()`
//  are stored, never fired on their own; `renderer`/`overlay`/`palette` draw
//  calls are no-ops. That is fine — this suite covers the pure, engine-
//  independent helpers a script exports, plus handlers a test drives by hand
//  (see `getRegisteredHandler`).
//
//  Usage:
//    require("./opal-stub");             // installs the globals once
//    const { toolKeywordFor } = require("../character/AutoToolSwitcher.js");
// =============================================================================

"use strict";

/**
 * Every fake `module` handle created via `makeFakeModule()`, in registration
 * order. Lets the exported `getRegisteredHandler()` hand a test the exact
 * function a script passed to `module.on(...)`, so a test can drive an event
 * handler directly (see tests/PacketNoFall.test.js) instead of only covering
 * pure, engine-independent helpers. Declared outside the install guard so it
 * stays reachable even though the guard body below only runs once per process.
 */
const registeredFakeModules = [];

/**
 * Mutable world state the fake globals read from, so a test can stage a
 * scenario (a local player, entities in range, active effects) and then drive
 * a handler. Reset with `resetStubState()`.
 */
const stubState = {
    /** @type {object|null} What `mc.getPlayer()` returns. */
    player: null,
    /** @type {object|null} What `mc.getWorld()` returns (an opaque token). */
    world: null,
    /** @type {object[]} Backing array for `world.getLivingEntitiesInRange()`. */
    entitiesInRange: [],
    /** @type {object[]} Backing array for `world.getEntities()`. */
    entities: [],
    /** @type {object[]} Backing array for the local `player.getEffects()`. */
    effects: [],
};

/**
 * Wraps `members` so that reading anything not in it throws instead of
 * answering `undefined`.
 *
 * The sandbox is default-deny: under `HostAccess.EXPLICIT` a member with no
 * `@HostAccess.Export` is invisible to script code. A plain object literal
 * cannot model that — it answers whatever you ask. This proxy models the
 * denial, and errs on the strict side: in-game a bare *field* read is silently
 * `undefined` (which is how `mc.player` shipped), while here it throws.
 *
 * Symbol keys pass through as `undefined` so `assert`, `util.inspect`, and
 * `typeof` keep working, and writes are allowed so a test can monkey-patch a
 * member (see tests/PacketNoFall.test.js).
 *
 * @param {string} name Display name used in the error message.
 * @param {object} members The exported members, mirroring the Java `@HostAccess.Export` set.
 * @returns {object} A proxy over `members`.
 */
function hostObject(name, members) {
    return new Proxy(members, {
        get(target, prop, receiver) {
            if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
            throw new TypeError(
                `${name} has no member '${String(prop)}'. Under HostAccess.EXPLICIT only ` +
                    `@HostAccess.Export-annotated members are reachable from a script — everything ` +
                    `else is invisible (a field reads as undefined in-game, a call throws ` +
                    `"Unknown identifier"). Check the Java proxy for the real member set.`,
            );
        },
    });
}

/**
 * Builds a `ScriptList`-shaped fake over a plain array.
 *
 * `ScriptList` exists because `HostAccess.EXPLICIT` grants no container access:
 * a raw `java.util.List` handed to a script is inert. The wrapper exports
 * exactly three members, so a script must use `size()`/`get(i)` — `.length`,
 * `list[0]`, `for..of`, `.map`, and the rest are all unavailable.
 *
 * @template T
 * @param {T[]} [items] Backing array (copied by reference; reads are live).
 * @returns {{size: () => number, isEmpty: () => boolean, get: (i: number) => T|null}}
 */
function scriptList(items = []) {
    return hostObject("ScriptList", {
        size: () => items.length,
        isEmpty: () => items.length === 0,
        // ScriptList.get is bounds-safe: out of range returns null, never throws.
        get: (i) => (i >= 0 && i < items.length ? items[i] : null),
    });
}

/**
 * Builds a `ScriptVec3`-shaped fake. Exposes `getX()`/`getY()`/`getZ()` —
 * never `.x`, which is what `Vec3`/JOML `Vector3d` would have needed and which
 * reads as `undefined` in-game.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function makeFakeVec3(x = 0, y = 0, z = 0) {
    const self = hostObject("ScriptVec3", {
        getX: () => x,
        getY: () => y,
        getZ: () => z,
        length: () => Math.sqrt(x * x + y * y + z * z),
        distanceTo: (other) => {
            const dx = x - other.getX();
            const dy = y - other.getY();
            const dz = z - other.getZ();
            return Math.sqrt(dx * dx + dy * dy + dz * dz);
        },
        add: (other) => makeFakeVec3(x + other.getX(), y + other.getY(), z + other.getZ()),
        subtract: (other) => makeFakeVec3(x - other.getX(), y - other.getY(), z - other.getZ()),
        toString: () => `ScriptVec3(${x}, ${y}, ${z})`,
    });
    return self;
}

/**
 * Builds a `ScriptBox2D`-shaped fake — the screen-space box
 * `esp.getEntityBox2D()` returns.
 *
 * Mind the layout: the components are `(x, y, width, height)`, NOT four
 * corners. The Java wrapper exports both spellings of the same rectangle — the
 * raw component names the old javadocs used (`getZ()` is the width, `getW()`
 * the height) and the readable ones (`getWidth`/`getHeight`, plus the
 * `getX1`/`getY1`/`getX2`/`getY2` edges).
 *
 * @param {number} x Left edge.
 * @param {number} y Top edge.
 * @param {number} width
 * @param {number} height
 */
function makeFakeBox2D(x = 0, y = 0, width = 0, height = 0) {
    return hostObject("ScriptBox2D", {
        getX: () => x,
        getY: () => y,
        getZ: () => width,
        getW: () => height,
        getX1: () => x,
        getY1: () => y,
        getX2: () => x + width,
        getY2: () => y + height,
        getWidth: () => width,
        getHeight: () => height,
        toString: () => `Box2D{x=${x}, y=${y}, width=${width}, height=${height}}`,
    });
}

/** Builds a `ScriptBox3D`-shaped fake (what `player.getBoundingBox()` returns). */
function makeFakeBox3D(minX = 0, minY = 0, minZ = 0, maxX = 1, maxY = 1, maxZ = 1) {
    return hostObject("ScriptBox3D", {
        getMinX: () => minX,
        getMinY: () => minY,
        getMinZ: () => minZ,
        getMaxX: () => maxX,
        getMaxY: () => maxY,
        getMaxZ: () => maxZ,
        getWidth: () => maxX - minX,
        getHeight: () => maxY - minY,
        getDepth: () => maxZ - minZ,
        toString: () => `ScriptBox3D(${minX}, ${minY}, ${minZ} -> ${maxX}, ${maxY}, ${maxZ})`,
    });
}

/** Builds a `ScriptVec2f`-shaped fake — a yaw/pitch pair, never `.yaw`/`.pitch`. */
function makeFakeVec2f(yaw = 0, pitch = 0) {
    return hostObject("ScriptVec2f", {
        getYaw: () => yaw,
        getPitch: () => pitch,
    });
}

/**
 * Builds a `ScriptEffect`-shaped fake.
 *
 * Note the amplifier convention: `getAmplifier()` is 0-based (raw Minecraft),
 * `getLevel()` is 1-based (what a nameplate shows) — Strength II is
 * amplifier 1, level 2.
 *
 * @param {object} [o]
 * @param {string} [o.id] Namespaced id, e.g. "minecraft:strength".
 * @param {string} [o.name] Localised display name, e.g. "Strength".
 * @param {number} [o.amplifier] 0-based amplifier.
 * @param {number} [o.duration] Remaining duration in ticks.
 * @param {boolean} [o.infinite]
 * @param {boolean} [o.ambient]
 * @param {number} [o.color] Packed ARGB.
 */
function makeFakeEffect(o = {}) {
    const id = o.id ?? "minecraft:strength";
    const name = o.name ?? "Strength";
    const amplifier = o.amplifier ?? 0;
    const duration = o.duration ?? 200;
    return hostObject("ScriptEffect", {
        getId: () => id,
        getName: () => name,
        getAmplifier: () => amplifier,
        getLevel: () => amplifier + 1,
        getDuration: () => duration,
        getDurationSeconds: () => Math.floor(duration / 20),
        isInfinite: () => o.infinite ?? false,
        isAmbient: () => o.ambient ?? false,
        getColor: () => o.color ?? 0,
    });
}

/**
 * Builds a `ScriptEntity`-shaped fake — what `world.getLivingEntitiesInRange()`,
 * `mc.getPlayer()`, and `attackEvent.getTarget()` hand a script.
 *
 * `getName()` returns a plain String. It used to be a Minecraft `Component`,
 * which forced the `entity.getName().getString()` idiom; that idiom is now dead
 * and this fake will throw on it.
 *
 * Living-only reads (`getHealth`/`getMaxHealth`/`getAbsorption`/`getArmor`)
 * answer the `-1` sentinel on a non-living entity.
 *
 * @param {object} [o]
 * @param {string} [o.name]
 * @param {object[]} [o.effects] `makeFakeEffect()` values.
 */
function makeFakeEntity(o = {}) {
    const living = o.living ?? true;
    const effects = o.effects ?? [];
    const sentinel = (value) => (living ? value : -1);
    return hostObject("ScriptEntity", {
        getName: () => o.name ?? "Entity",
        getId: () => o.id ?? 1,
        getUuid: () => o.uuid ?? "00000000-0000-0000-0000-000000000000",
        isAlive: () => o.alive ?? true,
        isLiving: () => living,
        isPlayer: () => o.player ?? false,
        getX: () => o.x ?? 0,
        getY: () => o.y ?? 64,
        getZ: () => o.z ?? 0,
        getYaw: () => o.yaw ?? 0,
        getPitch: () => o.pitch ?? 0,
        getHealth: () => sentinel(o.health ?? 20),
        getMaxHealth: () => sentinel(o.maxHealth ?? 20),
        getAbsorption: () => sentinel(o.absorption ?? 0),
        getArmor: () => sentinel(o.armor ?? 0),
        getDistance: () => o.distance ?? 0,
        hasEffect: (name) => effects.some((e) => e.getName().toLowerCase() === String(name).toLowerCase()),
        getEffect: (name) => effects.find((e) => e.getName().toLowerCase() === String(name).toLowerCase()) ?? null,
        getEffects: () => scriptList(effects),
    });
}

/** Builds a `ScriptItemStack`-shaped fake — what the `inventory` stack getters return. */
function makeFakeItemStack(o = {}) {
    return hostObject("ScriptItemStack", {
        isEmpty: () => o.empty ?? false,
        getCount: () => o.count ?? 1,
        getName: () => o.name ?? "Stone",
        getId: () => o.id ?? "minecraft:stone",
        isDamageable: () => o.damageable ?? false,
        getDamage: () => o.damage ?? 0,
        getMaxDamage: () => o.maxDamage ?? 0,
        isBlock: () => o.block ?? true,
    });
}

/** Builds a `ScriptImage`-shaped fake — what `renderer.loadImage()` returns. */
function makeFakeImage(o = {}) {
    return hostObject("ScriptImage", {
        isValid: () => o.valid ?? false,
        getWidth: () => o.width ?? 0,
        getHeight: () => o.height ?? 0,
        toString: () => "ScriptImage",
    });
}

/**
 * Builds an opaque pass-back token — a value the host hands a script for the
 * sole purpose of handing it straight back to another host method. Under
 * `HostAccess.EXPLICIT` a script can read nothing off it, and that is
 * intentional (see `ScriptRaytracedRotation.getHitResult` and
 * `MinecraftProxy.getWorld` in the opal repo). Modelled as a memberless brand
 * so any attempt to introspect one fails here too.
 *
 * @param {string} name Display name used in the error message.
 */
function makeOpaqueToken(name) {
    return hostObject(name, {});
}

/** Resets the staged world state to "not in a world, nothing nearby". */
function resetStubState() {
    stubState.player = null;
    stubState.world = null;
    stubState.entitiesInRange = [];
    stubState.entities = [];
    stubState.effects = [];
}

if (!globalThis.__opalStubInstalled) {
    globalThis.__opalStubInstalled = true;

    const noop = () => {};
    const noopReturning = (value) => () => value;

    /** A minimal fake `module` handle passed to every registerModule callback. */
    function makeFakeModule() {
        const settings = new Map();
        const handlers = new Map();
        let bind = -2; // keys.NONE
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
            setBind: (code) => {
                bind = code;
            },
            getBind: () => bind,
            clearBind: () => {
                bind = -2;
            },
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

    globalThis.renderer = hostObject(
        "renderer",
        Object.assign(
            {
                rect: noop,
                roundedRect: noop,
                roundedRectVarying: noop,
                roundedRectVaryingGradient: noop,
                circle: noop,
                rectGradient: noop,
                roundedRectGradient: noop,
                rectOutline: noop,
                roundedRectOutline: noop,
                roundedRectOutlineVarying: noop,
                rectStroke: noop,
                rectOutlineStroke: noop,
                rainbowRect: noop,
                shadow: noop,
                blurFill: noop,
                blurFillVarying: noop,
                glowFill: noop,
                innerGlow: noop,
                loadImage: () => makeFakeImage({ valid: false }),
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
                // ScriptList<String>, not a JS array.
                wrapText: () => scriptList([]),
                trimText: noopReturning(""),
                scale: (_f, _x, _y, _w, _h, content) => content(),
                rotate: (_deg, _x, _y, _w, _h, content) => content(),
                scissor: (_x, _y, _w, _h, content) => content(),
                globalAlpha: noop,
            },
            colorFns,
        ),
    );

    globalThis.notification = hostObject("notification", {
        success: noop,
        error: noop,
        warn: noop,
        info: noop,
        show: noop,
    });

    globalThis.overlay = hostObject("overlay", {
        createIsland: noopReturning("stub-island"),
        showIsland: noop,
        hideIsland: noop,
        destroyIsland: noop,
        setIslandWidth: noop,
        setIslandHeight: noop,
        setIslandPriority: noop,
    });

    globalThis.modules = hostObject("modules", {
        exists: noopReturning(false),
        isEnabled: noopReturning(false),
        setEnabled: noop,
        toggle: noop,
        getCategory: noopReturning(null),
        getSuffix: noopReturning(null),
        isVisible: noopReturning(true),
        setVisible: noop,
        // All three return ScriptList<String>, not a JS array.
        listAll: () => scriptList([]),
        listCategory: () => scriptList([]),
        listEnabled: () => scriptList([]),
    });

    // client.getModule() is deliberately absent — it returned a raw Module,
    // which was unreadable from script land, and was deleted upstream. The
    // `modules` global covers the surface by id.
    globalThis.client = hostObject("client", {
        print: noop,
        success: noop,
        error: noop,
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
    });

    globalThis.player = hostObject("player", {
        getEyePosition: () => makeFakeVec3(0, 65.62, 0),
        getPosition: () => makeFakeVec3(0, 64, 0),
        getBlockPosition: () => new globalThis.BlockPos(0, 64, 0),
        getVelocity: () => makeFakeVec3(0, 0, 0),
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
        getArmor: noopReturning(0),
        hasEffect: (name) => stubState.effects.some((e) => e.getName().toLowerCase() === String(name).toLowerCase()),
        getEffect: (name) =>
            stubState.effects.find((e) => e.getName().toLowerCase() === String(name).toLowerCase()) ?? null,
        getEffects: () => scriptList(stubState.effects),
        canCrit: noopReturning(false),
        getAttackDamage: noopReturning(1),
        getEntityInteractionRange: noopReturning(3),
        isHoldingWeapon: noopReturning(false),
        getDistanceToEntity: (entity) => (entity === null ? -1 : entity.getDistance()),
        getClosestPoint: () => makeFakeVec3(0, 64, 0),
        isBoxEmpty: noopReturning(true),
        isBoxEmptyBelow: noopReturning(true),
        getBoundingBox: () => makeFakeBox3D(-0.3, 64, -0.3, 0.3, 65.8, 0.3),
        getStandingEyeHeight: noopReturning(1.62),
        swingHand: noop,
        useItem: noop,
    });

    globalThis.movement = hostObject("movement", {
        getBlocksPerSecond: noopReturning(0),
        getSpeed: noopReturning(0),
        // ScriptList<Double> of [x, z], not a JS array.
        yawPos: () => scriptList([0, 0]),
        setEntitySpeed: noop,
        setSpeed: noop,
        getSwiftnessSpeed: (speed) => speed,
        getMoveYaw: noopReturning(0),
        getDirectionDegrees: noopReturning(0),
        getDirectionRadians: noopReturning(0),
        getDirection: noopReturning(0),
        isMoving: noopReturning(false),
    });

    globalThis.rotation = hostObject("rotation", {
        set: noop,
        setSmooth: noop,
        getRotationFromPosition: () => makeFakeVec2f(0, 0),
        getRotationFromBlock: () => makeFakeVec2f(0, 0),
        getRotationFromRaycastedBlock: noopReturning(null),
        getRotationFromRaycastedEntity: noopReturning(null),
        getRotationVector: () => makeFakeVec3(0, 0, 1),
        getRotation: () => makeFakeVec2f(0, 0),
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
    });

    globalThis.inventory = hostObject("inventory", {
        setSlot: noop,
        setSlotSilent: noop,
        setSlotFullSilent: noop,
        sendSlotPacket: noop,
        getSelectedSlot: noopReturning(0),
        findBlock: noopReturning(-1),
        findItem: noopReturning(-1),
        findItemInInventory: noopReturning(-1),
        // All three return ScriptItemStack (or null for an out-of-range slot).
        getStack: () => makeFakeItemStack({ empty: true, name: "Air", id: "minecraft:air", count: 0 }),
        getMainHandStack: () => makeFakeItemStack({ empty: true, name: "Air", id: "minecraft:air", count: 0 }),
        getOffHandStack: () => makeFakeItemStack({ empty: true, name: "Air", id: "minecraft:air", count: 0 }),
        isHeldItemBlock: noopReturning(false),
        isBlock: noopReturning(false),
        getItemName: noopReturning(""),
        getItemCount: noopReturning(0),
        countItem: noopReturning(0),
        countBlocks: noopReturning(0),
    });

    // world.getBlockState()/getBlock() are deliberately absent — both returned
    // raw, unreadable Mojang types and were deleted upstream. getBlockName /
    // isAir / isSolid / isReplaceable / getBlockHardness already flatten
    // everything a script could actually reach.
    globalThis.world = hostObject("world", {
        isAir: noopReturning(false),
        isReplaceable: noopReturning(false),
        isSolid: noopReturning(true),
        getBlockName: noopReturning(""),
        getBlockHardness: noopReturning(0),
        hasAdjacentBlock: noopReturning(false),
        getAdjacentDirections: () => scriptList([]),
        getEntities: () => scriptList(stubState.entities),
        getLivingEntitiesInRange: () => scriptList(stubState.entitiesInRange),
        getTime: noopReturning(0),
        getTimeOfDay: noopReturning(0),
        getDimension: noopReturning("minecraft:overworld"),
    });

    globalThis.esp = hostObject("esp", {
        // ScriptBox2D, or null when the entity is off-screen/behind the camera.
        getEntityBox2D: noopReturning(null),
        project: () => makeFakeVec3(0, 0, 0),
        projectVec: () => makeFakeVec3(0, 0, 0),
        getInterpolatedPosition: () => makeFakeVec3(0, 64, 0),
        lerp: (start, end, t) => start + (end - start) * t,
        isOnScreen: noopReturning(false),
        isEntityOnScreen: noopReturning(false),
    });

    globalThis.palette = hostObject("palette", {
        createView: noopReturning("stub-view"),
        openView: noop,
        removeView: noop,
    });

    // The real `keys` global (KeyCodes.java) exports a fixed set of int fields.
    // Anything outside it is not a key code — a typo must fail, not read 0.
    globalThis.keys = hostObject("keys", {
        UP: 265,
        DOWN: 264,
        LEFT: 263,
        RIGHT: 262,
        SPACE: 32,
        ENTER: 257,
        ESCAPE: 256,
        TAB: 258,
        BACKSPACE: 259,
        LEFT_SHIFT: 340,
        LEFT_CONTROL: 341,
        A: 65, B: 66, C: 67, D: 68, E: 69, F: 70, G: 71, H: 72, I: 73,
        J: 74, K: 75, L: 76, M: 77, N: 78, O: 79, P: 80, Q: 81, R: 82,
        S: 83, T: 84, U: 85, V: 86, W: 87, X: 88, Y: 89, Z: 90,
        NUM_0: 48, NUM_1: 49, NUM_2: 50, NUM_3: 51, NUM_4: 52,
        NUM_5: 53, NUM_6: 54, NUM_7: 55, NUM_8: 56, NUM_9: 57,
        F1: 290, F2: 291, F3: 292, F4: 293, F5: 294, F6: 295,
        F7: 296, F8: 297, F9: 298, F10: 299, F11: 300, F12: 301,
        MOUSE_0: 0, MOUSE_1: 1, MOUSE_2: 2, MOUSE_3: 3, MOUSE_4: 4,
        NONE: -2,
    });

    // mc.player / mc.world are deliberately absent: GraalJS does no
    // bean-property mapping under HostAccess.EXPLICIT, so only the getters
    // resolve in-game. Reading `mc.player` here throws rather than silently
    // answering null — which is how 27 dead `mc.player === null` guards shipped.
    globalThis.mc = hostObject("mc", {
        interactionManager: hostObject("interactionManager", {
            interactBlock: noop,
            updateBlockBreakingProgress: noopReturning(false),
            cancelBlockBreaking: noop,
            isBreakingBlock: noopReturning(false),
            attackEntity: noop,
            interactItem: noop,
            stopUsingItem: noop,
        }),
        getPlayer: () => stubState.player,
        getWorld: () => stubState.world,
        getInteractionManager: () => globalThis.mc.interactionManager,
    });

    /** A real (Date.now()-backed) stopwatch, so `passed`/`passedAndReset` are
     * actually meaningful in a test rather than hardcoded stubs. */
    function makeFakeStopwatch() {
        let last = Date.now();
        return hostObject("ScriptTimer", {
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
        });
    }

    globalThis.timer = hostObject("timer", {
        create: makeFakeStopwatch,
        now: () => Date.now(),
    });

    globalThis.MAIN_HAND = "MAIN_HAND";
    globalThis.OFF_HAND = "OFF_HAND";

    // Bound to ScriptBlockPos.class upstream: constructible, and exposing only
    // getX/getY/getZ/offset. No `.x` field — that would read undefined in-game.
    globalThis.BlockPos = class BlockPos {
        constructor(x, y, z) {
            const self = hostObject("ScriptBlockPos", {
                getX: () => x,
                getY: () => y,
                getZ: () => z,
                offset: (direction) => (direction && direction.apply ? direction.apply(self) : self),
            });
            return self;
        }
    };

    // Bound to ScriptVec2f.class upstream.
    globalThis.Vec2f = class Vec2f {
        constructor(yaw, pitch) {
            return makeFakeVec2f(yaw, pitch);
        }
    };

    // The `Vec3d` global is bound to ScriptVec3.class upstream, so
    // `new Vec3d(x, y, z)` yields a ScriptVec3 — getX/getY/getZ, never `.x`.
    // The `Vec3i` global was removed (integer-valued; ScriptVec3 is doubles,
    // and BlockPos already serves integer points), so it is absent here too.
    globalThis.Vec3d = class Vec3d {
        constructor(x, y, z) {
            return makeFakeVec3(x, y, z);
        }
    };

    // MathHelper is bound to the raw Mojang `Mth` class, which carries no
    // @HostAccess.Export — so every call on it is denied in-game. Modelled as
    // a memberless brand so a script that reaches for it fails here too.
    globalThis.MathHelper = makeOpaqueToken("MathHelper");

    // Color's two ctors and getRGB() are the JDK allow-list exception —
    // explicitly permitted by the host-access policy, so this one is real.
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
//  reach the handler a script registered via `module.on(...)`, (b) build a
//  fake event payload matching the shapes in opal-globals.d.ts, and (c) stage
//  world state via `stubState`, so it can drive that handler directly. See
//  tests/PacketNoFall.test.js and tests/PotionAlert.test.js.
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

/** Returns the fake `module` handle a script registered, for asserting on `getBind()` etc. */
function getRegisteredModule(moduleIndex = registeredFakeModules.length - 1) {
    return registeredFakeModules[moduleIndex];
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

/**
 * Builds a fake `attack` event payload.
 *
 * `getTarget()` hands back a `ScriptEntity`; the flattened `getTargetName()`
 * etc. accessors are derived from it so the two can never disagree.
 *
 * @param {object} [overrides]
 * @param {object} [overrides.target] A `makeFakeEntity()` value.
 */
function makeFakeAttackEvent(overrides = {}) {
    const target = overrides.target ?? makeFakeEntity({ name: "Target", distance: 3 });
    return {
        getTarget: () => target,
        getTargetName: () => target.getName(),
        getTargetId: () => target.getId(),
        getTargetHealth: () => target.getHealth(),
        getTargetMaxHealth: () => target.getMaxHealth(),
        getTargetDistance: () => target.getDistance(),
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

/** Builds a fake `preMove` event payload (see `PreMoveEvent` in opal-globals.d.ts). */
function makeFakePreMoveEvent(overrides = {}) {
    const state = Object.assign({ speed: 0, inputX: 0, inputY: 0, inputZ: 0, cancelled: false }, overrides);
    const calls = { cancel: 0 };
    return {
        getSpeed: () => state.speed,
        getInputX: () => state.inputX,
        getInputY: () => state.inputY,
        getInputZ: () => state.inputZ,
        isCancelled: () => state.cancelled,
        cancel: () => {
            calls.cancel += 1;
            state.cancelled = true;
        },
        calls,
    };
}

/** Builds a fake read-only `postMove` event payload (see `PostMoveEvent` in opal-globals.d.ts). */
function makeFakePostMoveEvent(overrides = {}) {
    const state = Object.assign({ speed: 0, inputX: 0, inputY: 0, inputZ: 0 }, overrides);
    return {
        getSpeed: () => state.speed,
        getInputX: () => state.inputX,
        getInputY: () => state.inputY,
        getInputZ: () => state.inputZ,
    };
}

/** Builds a fake `serverConnect` event payload (see `ServerConnectEvent` in opal-globals.d.ts). */
function makeFakeServerConnectEvent(overrides = {}) {
    const state = Object.assign({ host: "localhost", port: 25565, cancelled: false }, overrides);
    const calls = { cancel: 0 };
    return {
        getHost: () => state.host,
        getPort: () => state.port,
        getAddress: () => `${state.host}:${state.port}`,
        isCancelled: () => state.cancelled,
        cancel: () => {
            calls.cancel += 1;
            state.cancelled = true;
        },
        calls,
    };
}

/** Builds a fake `blockUpdate` event payload (see `BlockUpdateEvent` in opal-globals.d.ts). */
function makeFakeBlockUpdateEvent(overrides = {}) {
    const state = Object.assign({ x: 0, y: 64, z: 0, oldBlock: "Air", newBlock: "Air" }, overrides);
    return {
        getX: () => state.x,
        getY: () => state.y,
        getZ: () => state.z,
        getOldBlock: () => state.oldBlock,
        getNewBlock: () => state.newBlock,
    };
}

/**
 * Builds a fake `keyPress`/`mousePress` event payload (see `KeyPressEvent`/
 * `MousePressEvent` in opal-globals.d.ts, both sharing the `InteractionCodeEvent` shape).
 *
 * @param {number} [code] GLFW key or mouse-button code.
 */
function makeFakeInputEvent(code = 0) {
    return {
        getCode: () => code,
    };
}

/** Builds a fake `swing` event payload (see `SwingEvent` in opal-globals.d.ts). */
function makeFakeSwingEvent(mainHand = true) {
    return {
        isMainHand: () => mainHand,
    };
}

module.exports = {
    getRegisteredHandler,
    getRegisteredModule,
    stubState,
    resetStubState,
    scriptList,
    makeFakeEntity,
    makeFakeEffect,
    makeFakeVec3,
    makeFakeVec2f,
    makeFakeBox2D,
    makeFakeBox3D,
    makeFakeItemStack,
    makeFakeImage,
    makeOpaqueToken,
    makeFakePreMovementPacketEvent,
    makeFakePostMovementPacketEvent,
    makeFakePacketEvent,
    makeFakeChatReceivedEvent,
    makeFakeAttackEvent,
    makeFakeJumpEvent,
    makeFakePreMoveEvent,
    makeFakePostMoveEvent,
    makeFakeServerConnectEvent,
    makeFakeBlockUpdateEvent,
    makeFakeInputEvent,
    makeFakeSwingEvent,
};

// Tests for the procedural sound module. Web Audio does not exist in Node, so
// AudioContext is stubbed with a recording double that counts the oscillators
// each effect schedules. This proves every effect runs without throwing, that
// mute genuinely suppresses output, and that mute state round-trips through
// localStorage.
//
// Run with:  node tests/sound.js

const fs = require("fs");
const vm = require("vm");
const path = require("path");

let oscillatorsCreated = 0;

function makeParam() {
    return {
        setValueAtTime() {},
        linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}
    };
}

function makeAudioContextClass() {
    return class AudioContext {
        constructor() {
            this.state = "suspended";
            this.currentTime = 0;
            this.destination = {};
        }
        resume() { this.state = "running"; return Promise.resolve(); }
        createGain() {
            return { gain: makeParam(), connect() {} };
        }
        createOscillator() {
            oscillatorsCreated++;
            return {
                type: "square",
                frequency: makeParam(),
                connect() {},
                start() {},
                stop() {}
            };
        }
    };
}

function loadSound(initialMuted) {
    const store = {};
    if (initialMuted) store.vtcadeMuted = "1";

    const listeners = {};
    const ctx = {
        console,
        AudioContext: makeAudioContextClass(),
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        },
        addEventListener: (type, fn) => { (listeners[type] || (listeners[type] = [])).push(fn); },
        Object, Promise, Math
    };
    ctx.window = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "FrontEnd", "shared", "sound.js"), "utf8"), ctx);
    return { VTSound: ctx.VTSound, store, fire: (type) => (listeners[type] || []).forEach((f) => f()) };
}

let failures = 0;
function check(label, cond, detail) {
    if (cond) {
        console.log("  PASS  " + label);
    } else {
        failures++;
        console.log("  FAIL  " + label + (detail ? "  -> " + detail : ""));
    }
}

const EFFECTS = ["nav", "select", "back", "type", "error", "success",
                 "start", "eat", "jump", "flap", "point", "gameOver", "newRecord"];

console.log("=== SOUND MODULE ===");
{
    const { VTSound, fire } = loadSound(false);

    check("every documented effect exists", EFFECTS.every((e) => typeof VTSound[e] === "function"),
        EFFECTS.filter((e) => typeof VTSound[e] !== "function").join(", "));

    fire("keydown");   // unlock the context, as a real first keypress would

    let threw = null;
    EFFECTS.forEach((e) => { try { VTSound[e](); } catch (err) { threw = e + ": " + err.message; } });
    check("every effect runs without throwing", threw === null, threw);

    oscillatorsCreated = 0;
    VTSound.eat();
    check("an unmuted effect actually schedules a tone", oscillatorsCreated > 0,
        oscillatorsCreated + " oscillators");
}

console.log("\n=== MUTE ===");
{
    const { VTSound, store } = loadSound(false);
    VTSound.unlock();

    oscillatorsCreated = 0;
    VTSound.setMuted(true);
    EFFECTS.forEach((e) => VTSound[e]());
    check("muted: no effect schedules any tone", oscillatorsCreated === 0,
        oscillatorsCreated + " oscillators leaked while muted");
    check("muting persists to localStorage", store.vtcadeMuted === "1", store.vtcadeMuted);

    const nowMuted = VTSound.toggleMute();
    check("toggle from muted returns unmuted", nowMuted === false);
    check("unmuting persists to localStorage", store.vtcadeMuted === "0", store.vtcadeMuted);

    oscillatorsCreated = 0;
    VTSound.point();
    check("after unmute, effects play again", oscillatorsCreated > 0);
}

console.log("\n=== MUTE STATE IS LOADED FROM STORAGE ===");
{
    const { VTSound } = loadSound(true);   // page opened with mute already set
    check("starts muted when storage says so", VTSound.isMuted() === true);
    oscillatorsCreated = 0;
    VTSound.gameOver();
    check("respects stored mute on load", oscillatorsCreated === 0);
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures ? 1 : 0);

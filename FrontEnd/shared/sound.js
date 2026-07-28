// Procedural sound for VTcade.
//
// The whole site ships with no images and no build step, so the audio is
// synthesised at runtime with the Web Audio API rather than loaded from files.
// Square and sawtooth waves with short envelopes give the 1980s terminal beep
// the rest of the aesthetic is going for.
//
// One shared module, the same as config / session / gameApi / gameUI. Every
// surface calls VTSound.<effect>(). Mute state lives in localStorage, so it is
// shared across every page: mute once in a game and the login screen is quiet
// too.

(function (global) {
    var STORAGE_KEY = "vtcadeMuted";

    var ctx = null;
    var master = null;
    var muted = false;
    try {
        muted = localStorage.getItem(STORAGE_KEY) === "1";
    } catch (e) {
        // localStorage can throw when storage is blocked; default to unmuted.
    }

    function ensureContext() {
        if (ctx) return ctx;
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;                 // very old browser: silently no-op
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.14;             // keep the whole thing gentle
        master.connect(ctx.destination);
        return ctx;
    }

    // Browsers start the context suspended until the first user gesture, so the
    // first interaction on any page resumes it. Without this the first beep is
    // swallowed.
    function unlock() {
        var c = ensureContext();
        if (c && c.state === "suspended" && c.resume) c.resume();
    }
    global.addEventListener("keydown", unlock, { passive: true });
    global.addEventListener("pointerdown", unlock, { passive: true });

    // A single tone with a fast attack and a short exponential decay, so it
    // starts and ends without the click a raw gate would produce.
    function tone(freq, dur, type, delay, vol) {
        if (muted) return;
        var c = ensureContext();
        if (!c) return;
        if (c.state === "suspended" && c.resume) c.resume();

        var t0 = c.currentTime + (delay || 0);
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = type || "square";
        osc.frequency.setValueAtTime(freq, t0);

        var peak = vol == null ? 1 : vol;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    // A pitch slide, for jumps and the game-over fall.
    function sweep(fromFreq, toFreq, dur, type, vol) {
        if (muted) return;
        var c = ensureContext();
        if (!c) return;
        if (c.state === "suspended" && c.resume) c.resume();

        var t0 = c.currentTime;
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.type = type || "square";
        osc.frequency.setValueAtTime(fromFreq, t0);
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, toFreq), t0 + dur);

        var peak = vol == null ? 1 : vol;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + 0.02);
    }

    // A short run of notes, back to back.
    function seq(notes, type) {
        if (muted) return;
        var at = 0;
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            tone(n.f, n.d, type, at, n.v);
            at += n.d * 0.9;
        }
    }

    var SFX = {
        // Menus
        nav:       function () { tone(440, 0.04, "square", 0, 0.5); },
        select:    function () { seq([{ f: 520, d: 0.05 }, { f: 784, d: 0.07 }]); },
        back:      function () { seq([{ f: 520, d: 0.05 }, { f: 330, d: 0.07 }]); },
        type:      function () { tone(1180, 0.014, "square", 0, 0.22); },
        error:     function () { tone(150, 0.28, "sawtooth", 0, 0.8); },
        success:   function () { seq([{ f: 523, d: 0.08 }, { f: 659, d: 0.08 }, { f: 784, d: 0.14 }]); },

        // Games
        start:     function () { seq([{ f: 392, d: 0.08 }, { f: 523, d: 0.08 }, { f: 784, d: 0.14 }]); },
        eat:       function () { tone(880, 0.05, "square", 0, 0.6); },
        jump:      function () { sweep(300, 720, 0.12, "square", 0.7); },
        flap:      function () { sweep(360, 700, 0.10, "square", 0.7); },
        point:     function () { seq([{ f: 660, d: 0.05 }, { f: 990, d: 0.06 }]); },
        gameOver:  function () { seq([{ f: 392, d: 0.14 }, { f: 311, d: 0.16 }, { f: 196, d: 0.30 }]); },
        newRecord: function () { seq([{ f: 523, d: 0.09 }, { f: 659, d: 0.09 }, { f: 784, d: 0.09 }, { f: 1047, d: 0.22 }]); }
    };

    function isMuted() {
        return muted;
    }

    function setMuted(value) {
        muted = !!value;
        try {
            localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
        } catch (e) {
            // ignore storage failures; mute still works for this page
        }
    }

    // Returns the new muted state. Plays a blip when turning sound back on so
    // the change is audible.
    function toggleMute() {
        setMuted(!muted);
        if (!muted) {
            unlock();
            SFX.nav();
        }
        return muted;
    }

    var api = {
        isMuted: isMuted,
        setMuted: setMuted,
        toggleMute: toggleMute,
        unlock: unlock
    };
    for (var key in SFX) {
        if (Object.prototype.hasOwnProperty.call(SFX, key)) api[key] = SFX[key];
    }

    global.VTSound = api;
})(window);

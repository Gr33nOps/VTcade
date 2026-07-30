// Shared keyboard rules for the screens you type into: login, signup, the admin
// login and the password reset.
//
// All four draw their own fields into a <pre> and collect characters straight
// off the document's keydown, and two rules there were swallowing real
// characters:
//
//   * `m` and `M` were bound to the sound toggle on EVERY screen, typed ones
//     included, and the toggle called preventDefault. So no field on the site
//     could contain the letter m, which rules out gmail.com and most people's
//     name. Nothing advertised the key on those screens either, so the letter
//     simply vanished as you typed.
//
//   * a character was only accepted when `!e.ctrlKey`, and AltGr on Windows
//     reports itself as Ctrl+Alt. On every layout that puts @ behind AltGr
//     (German, Spanish, Polish, Turkish and more) the key did nothing at all,
//     which is how an address can reach the server with no @ in it.
//
// The rule now: on a screen you type into, every printable key belongs to the
// field, and the sound toggle is F2, advertised in that screen's COMMANDS
// block. M keeps its site-wide meaning everywhere there is nothing to type
// into: the dashboard, the admin panel and the games.
(function (global) {

    // True when this keypress is a character that should land in a field.
    function isTypedChar(e) {
        // Named keys ("Enter", "ArrowUp", "F2", "Dead") are longer than one
        // UTF-16 unit; a character is exactly one.
        if (!e.key || e.key.length !== 1) return false;
        if (e.metaKey) return false;
        // Ctrl on its own is a shortcut. Ctrl WITH Alt is how Windows reports
        // AltGr, which produces genuine characters, so it has to fall through.
        if (e.ctrlKey && !e.altKey) return false;
        return true;
    }

    // The sound toggle for typed screens. A function key, because every letter
    // is spoken for. These screens already use F1 for admin access, so it is
    // the same idiom.
    function isSoundToggle(e) {
        return e.key === "F2" && !e.ctrlKey && !e.metaKey && !e.altKey;
    }

    global.VTKeys = { isTypedChar: isTypedChar, isSoundToggle: isSoundToggle };
})(window);

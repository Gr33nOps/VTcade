// Terminal style copy and paste for the typed screens.
//
// Every input on this site is a character rendered into a <pre>, not a real
// focused <input>, and `user-select: none` means there is nothing to select
// with a mouse either. So the browser's own copy and paste had nothing to act
// on, and a long password or an email address had to be typed by hand.
//
// A page wires this up by saying which field the cursor is on:
//
//     VTClipboard.attach({
//         field() {
//             if (isSubmitting) return null;              // nothing to type into
//             if (currentField === 0) return { get: () => email, set: v => email = v };
//             if (currentField === 1) return { get: () => password, set: v => password = v };
//             return null;                                // cursor is on a button
//         },
//         redraw: render
//     });

(function (global) {

    // Fields are a single line each, and the rendered row has no wrapping. Take
    // the first line only, drop control characters, and cap the length so a
    // stray paste of a whole file cannot lock the page up rendering it.
    var MAX_PASTE = 256;

    function sanitise(text) {
        return String(text || "")
            .split(/[\r\n]/)[0]
            // Control characters only. Spaces and punctuation must survive,
            // passwords contain both.
            .replace(/[\x00-\x1F\x7F]/g, "")
            .slice(0, MAX_PASTE);
    }

    function attach(config) {
        if (!config || typeof config.field !== "function") return;

        var redraw = config.redraw || function () {};

        function insert(raw) {
            var field = config.field();
            if (!field) return false;

            var text = sanitise(raw);
            if (!text) return false;

            field.set((field.get() || "") + text);
            if (global.VTSound && VTSound.type) VTSound.type();
            redraw();
            return true;
        }

        // ---- Paste ---------------------------------------------------------
        //
        // The native `paste` event is the reliable path: it carries the text
        // with it, so it needs no clipboard permission and raises no prompt.
        // It fires for Ctrl+Shift+V as well as Ctrl+V.
        var handledNatively = false;

        document.addEventListener("paste", function (e) {
            var data = e.clipboardData || global.clipboardData;
            if (!data) return;

            handledNatively = true;
            if (insert(data.getData("text"))) e.preventDefault();
        });

        // Fallback for the case where the browser fires no paste event because
        // nothing focusable is focused. Deliberately does NOT preventDefault,
        // so the native event above still gets its chance first; this only runs
        // if that chance came to nothing.
        document.addEventListener("keydown", function (e) {
            if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyV") return;
            if (!config.field()) return;

            handledNatively = false;
            setTimeout(function () {
                if (handledNatively) return;
                if (!global.navigator || !navigator.clipboard || !navigator.clipboard.readText) return;
                navigator.clipboard.readText().then(insert).catch(function () {
                    // Clipboard read refused or unavailable. Typing still works.
                });
            }, 120);
        });

        // ---- Copy ----------------------------------------------------------
        //
        // Nothing on the page is selectable, so hijacking the copy event cannot
        // stomp on a selection the player made.
        document.addEventListener("copy", function (e) {
            var field = config.field();
            if (!field) return;

            var value = field.get();
            if (!value) return;

            if (e.clipboardData) {
                e.clipboardData.setData("text/plain", value);
                e.preventDefault();
            }
        });

        // Ctrl+Shift+C is the shortcut a terminal uses, but it is also the
        // browser's own "inspect element" binding in both Chrome and Firefox,
        // and a page cannot reliably take it back. Try anyway, and let plain
        // Ctrl+C above be the path that always works.
        document.addEventListener("keydown", function (e) {
            if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.code !== "KeyC") return;

            var field = config.field();
            if (!field) return;

            var value = field.get();
            if (!value) return;

            if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
                e.preventDefault();
                navigator.clipboard.writeText(value).then(function () {
                    if (global.VTSound && VTSound.select) VTSound.select();
                }).catch(function () {
                    // Refused. Ctrl+C still works.
                });
            }
        });
    }

    global.VTClipboard = { attach: attach, sanitise: sanitise };
})(window);

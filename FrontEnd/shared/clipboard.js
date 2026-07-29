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
            if (global.VTSound && global.VTSound.type) global.VTSound.type();
            redraw();
            return true;
        }

        // ---- Paste ---------------------------------------------------------
        //
        // A hidden input, kept focused, purely so the browser has somewhere to
        // deliver a paste.
        //
        // Firefox only fires the `paste` event when a genuinely editable element
        // has focus. Chrome fires it against the document regardless, which is
        // what made the first version of this look correct while being wrong:
        // in Firefox no event arrived, the code fell back to
        // navigator.clipboard.readText(), and Firefox answered that with its own
        // "Paste" confirmation button that has to be clicked. On a site with no
        // cursor, that is worse than not having paste at all.
        //
        // With something focused there is no fallback and no permission: the
        // text rides in on the event. The field itself is off screen and one
        // pixel, and every printable keypress is already preventDefault-ed by
        // the page's own handler, so nothing ever accumulates in it.
        var catcher = document.createElement("input");
        catcher.type = "text";
        catcher.tabIndex = -1;
        catcher.setAttribute("aria-hidden", "true");
        catcher.setAttribute("autocomplete", "off");
        catcher.style.cssText =
            "position:fixed;top:0;left:-9999px;width:1px;height:1px;opacity:0;border:0;padding:0;";

        function mount() {
            if (!catcher.parentNode) document.body.appendChild(catcher);
            keepFocus();
        }

        function keepFocus() {
            if (document.activeElement === catcher) return;
            try {
                catcher.focus({ preventScroll: true });
            } catch (err) {
                catcher.focus();
            }
        }

        if (document.body) mount();
        else document.addEventListener("DOMContentLoaded", mount);

        // Anything can steal focus: a click on the page, returning from another
        // tab, the browser's own chrome. Take it back before the next paste.
        global.addEventListener("focus", keepFocus);
        document.addEventListener("visibilitychange", keepFocus);
        document.addEventListener("keydown", keepFocus, true);
        document.addEventListener("click", keepFocus);

        document.addEventListener("paste", function (e) {
            var data = e.clipboardData || global.clipboardData;
            if (!data) return;

            // Always swallow it. Letting the default through would drop the text
            // into the hidden input, where it would sit invisibly forever.
            e.preventDefault();
            insert(data.getData("text"));
            catcher.value = "";
        });

        // ---- Copy ----------------------------------------------------------
        //
        // Same trick in reverse: put the field's value into the hidden input and
        // select it, then let the browser's own copy take it. No clipboard API,
        // so no permission and no prompt, and it does not matter that the page
        // itself is `user-select: none`.
        //
        // Relying on the `copy` event alone would not work: the hidden input is
        // normally empty with nothing selected, and a browser fires no copy
        // event when there is nothing to copy.
        //
        // This covers Ctrl+Shift+C too, on any browser that lets the page see
        // it. Both Chrome and Firefox bind that to their inspector and a page
        // cannot take it back, which is why Ctrl+C is the documented one.
        document.addEventListener("keydown", function (e) {
            if (!(e.ctrlKey || e.metaKey) || e.code !== "KeyC") return;

            var field = config.field();
            if (!field) return;

            var value = field.get();
            if (!value) return;

            catcher.value = value;
            catcher.select();
            if (global.VTSound && global.VTSound.select) global.VTSound.select();

            // Clear once the browser has taken the selection, so the value is
            // not left sitting in the DOM.
            setTimeout(function () {
                catcher.value = "";
                keepFocus();
            }, 0);
        });
    }

    global.VTClipboard = { attach: attach, sanitise: sanitise };
})(window);

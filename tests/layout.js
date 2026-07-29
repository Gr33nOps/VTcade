// Layout checks for the terminal screens.
//
// Every menu draws two column key/label rows into a <pre>, so they line up only
// because the spacing in the template literal is counted correctly by hand.
// Three of them had drifted by a single character, which is invisible while
// editing and obvious on screen: on the dashboard "Select Option" sat one
// character right of "Sound ON".
//
// Run with:  node tests/layout.js

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "FrontEnd");

let failures = 0;
function check(label, cond, detail) {
    if (cond) {
        console.log("  PASS  " + label);
    } else {
        failures++;
        console.log("  FAIL  " + label + (detail ? "  -> " + detail : ""));
    }
}

function htmlFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...htmlFiles(p));
        else if (entry.name.endsWith(".html")) out.push(p);
    }
    return out;
}

// "    [KEY]    Label                [KEY2]    Label2"
const NAV_ROW = /^\s{2,}\[[^\]]+\]\s{2,}\S.*\[[^\]]+\]\s{2,}\S/;

// Column of the second bracket group, and of the text following it.
function columns(line) {
    const arr = [...line];
    const first = arr.indexOf("[");
    const second = arr.indexOf("[", arr.indexOf("]", first) + 1);
    let label = arr.indexOf("]", second) + 1;
    while (arr[label] === " ") label++;
    return { key: second, label };
}

console.log("\n=== TWO COLUMN NAV ROWS LINE UP ===");
{
    let rows = 0;
    let misaligned = 0;

    for (const file of htmlFiles(ROOT)) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        const lines = fs.readFileSync(file, "utf8").split("\n");
        let prev = null;
        let prevNo = 0;

        lines.forEach((line, i) => {
            if (!NAV_ROW.test(line)) { prev = null; return; }
            rows++;

            const cur = columns(line);
            if (prev && (prev.key !== cur.key || prev.label !== cur.label)) {
                misaligned++;
                console.log("  FAIL  " + rel + ":" + (i + 1) +
                    " second column is " + (cur.label - prev.label) +
                    " character(s) off from line " + prevNo);
                failures++;
            }
            prev = cur;
            prevNo = i + 1;
        });
    }

    check("checked " + rows + " nav rows, all second columns aligned", misaligned === 0,
        misaligned + " misaligned");
}

// The board glyphs are restricted to ranges that occupy exactly one cell, but
// the menus are plain text and were never covered. Arrows are the risk: they
// live in the Arrows block, not Box Drawing, so a font without them falls back
// and the row silently shifts.
console.log("\n=== MENU CHARACTERS ARE FIXED WIDTH ===");
{
    const SAFE = (cp) =>
        cp === 0x20 ||
        (cp >= 0x21 && cp <= 0x7E) ||          // printable ASCII
        (cp >= 0x2190 && cp <= 0x2193) ||      // the four arrows, in Courier New
        (cp >= 0x2500 && cp <= 0x257F) ||      // Box Drawing
        (cp >= 0x2580 && cp <= 0x259F) ||      // Block Elements
        (cp >= 0x2550 && cp <= 0x256C);

    const offenders = new Map();
    for (const file of htmlFiles(ROOT)) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
            if (!NAV_ROW.test(line)) return;
            for (const ch of line) {
                const cp = ch.codePointAt(0);
                if (!SAFE(cp)) {
                    const key = "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
                    if (!offenders.has(key)) offenders.set(key, rel + ":" + (i + 1));
                }
            }
        });
    }

    check("no nav row uses a character of uncertain width",
        offenders.size === 0,
        [...offenders].map(([cp, at]) => cp + " at " + at).join(", "));
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures ? 1 : 0);

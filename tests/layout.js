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
        // Split on either ending. A Windows clone with core.autocrlf checks
        // these files out as CRLF, and a trailing \r is a line ending, not a
        // character in the row, so counting it would fail every row.
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
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

// A lone "[ESC]   BACK TO MENU" row sitting under two-column rows in the same
// COMMANDS block has its own label column, independent of the check above (which
// only compares two-column rows to each other). Three screens had this: the
// two-column rows above put their label at column 14, but the standalone row
// used a different gutter and landed at column 19 — visibly out of step with
// everything above it, even though each row was "aligned" by the first check.
console.log("\n=== LONE ROWS MATCH THEIR BLOCK'S COLUMN ===");
{
    const ONE_COL_ROW = /^\s{2,}\[[^\]]+\]\s+\S/;
    let lone = 0, mismatched = 0;

    function labelCol(line) {
        const m = line.match(/\[[^\]]+\](\s+)/);
        return m ? m[0].length : null;
    }

    for (const file of htmlFiles(ROOT)) {
        const rel = path.relative(ROOT, file).replace(/\\/g, "/");
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        let blockCol = null;

        lines.forEach((line, i) => {
            const trimmed = line.trim();
            const isTwo = NAV_ROW.test(line);
            const isOne = !isTwo && ONE_COL_ROW.test(line);

            if (isTwo) {
                blockCol = labelCol(line);
            } else if (isOne) {
                lone++;
                const col = labelCol(line);
                if (blockCol !== null && col !== blockCol) {
                    mismatched++;
                    console.log("  FAIL  " + rel + ":" + (i + 1) +
                        " lone row's label is at column " + col +
                        ", the two-column rows above it use " + blockCol);
                    failures++;
                }
            } else if (trimmed === "" || /^={3,}$/.test(trimmed)) {
                // A blank line or a === divider ends the block, so a lone row
                // on the NEXT screen is judged against nothing rather than
                // whatever column happened to be in force on a different page.
                blockCol = null;
            }
        });
    }

    check("checked " + lone + " lone command rows, none out of step with their block",
        mismatched === 0, mismatched + " mismatched");
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
        // Split on either ending. A Windows clone with core.autocrlf checks
        // these files out as CRLF, and a trailing \r is a line ending, not a
        // character in the row, so counting it would fail every row.
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
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

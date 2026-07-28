# VTcade — Games Audit & Art Consistency Plan

Audit of all three games (Snake, Runner, Flappy Bird): what's logically wrong,
what's visually inconsistent, and what I propose to do about it.

**STATUS: all of it is implemented, verified and committed.** Kept as the record
of what was wrong and what changed. Results are noted inline below.

Verification: `node tests/game-logic.js` runs 43 assertions against the real
game scripts (not a reimplementation) and is wired into CI.

---

## What's already consistent (good news)

Verified, not assumed:

- The `<style>` block is **byte-identical** in all three files (same md5). No CSS drift.
- Board is **50×25** in all three; playable area 48 columns.
- Side panel is **20 columns** wide in all three.
- Leaderboard shows **8 entries, names truncated to 12** in all three.
- ESC → dashboard, right-click disabled, tab-hide pause: all identical.

So the foundation is sound. The drift is in glyphs, sprite scale, wording, and
difficulty curves.

---

## Part 1 — Logic bugs

### L1. Snake: the food is invisible *(worst issue)*
Snake body and food are **both** `█` (FULL BLOCK). There is no way to tell them
apart. Snake is the only game using a single glyph for everything.

### L2. Flappy: the death floor is invisible
The bird dies at `y >= 25`, but the board only draws rows 0–24 and there is **no
ground line**. So the boundary that kills you is off-screen, and on the death
frame the bird isn't drawn at all — it vanishes rather than hitting something.
Runner draws a `─` ground line; Flappy draws nothing.

### L3. Flappy: you can park on the ceiling
`updateBird()` clamps `y` to 0 *and* zeroes velocity, so holding the top edge is
completely safe and costs nothing. It's a risk-free zone in a game that's
supposed to be about managing altitude.

### L4. Flappy never gets harder
Snake ramps 150ms → 80ms. Runner ramps speed 1 → 2.5. Flappy is **constant
forever** — same pipe speed, same 40-frame spacing, from the first pipe to the
thousandth.

### L5. Runner's difficulty partly cancels itself
Obstacle spacing is timed in **frames** (40–79), but obstacles travel
`gameSpeed` columns per frame. So actual spacing = interval × speed: at 2.5×
speed the gaps are **2.5× wider**. Faster, but roomier.

### L6. Runner + Flappy fake the high score mid-run
Both do `if (score > highScore) highScore = score;` inside the game loop, so the
panel shows a new high score before the server has accepted it — then the server
response overwrites it. Snake doesn't do this. If a save fails, the two disagree.

### L7. The layout jumps between game states
The status area under the board is **0 lines while playing, 1 line before start,
2 lines on game over**. Since the page is flex-centred, the whole board shifts
vertically every time the state changes. This is probably a big part of why the
games "feel" less polished than the menus.

### L8. Snake has no pointer input
Runner and Flappy jump on any click. Snake is keyboard-only — so on a touch
device Snake is completely unplayable while the other two are at least partly
usable.

### L9. No pause in any game
Not a bug exactly, but all three lose a run if you need to look away, and the
tab-hide auto-pause already proves the machinery exists.

---

## Part 2 — Art & consistency

### The honest constraint
Snake is a **grid** game — its entities must be 1×1 cells or the movement logic
breaks. Runner and Flappy are **side-scrollers** and can share a sprite scale.
So "all three pixel-identical" isn't achievable without gutting Snake. What *is*
achievable: one shared glyph palette + frame + panel for all three, and matched
sprite scale between the two side-scrollers.

### A1. One glyph palette, used the same way everywhere

| Role | Glyph | Snake | Runner | Flappy |
|---|---|---|---|---|
| Player | `█` FULL BLOCK | body | player | bird |
| Hazard | `▓` DARK SHADE | — | obstacles | pipes |
| Pickup | `◆` BLACK DIAMOND | **food (new)** | — | — |
| Ground | `─` LIGHT HORIZONTAL | — | ground | **floor (new)** |

Today: Snake uses only `█`; Runner uses `█ ▓ ─`; Flappy uses `█ ▓` with no ground.

### A2. Matched sprite scale between the two side-scrollers
Currently mismatched:

| | Runner | Flappy |
|---|---|---|
| Player | 2×2 block | 1×1 dot |
| Hazard width | 2 | 3 |

Proposal: player **2×2** and hazard width **3** in both. This is the "same sizes
of items" fix. *Gameplay note:* a 2-tall bird inside an 8-row pipe gap leaves 6
rows of clearance — still comfortable, but it does make Flappy slightly harder,
so it's worth playing once before we commit.

### A3. Identical wording
Today:
- Snake: `< PRESS ARROW KEYS TO START >` / `PRESS ANY ARROW KEY TO RESTART`
- Runner & Flappy: `< PRESS SPACE OR UP ARROW TO START >` / `PRESS SPACE TO RESTART`

Proposal: one template, `< PRESS {KEY} TO START >` and `< GAME OVER >` +
`PRESS {KEY} TO RESTART`, with only `{KEY}` differing.

### A4. Same panel shape in all three
Every panel gets exactly three stat rows so they're the same height:

| | 3rd stat |
|---|---|
| Snake | `LENGTH` (already has it) |
| Runner | `SPEED` (already has it) |
| Flappy | **none today** → add `PIPES` |

### A5. Fixed-height status area
Reserve 2 lines under the board in every state, so the board stops jumping
(fixes L7).

### A6. `NEW RECORD` flash
Consistent one-line indicator in all three when you beat your own best, instead
of the number just quietly changing.

---

## Part 3 — Shared code

The three files still duplicate the frame/panel rendering. Proposal:

- `shared/game.css` — the identical style block, extracted once
  (byte-identical today, so this is pure deduplication with zero visual change)
- `shared/gameUI.js` — glyph constants, `drawFrame(rows)`, `drawPanel({...})`,
  `statusLine(state, keyLabel)`

Each game then supplies only its own grid and stats. This is what makes the
consistency *stay* consistent instead of drifting again.

---

## Suggested order

| Step | Contents | Risk |
|---|---|---|
| **1** | L1, L2 — Snake food glyph, Flappy floor line | Very low, big payoff |
| **2** | L6, L7, A5 — high-score honesty, fixed status area | Low |
| **3** | A1, A3, A4, A6 + `shared/gameUI.js` + `shared/game.css` | Low, all cosmetic |
| **4** | L3, L4, L5 — Flappy ceiling, Flappy ramp, Runner spacing | **Changes difficulty — play-test each** |
| **5** | A2 — matched sprite scale (2×2 player, 3-wide hazards) | **Changes difficulty most** |
| **6** | L8, L9 — Snake pointer input, pause key | Optional |

Steps 1–3 are safe and purely improve things. Steps 4–5 change how the games
*play*, so I'd rather do them one at a time and have you try each.

---

## What I need from you

1. **Steps 1–3**: shall I just go ahead?
2. **Step 4** (difficulty): want Flappy to ramp up? And should Runner's spacing
   be measured in columns so it genuinely tightens with speed?
3. **Step 5** (sprite scale): worth making Flappy's bird a 2×2 block to match
   Runner, accepting that it plays a bit harder? Or keep the 1×1 dot?
4. **Step 6**: is Snake-on-touch worth supporting at all, or is this
   keyboard-only by design?

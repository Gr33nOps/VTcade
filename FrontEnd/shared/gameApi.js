// Score loading and saving, shared by all three games.
//
// Each game previously carried its own near-identical copy of these four
// functions, so every fix (URL encoding, the score-loss race, error handling)
// had to be made three times and drifted between them.

(function (global) {
    function createGameApi(gameName) {
        const encodedGame = encodeURIComponent(gameName);

        return {
            // Personal best for the signed-in player. Returns 0 on any failure
            // so a network problem shows an empty score, not a broken screen.
            async loadHighScore(username) {
                try {
                    const res = await fetch(
                        `${VTSession.API_URL}/api/highscore/${encodeURIComponent(username)}/${encodedGame}`
                    );
                    if (!res.ok) return 0;
                    const data = await res.json();
                    return data.highscore || 0;
                } catch (err) {
                    console.error("Failed to load high score:", err);
                    return 0;
                }
            },

            // Returns the server's stored highscore, or null if the save failed.
            // Callers pass the score explicitly: reading a shared mutable score
            // after an await was how restarting mid-save used to submit 0.
            async saveHighScore(finalScore) {
                try {
                    const res = await VTSession.authedFetch("/api/highscore/save", {
                        method: "POST",
                        body: JSON.stringify({ game: gameName, score: finalScore })
                    });
                    if (!res.ok) {
                        console.error("Highscore save failed:", res.status, await res.text());
                        return null;
                    }
                    const data = await res.json();
                    return typeof data.highscore === "number" ? data.highscore : null;
                } catch (err) {
                    console.error("Error saving highscore:", err);
                    return null;
                }
            },

            async saveLeaderboard(finalScore) {
                try {
                    const res = await VTSession.authedFetch("/api/leaderboard/save", {
                        method: "POST",
                        body: JSON.stringify({ game: gameName, score: finalScore })
                    });
                    if (!res.ok) {
                        console.error("Leaderboard save failed:", res.status, await res.text());
                        return false;
                    }
                    return true;
                } catch (err) {
                    console.error("Error saving leaderboard:", err);
                    return false;
                }
            },

            async loadLeaderboard() {
                try {
                    const res = await fetch(`${VTSession.API_URL}/api/leaderboard/${encodedGame}`);
                    if (!res.ok) return [];
                    const data = await res.json();
                    return data.leaderboard || [];
                } catch (err) {
                    console.error("Error loading leaderboard:", err);
                    return [];
                }
            }
        };
    }

    global.createGameApi = createGameApi;
})(window);

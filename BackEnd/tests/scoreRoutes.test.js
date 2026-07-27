const request = require("supertest");
const express = require("express");
const { createMockSupabase } = require("./helpers/mockSupabase");

const mock = createMockSupabase();
jest.mock("../config/supabase", () => ({
    supabaseAdmin: mock.client,
    supabasePublic: mock.client
}));

const leaderboardRoutes = require("../routes/leaderboard");
const highscoreRoutes = require("../routes/highscore");
const gameRoutes = require("../routes/gameRoutes");
const adminRoutes = require("../routes/adminRoutes");

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/leaderboard", leaderboardRoutes);
    app.use("/api/highscore", highscoreRoutes);
    app.use("/api/game", gameRoutes);
    app.use("/api/admin", adminRoutes);
    return app;
}

// Make the mock behave as though this token belongs to `realuser`.
function signedInAs(username, { banned = false } = {}) {
    mock.setAuth("getUser", {
        data: { user: { id: "user-uuid-1", email: `${username}@example.com` } },
        error: null
    });
    mock.setTable("profiles", {
        data: { id: "user-uuid-1", username, email: `${username}@example.com`, is_banned: banned },
        error: null
    });
}

describe("score submission requires authentication", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
    });

    test.each([
        ["/api/leaderboard/save"],
        ["/api/highscore/save"]
    ])("%s rejects an unauthenticated request", async (path) => {
        const res = await request(app)
            .post(path)
            .send({ username: "victim", game: "SNAKE", score: 999999 });

        expect(res.status).toBe(401);
    });

    test.each([
        ["/api/leaderboard/save"],
        ["/api/highscore/save"]
    ])("%s rejects an invalid token", async (path) => {
        mock.setAuth("getUser", { data: { user: null }, error: { message: "bad jwt" } });

        const res = await request(app)
            .post(path)
            .set("Authorization", "Bearer garbage")
            .send({ game: "SNAKE", score: 10 });

        expect(res.status).toBe(401);
    });

    test("a banned player cannot submit a score", async () => {
        signedInAs("banneduser", { banned: true });

        const res = await request(app)
            .post("/api/leaderboard/save")
            .set("Authorization", "Bearer valid")
            .send({ game: "SNAKE", score: 10 });

        expect(res.status).toBe(403);
        expect(res.body.isBanned).toBe(true);
    });
});

describe("identity comes from the token, not the request body", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
        signedInAs("realuser");
    });

    // The core of the old vulnerability: the client named whichever user it
    // wanted to score for, and the server believed it.
    test("leaderboard save ignores a username supplied in the body", async () => {
        mock.setRpc("submit_leaderboard_score", {
            data: { score: 50, is_new_highscore: true },
            error: null
        });

        const res = await request(app)
            .post("/api/leaderboard/save")
            .set("Authorization", "Bearer valid")
            .send({ username: "someoneelse", game: "SNAKE", score: 50 });

        expect(res.status).toBe(200);
        expect(mock.client.rpc).toHaveBeenCalledWith(
            "submit_leaderboard_score",
            expect.objectContaining({ p_username: "realuser" })
        );
        const args = mock.client.rpc.mock.calls.at(-1)[1];
        expect(args.p_username).not.toBe("someoneelse");
    });

    test("highscore save ignores a username supplied in the body", async () => {
        mock.setRpc("submit_highscore", {
            data: { highscore: 50, is_new_record: true },
            error: null
        });

        const res = await request(app)
            .post("/api/highscore/save")
            .set("Authorization", "Bearer valid")
            .send({ username: "someoneelse", game: "SNAKE", score: 50 });

        expect(res.status).toBe(200);
        expect(mock.client.rpc).toHaveBeenCalledWith(
            "submit_highscore",
            expect.objectContaining({ p_username: "realuser" })
        );
    });
});

describe("score validation", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
        signedInAs("realuser");
        mock.setRpc("submit_leaderboard_score", {
            data: { score: 1, is_new_highscore: true },
            error: null
        });
    });

    test.each([
        ["negative", -5],
        ["fractional", 1.5],
        ["non-numeric", "abc"],
        ["absurdly large", 99999999],
        ["NaN-producing", {}]
    ])("rejects a %s score", async (_label, score) => {
        const res = await request(app)
            .post("/api/leaderboard/save")
            .set("Authorization", "Bearer valid")
            .send({ game: "SNAKE", score });

        expect(res.status).toBe(400);
    });

    test("rejects a missing game", async () => {
        const res = await request(app)
            .post("/api/leaderboard/save")
            .set("Authorization", "Bearer valid")
            .send({ score: 10 });

        expect(res.status).toBe(400);
    });

    test("accepts a valid score", async () => {
        const res = await request(app)
            .post("/api/leaderboard/save")
            .set("Authorization", "Bearer valid")
            .send({ game: "SNAKE", score: 120 });

        expect(res.status).toBe(200);
    });
});

describe("game management authorization", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
    });

    // Regression: these two endpoints previously had no authentication at all.
    test("creating a game requires admin", async () => {
        const res = await request(app).post("/api/game/add").send({ title: "HACKED" });
        expect(res.status).toBe(401);
    });

    test("deleting a game requires admin", async () => {
        const res = await request(app).delete("/api/game/some-id");
        expect(res.status).toBe(401);
    });

    test("listing games stays public", async () => {
        mock.setTable("games", { data: [{ id: "1", title: "SNAKE" }], error: null });
        const res = await request(app).get("/api/game");
        expect(res.status).toBe(200);
    });

    test("an authenticated admin can create a game", async () => {
        const login = await request(app)
            .post("/api/admin/login")
            .send({ username: "admin", password: "test-admin-password" });

        mock.setTable("games", { data: { id: "g1", title: "NEW GAME" }, error: null });

        const res = await request(app)
            .post("/api/game/add")
            .set("Authorization", `Bearer ${login.body.token}`)
            .send({ title: "NEW GAME" });

        expect(res.status).toBe(201);
    });

    test("game creation requires a title", async () => {
        const login = await request(app)
            .post("/api/admin/login")
            .send({ username: "admin", password: "test-admin-password" });

        const res = await request(app)
            .post("/api/game/add")
            .set("Authorization", `Bearer ${login.body.token}`)
            .send({ genre: "arcade" });

        expect(res.status).toBe(400);
    });
});

describe("public read endpoints", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
    });

    test("leaderboard for a game is readable without auth", async () => {
        mock.setTable("leaderboard", {
            data: [{ username: "a", score: 10, created_at: "2026-01-01" }],
            error: null
        });

        const res = await request(app).get("/api/leaderboard/SNAKE");
        expect(res.status).toBe(200);
        expect(res.body.leaderboard[0]).toMatchObject({ rank: 1, username: "a", score: 10 });
    });

    test("a user's highscores are readable without auth", async () => {
        mock.setTable("highscores", {
            data: [{ game: "SNAKE", highscore: 30 }],
            error: null
        });

        const res = await request(app).get("/api/highscore/user/someone");
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
    });
});

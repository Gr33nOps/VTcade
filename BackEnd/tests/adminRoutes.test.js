const request = require("supertest");
const express = require("express");
const { createMockSupabase } = require("./helpers/mockSupabase");

const mock = createMockSupabase();
jest.mock("../config/supabase", () => ({
    supabaseAdmin: mock.client,
    supabasePublic: mock.client
}));

const adminRoutes = require("../routes/adminRoutes");

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/admin", adminRoutes);
    return app;
}

async function getAdminToken(app) {
    const res = await request(app)
        .post("/api/admin/login")
        .send({ username: "admin", password: "test-admin-password" });
    return res.body.token;
}

describe("admin auth", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
    });

    test("login rejects wrong credentials", async () => {
        const res = await request(app)
            .post("/api/admin/login")
            .send({ username: "admin", password: "wrong" });
        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
    });

    test("login returns a token and never echoes the password", async () => {
        const res = await request(app)
            .post("/api/admin/login")
            .send({ username: "admin", password: "test-admin-password" });
        expect(res.status).toBe(200);
        expect(typeof res.body.token).toBe("string");
        expect(JSON.stringify(res.body)).not.toContain("test-admin-password");
    });

    test("protected route rejects a request with no token", async () => {
        const res = await request(app).get("/api/admin/users");
        expect(res.status).toBe(401);
    });

    test("protected route rejects the OLD username/password header scheme", async () => {
        // Regression: credentials used to be accepted as plain headers.
        const res = await request(app)
            .get("/api/admin/users")
            .set("username", "admin")
            .set("password", "test-admin-password");
        expect(res.status).toBe(401);
    });

    test("protected route rejects a forged token", async () => {
        const res = await request(app)
            .get("/api/admin/users")
            .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYWRtaW4ifQ.nope");
        expect(res.status).toBe(401);
    });
});

describe("GET /api/admin/stats", () => {
    let app;
    let token;

    beforeEach(async () => {
        mock.reset();
        app = buildApp();
        token = await getAdminToken(app);
        mock.setTable("profiles", { data: [], error: null, count: 7 });
        mock.setTable("games", { data: [], error: null, count: 3 });
        mock.setTable("leaderboard", { data: [], error: null, count: 5 });
        mock.setTable("system_settings", { data: { maintenance_mode: false }, error: null });
    });

    // Regression for C1: `scoresToday` was referenced but never defined, so this
    // endpoint threw ReferenceError and returned 500 on every single call.
    test("returns stats including scoresToday instead of crashing", async () => {
        const res = await request(app)
            .get("/api/admin/stats")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            users: 7,
            games: 3,
            scoresToday: 5,
            maintenanceMode: false,
            status: "ONLINE"
        });
    });

    test("reports MAINTENANCE status when maintenance mode is on", async () => {
        mock.setTable("system_settings", { data: { maintenance_mode: true }, error: null });
        const res = await request(app)
            .get("/api/admin/stats")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.status).toBe("MAINTENANCE");
        expect(res.body.maintenanceMode).toBe(true);
    });
});

describe("DELETE /api/admin/users/:id", () => {
    let app;
    let token;

    beforeEach(async () => {
        mock.reset();
        app = buildApp();
        token = await getAdminToken(app);
    });

    // Regression for C2: the handler referenced an undefined `Score` model after
    // already deleting the user, so the user vanished, their leaderboard rows
    // were orphaned, and the admin still saw a 500. Score rows are now removed
    // by the foreign-key cascade rather than a manual second delete.
    test("deletes a user without throwing ReferenceError", async () => {
        mock.setTable("profiles", { data: { username: "victim" }, error: null });

        const res = await request(app)
            .delete("/api/admin/users/11111111-1111-1111-1111-111111111111")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.message).toBe("User deleted successfully");
        expect(mock.client.auth.admin.deleteUser).toHaveBeenCalled();
    });

    test("returns 404 for an unknown user", async () => {
        mock.setTable("profiles", { data: null, error: null });

        const res = await request(app)
            .delete("/api/admin/users/22222222-2222-2222-2222-222222222222")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(404);
    });
});

describe("admin error handling", () => {
    let app;
    let token;

    beforeEach(async () => {
        mock.reset();
        app = buildApp();
        token = await getAdminToken(app);
    });

    test("a database error surfaces as 500, not a fake success", async () => {
        mock.setTable("profiles", { data: null, error: { message: "connection refused" } });

        const res = await request(app)
            .get("/api/admin/users")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(500);
        expect(res.body.message).toBe("Server error");
    });
});

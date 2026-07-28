const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");
const { createMockSupabase } = require("./helpers/mockSupabase");

const mock = createMockSupabase();
jest.mock("../config/supabase", () => ({
    supabaseAdmin: mock.client,
    supabasePublic: mock.client
}));

const cookieParser = require("cookie-parser");
const adminRoutes = require("../routes/adminRoutes");
const { adminSecretProblems, _resetRevoked, ADMIN_COOKIE } = require("../config/auth");
const { requireSameOrigin } = require("../config/origins");

const SECRET = process.env.ADMIN_JWT_SECRET;
const GOOD_CLAIMS = { issuer: "vtcade-api", audience: "vtcade-admin" };

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/admin", requireSameOrigin, adminRoutes);
    return app;
}

function setCookies(res) {
    return res.headers["set-cookie"] || [];
}

// The session cookie's value. Tests that only need "a valid credential" go on
// using the Authorization header, which requireAdmin still accepts; the tests
// that care specifically about cookie behaviour use the cookie itself.
function tokenFromResponse(res) {
    const found = setCookies(res).find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
    if (!found) return null;
    const value = found.split(";")[0].slice(ADMIN_COOKIE.length + 1);
    return value ? decodeURIComponent(value) : null;
}

async function login(app) {
    return request(app)
        .post("/api/admin/login")
        .send({ username: "admin", password: "test-admin-password" });
}

async function getAdminToken(app) {
    return tokenFromResponse(await login(app));
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

    test("login succeeds and never echoes the password", async () => {
        const res = await login(app);
        expect(res.status).toBe(200);
        expect(res.body.username).toBe("admin");
        expect(JSON.stringify(res.body)).not.toContain("test-admin-password");
    });

    // The session moved into an httpOnly cookie precisely so that page scripts
    // never hold it. Putting it in the response body too would hand it straight
    // back to any JavaScript that can call this endpoint.
    test("login does NOT return the session token in the response body", async () => {
        const res = await login(app);
        const token = tokenFromResponse(res);

        expect(token).toBeTruthy();
        expect(res.body.token).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain(token);
    });

    test("login reports only the expiry, as a number", async () => {
        const res = await login(app);
        expect(typeof res.body.expiresAt).toBe("number");
        expect(res.body.expiresAt).toBeGreaterThan(Date.now());
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

describe("admin token hardening", () => {
    let app;

    beforeEach(() => {
        mock.reset();
        _resetRevoked();
        app = buildApp();
        mock.setTable("profiles", { data: [], error: null });
    });

    async function callUsers(token) {
        return request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    }

    test("an unsigned alg:none token is rejected", async () => {
        // The classic JWT bypass. Hand-built rather than signed, because the
        // point is to present a token the library would never produce and
        // confirm the verifier still refuses it.
        const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
        const token = b64({ alg: "none", typ: "JWT" }) + "." + b64({
            role: "admin",
            username: "admin",
            iss: "vtcade-api",
            aud: "vtcade-admin",
            exp: Math.floor(Date.now() / 1000) + 3600
        }) + ".";
        expect((await callUsers(token)).status).toBe(401);
    });

    test("a correctly signed token for a different audience is rejected", async () => {
        const token = jwt.sign({ role: "admin" }, SECRET, {
            algorithm: "HS256",
            issuer: "vtcade-api",
            audience: "somebody-else"
        });
        expect((await callUsers(token)).status).toBe(401);
    });

    test("a correctly signed token from a different issuer is rejected", async () => {
        const token = jwt.sign({ role: "admin" }, SECRET, {
            algorithm: "HS256",
            issuer: "not-vtcade",
            audience: "vtcade-admin"
        });
        expect((await callUsers(token)).status).toBe(401);
    });

    test("a valid signature with a non-admin role is rejected", async () => {
        const token = jwt.sign({ role: "player" }, SECRET, { algorithm: "HS256", ...GOOD_CLAIMS });
        expect((await callUsers(token)).status).toBe(401);
    });

    test("an expired token is rejected", async () => {
        const token = jwt.sign({ role: "admin" }, SECRET, {
            algorithm: "HS256",
            expiresIn: "-1s",
            ...GOOD_CLAIMS
        });
        expect((await callUsers(token)).status).toBe(401);
    });

    test("every issued token carries a unique jti", async () => {
        const a = jwt.decode(await getAdminToken(app));
        const b = jwt.decode(await getAdminToken(app));
        expect(typeof a.jti).toBe("string");
        expect(a.jti).not.toBe(b.jti);
    });

    // Regression: logout used to be a localStorage delete on the client only,
    // so the token stayed valid for the rest of its TTL.
    test("logout revokes the presented token for real", async () => {
        const token = await getAdminToken(app);
        expect((await callUsers(token)).status).toBe(200);

        const out = await request(app)
            .post("/api/admin/logout")
            .set("Authorization", `Bearer ${token}`);
        expect(out.status).toBe(200);

        expect((await callUsers(token)).status).toBe(401);
    });

    test("revoking one session does not revoke the others", async () => {
        const keep = await getAdminToken(app);
        const drop = await getAdminToken(app);

        await request(app).post("/api/admin/logout").set("Authorization", `Bearer ${drop}`);

        expect((await callUsers(drop)).status).toBe(401);
        expect((await callUsers(keep)).status).toBe(200);
    });

    test("logout itself requires a valid token", async () => {
        expect((await request(app).post("/api/admin/logout")).status).toBe(401);
    });
});

describe("admin session cookie", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        _resetRevoked();
        app = buildApp();
        mock.setTable("profiles", { data: [], error: null });
    });

    test("the session cookie is httpOnly, SameSite=Strict and scoped to /api/admin", async () => {
        const cookie = setCookies(await login(app)).find((c) => c.startsWith(`${ADMIN_COOKIE}=`));

        expect(cookie).toBeDefined();
        // httpOnly is the whole point: without it a script on the page could
        // read the session straight back out of document.cookie.
        expect(cookie).toMatch(/HttpOnly/i);
        expect(cookie).toMatch(/SameSite=Strict/i);
        expect(cookie).toMatch(/Path=\/api\/admin/i);
    });

    test("the cookie alone authenticates a request, with no Authorization header", async () => {
        const raw = setCookies(await login(app)).map((c) => c.split(";")[0]);

        const res = await request(app).get("/api/admin/users").set("Cookie", raw);
        expect(res.status).toBe(200);
    });

    test("logout clears the cookie as well as revoking the token", async () => {
        const raw = setCookies(await login(app)).map((c) => c.split(";")[0]);

        const out = await request(app).post("/api/admin/logout").set("Cookie", raw);
        expect(out.status).toBe(200);

        // Express clears by re-sending the cookie empty and already expired.
        const cleared = setCookies(out).find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
        expect(cleared).toBeDefined();
        expect(cleared).toMatch(/^vtcade_admin=;/);

        // And the value the browser was holding is dead even if it keeps it.
        expect((await request(app).get("/api/admin/users").set("Cookie", raw)).status).toBe(401);
    });
});

describe("admin CSRF backstop", () => {
    let app;
    let token;

    beforeEach(async () => {
        mock.reset();
        _resetRevoked();
        app = buildApp();
        token = await getAdminToken(app);
        mock.setTable("profiles", { data: { id: "u1", username: "victim" }, error: null });
    });

    test("a state-changing request from a foreign origin is refused", async () => {
        const res = await request(app)
            .put("/api/admin/users/11111111-1111-1111-1111-111111111111/ban")
            .set("Authorization", `Bearer ${token}`)
            .set("Origin", "https://evil.example.com");

        expect(res.status).toBe(403);
        expect(res.body.message).toBe("Cross-origin request refused");
    });

    test("the same request from our own frontend is allowed through", async () => {
        const res = await request(app)
            .put("/api/admin/users/11111111-1111-1111-1111-111111111111/ban")
            .set("Authorization", `Bearer ${token}`)
            .set("Origin", process.env.FRONTEND_URL);

        expect(res.status).toBe(200);
    });

    // Deliberate: curl and server-to-server callers send no Origin at all, and
    // a forged cross-site browser request cannot suppress it.
    test("a request with no Origin header is allowed through", async () => {
        const res = await request(app)
            .put("/api/admin/users/11111111-1111-1111-1111-111111111111/ban")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
    });

    test("a plain read from a foreign origin is not blocked by this rule", async () => {
        mock.setTable("profiles", { data: [], error: null });
        const res = await request(app)
            .get("/api/admin/users")
            .set("Authorization", `Bearer ${token}`)
            .set("Origin", "https://evil.example.com");

        expect(res.status).toBe(200);
    });
});

describe("admin credential comparison", () => {
    let app;
    beforeEach(() => {
        mock.reset();
        app = buildApp();
    });

    // Regression: the old compare returned early when the lengths differed,
    // which leaks the password's length through response timing. Both of these
    // must fail identically, and neither may throw.
    test("a password of the wrong length is rejected, not crashed on", async () => {
        for (const password of ["", "x", "test-admin-passwor", "test-admin-passwordAAAAAAAA"]) {
            const res = await request(app)
                .post("/api/admin/login")
                .send({ username: "admin", password });
            expect(res.status).toBe(401);
            expect(res.body.token).toBeUndefined();
        }
    });

    test("a non-string password is rejected rather than throwing", async () => {
        for (const password of [null, 12345, { toString: () => "test-admin-password" }, ["a"]]) {
            const res = await request(app)
                .post("/api/admin/login")
                .send({ username: "admin", password });
            expect(res.status).toBe(401);
        }
    });

    test("the right username with the wrong case is still rejected", async () => {
        const res = await request(app)
            .post("/api/admin/login")
            .send({ username: "ADMIN", password: "test-admin-password" });
        expect(res.status).toBe(401);
    });
});

// Regression: a body that wasn't valid JSON came back as 500 "Server error".
// That tells the caller the server broke when it didn't, and it buries real
// faults in an error log full of noise nobody caused. Uses the real app so the
// actual error handler is the thing under test.
describe("malformed request bodies", () => {
    let realApp;
    beforeAll(() => {
        mock.reset();
        realApp = require("../server");
    });

    test("a body that is not JSON is a 400, not a 500", async () => {
        const res = await request(realApp)
            .post("/api/admin/login")
            .set("Content-Type", "application/json")
            .send("this is not json at all");

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Malformed request");
    });

    test("an oversized body is a 413, not a 500", async () => {
        const res = await request(realApp)
            .post("/api/admin/login")
            .set("Content-Type", "application/json")
            .send(JSON.stringify({ username: "admin", password: "x".repeat(20000) }));

        expect(res.status).toBe(413);
        expect(res.body.message).toBe("Request body too large");
    });

    test("a valid body still reaches the route", async () => {
        const res = await request(realApp)
            .post("/api/admin/login")
            .send({ username: "admin", password: "definitely-wrong" });

        expect(res.status).toBe(401);
    });
});

describe("admin secret strength check", () => {
    // adminSecretProblems reads env once at module load, so each case needs a
    // fresh module registry rather than a reassignment.
    function problemsWith(env) {
        const saved = { ...process.env };
        let result;
        try {
            Object.assign(process.env, env);
            jest.isolateModules(() => {
                result = require("../config/auth").adminSecretProblems();
            });
        } finally {
            process.env = saved;
        }
        return result;
    }

    test("the values the test suite runs with are considered acceptable", () => {
        expect(adminSecretProblems()).toEqual([]);
    });

    test("a short signing secret is reported", () => {
        const problems = problemsWith({ ADMIN_JWT_SECRET: "tooshort" });
        expect(problems.join(" ")).toContain("ADMIN_JWT_SECRET");
    });

    test("a short password is reported", () => {
        const problems = problemsWith({ ADMIN_PASSWORD: "hunter2" });
        expect(problems.join(" ")).toContain("ADMIN_PASSWORD");
    });

    // The exact string the README tells you to replace. Pasting the .env
    // example verbatim and deploying it is the realistic failure here.
    test("the README's placeholder password is reported as weak", () => {
        const problems = problemsWith({ ADMIN_PASSWORD: "choose_a_strong_password" });
        expect(problems.join(" ")).toContain("placeholder");
    });

    test("a long random secret and a real password produce no complaints", () => {
        const problems = problemsWith({
            ADMIN_JWT_SECRET: "x".repeat(48),
            ADMIN_PASSWORD: "correct-horse-battery-staple"
        });
        expect(problems).toEqual([]);
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

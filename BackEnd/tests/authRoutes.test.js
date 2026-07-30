// Player authentication: signup, login, verification and logout.
//
// None of this had any tests, and it is where every regression is most
// expensive: a broken login locks every player out of the site at once. The
// cases below are the ones that were actually wrong.

const request = require("supertest");
const express = require("express");
const { createMockSupabase } = require("./helpers/mockSupabase");

const mock = createMockSupabase();
jest.mock("../config/supabase", () => ({
    supabaseAdmin: mock.client,
    supabasePublic: mock.client
}));

const authRoutes = require("../routes/authRoutes");

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", authRoutes);
    return app;
}

const USER = { id: "user-uuid-1", email: "player@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" };
const SESSION = { access_token: "access-token-1", refresh_token: "refresh-token-1", expires_in: 3600 };

function profile(overrides = {}) {
    return {
        data: {
            id: USER.id,
            username: "player",
            email: USER.email,
            is_verified: true,
            is_banned: false,
            ...overrides
        },
        error: null
    };
}

let app;
beforeEach(() => {
    mock.reset();
    jest.clearAllMocks();
    app = buildApp();
});

describe("login", () => {
    function signInSucceeds() {
        mock.setAuth("signInWithPassword", {
            data: { user: USER, session: SESSION },
            error: null
        });
    }

    test("hands back the real session, not just a username", async () => {
        signInSucceeds();
        mock.setTable("profiles", profile());

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player@example.com", password: "secret1" });

        expect(res.status).toBe(200);
        expect(res.body.session.access_token).toBe("access-token-1");
        expect(res.body.username).toBe("player");
    });

    // A pasted address arrives with a trailing space and a capital letter, and
    // the server used to lower-case without trimming, so the space became part
    // of the address it authenticated with.
    test("trims and lower-cases the email before authenticating", async () => {
        signInSucceeds();
        mock.setTable("profiles", profile());

        await request(app)
            .post("/api/auth/login")
            .send({ email: "  PLAYER@Example.com  ", password: "secret1" });

        expect(mock.client.auth.signInWithPassword).toHaveBeenCalledWith(
            expect.objectContaining({ email: "player@example.com" })
        );
    });

    test("rejects a malformed email without asking Supabase", async () => {
        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player.example.com", password: "secret1" });

        expect(res.status).toBe(400);
        expect(mock.client.auth.signInWithPassword).not.toHaveBeenCalled();
    });

    test("a wrong password is 401 and says nothing else", async () => {
        mock.setAuth("signInWithPassword", {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials" }
        });

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player@example.com", password: "wrong" });

        expect(res.status).toBe(401);
        expect(res.body.message).toBe("Invalid email or password");
    });

    test("an unconfirmed email is told so, and flagged for the resend option", async () => {
        mock.setAuth("signInWithPassword", {
            data: { user: null, session: null },
            error: { message: "Email not confirmed" }
        });

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player@example.com", password: "secret1" });

        expect(res.status).toBe(403);
        expect(res.body.requiresVerification).toBe(true);
    });

    // The bug this replaced: the profile was looked up FIRST and a missing row
    // answered "Invalid email or password", so accounts created before the
    // on_auth_user_created trigger existed could never log in, whatever they
    // typed.
    test("creates the missing profile row instead of rejecting the password", async () => {
        signInSucceeds();
        mock.setTableSequence("profiles", [
            { data: null, error: null },                 // no row yet
            profile({ username: "player" })              // the insert
        ]);

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player@example.com", password: "secret1" });

        expect(res.status).toBe(200);
        expect(res.body.username).toBe("player");
        const inserted = mock.client.from.mock.results
            .map((r) => r.value)
            .find((b) => b.insert.mock.calls.length);
        expect(inserted.insert).toHaveBeenCalledWith(
            expect.objectContaining({ id: USER.id, email: USER.email })
        );
    });

    // The ban check used to run before the password did, so anyone could learn
    // whether an address was banned without owning it.
    test("a banned account is refused only after the password is proven", async () => {
        signInSucceeds();
        mock.setTable("profiles", profile({ is_banned: true }));

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player@example.com", password: "secret1" });

        expect(res.status).toBe(403);
        expect(res.body.isBanned).toBe(true);
        expect(res.body.session).toBeUndefined();
        // The sign-in minted a real session; it must not be left working.
        expect(mock.client.auth.admin.signOut).toHaveBeenCalledWith("access-token-1", "global");
    });

    test("brings is_verified back in step once the email is confirmed", async () => {
        signInSucceeds();
        mock.setTable("profiles", profile({ is_verified: false }));

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: "player@example.com", password: "secret1" });

        expect(res.status).toBe(200);
        const updated = mock.client.from.mock.results
            .map((r) => r.value)
            .find((b) => b.update.mock.calls.length);
        expect(updated.update).toHaveBeenCalledWith({ is_verified: true });
    });
});

describe("signup", () => {
    function signUpReturns(user, session = null) {
        mock.setAuth("signUp", { data: { user, session }, error: null });
    }

    test("registers and asks for email verification", async () => {
        signUpReturns({ id: USER.id, identities: [{ provider: "email" }] });

        const res = await request(app)
            .post("/api/auth/signup")
            .send({ username: "newplayer", email: "new@example.com", password: "secret1" });

        expect(res.status).toBe(201);
        expect(res.body.requiresVerification).toBe(true);
        expect(mock.client.auth.signUp).toHaveBeenCalledWith(
            expect.objectContaining({ email: "new@example.com" })
        );
    });

    // Supabase hides "this address already exists" behind a normal looking user
    // with an empty identities array. Taken at face value, the player was sent
    // to wait for an email that was never going to arrive.
    test("says so when the email is already registered", async () => {
        signUpReturns({ id: "someone-else", identities: [] });

        const res = await request(app)
            .post("/api/auth/signup")
            .send({ username: "newplayer", email: "taken@example.com", password: "secret1" });

        expect(res.status).toBe(400);
        expect(res.body.emailInUse).toBe(true);
    });

    test("a taken username is rejected case-insensitively", async () => {
        mock.setTable("profiles", { data: [{ id: "other" }], error: null });

        const res = await request(app)
            .post("/api/auth/signup")
            .send({ username: "PLAYER", email: "new@example.com", password: "secret1" });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe("Username already taken");
        expect(mock.client.auth.signUp).not.toHaveBeenCalled();
    });

    test("passes a session straight back when Supabase issues one", async () => {
        signUpReturns({ id: USER.id, identities: [{ provider: "email" }] }, SESSION);

        const res = await request(app)
            .post("/api/auth/signup")
            .send({ username: "newplayer", email: "new@example.com", password: "secret1" });

        expect(res.status).toBe(201);
        expect(res.body.requiresVerification).toBe(false);
        expect(res.body.session.access_token).toBe("access-token-1");
    });

    test.each([
        ["a username with a space", { username: "new player", email: "a@b.co", password: "secret1" }],
        ["a username that is too short", { username: "ab", email: "a@b.co", password: "secret1" }],
        ["a malformed email", { username: "newplayer", email: "a.b.co", password: "secret1" }],
        ["a short password", { username: "newplayer", email: "a@b.co", password: "12345" }],
        ["a missing field", { username: "newplayer", email: "a@b.co" }]
    ])("rejects %s", async (_label, body) => {
        const res = await request(app).post("/api/auth/signup").send(body);

        expect(res.status).toBe(400);
        expect(mock.client.auth.signUp).not.toHaveBeenCalled();
    });

    test("trims a pasted username and email", async () => {
        signUpReturns({ id: USER.id, identities: [{ provider: "email" }] });

        const res = await request(app)
            .post("/api/auth/signup")
            .send({ username: " newplayer ", email: " New@Example.com ", password: "secret1" });

        expect(res.status).toBe(201);
        expect(res.body.username).toBe("newplayer");
        expect(mock.client.auth.signUp).toHaveBeenCalledWith(
            expect.objectContaining({ email: "new@example.com" })
        );
    });
});

describe("resend verification", () => {
    test("sends for an account that is not banned", async () => {
        mock.setTable("profiles", { data: { is_banned: false }, error: null });

        const res = await request(app)
            .post("/api/auth/resend-verification")
            .send({ email: "player@example.com" });

        expect(res.status).toBe(200);
        expect(mock.client.auth.resend).toHaveBeenCalled();
    });

    test("explains that an already verified address does not need one", async () => {
        mock.setTable("profiles", { data: { is_banned: false }, error: null });
        mock.setAuth("resend", { error: { message: "Email address already confirmed" } });

        const res = await request(app)
            .post("/api/auth/resend-verification")
            .send({ email: "player@example.com" });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already verified/i);
    });
});

describe("password recovery", () => {
    test("forgot-password never reveals whether the address exists", async () => {
        const res = await request(app)
            .post("/api/auth/forgot-password")
            .send({ email: "nobody@example.com" });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/if that email is registered/i);
    });

    test("a completed reset ends every session that had the old password", async () => {
        mock.setAuth("getUser", { data: { user: USER }, error: null });

        const res = await request(app)
            .post("/api/auth/reset-password")
            .send({ access_token: "recovery-token", password: "brandnew1" });

        expect(res.status).toBe(200);
        expect(mock.client.auth.admin.updateUserById).toHaveBeenCalledWith(
            USER.id,
            { password: "brandnew1" }
        );
        expect(mock.client.auth.admin.signOut).toHaveBeenCalledWith("recovery-token", "global");
    });

    test("an expired reset link is refused", async () => {
        mock.setAuth("getUser", { data: { user: null }, error: { message: "bad jwt" } });

        const res = await request(app)
            .post("/api/auth/reset-password")
            .send({ access_token: "stale", password: "brandnew1" });

        expect(res.status).toBe(401);
        expect(mock.client.auth.admin.updateUserById).not.toHaveBeenCalled();
    });
});

describe("logout", () => {
    // The bug: this called signOut() on the one shared server-side client, which
    // holds whichever session signed in last. Any stranger could post here and
    // revoke a real player's refresh tokens.
    test("ends only the session named by the caller's own token", async () => {
        const res = await request(app)
            .post("/api/auth/logout")
            .set("Authorization", "Bearer access-token-1");

        expect(res.status).toBe(200);
        expect(mock.client.auth.admin.signOut).toHaveBeenCalledWith("access-token-1", "global");
        expect(mock.client.auth.signOut).not.toHaveBeenCalled();
    });

    test("a request with no token revokes nothing", async () => {
        const res = await request(app).post("/api/auth/logout");

        expect(res.status).toBe(200);
        expect(mock.client.auth.admin.signOut).not.toHaveBeenCalled();
        expect(mock.client.auth.signOut).not.toHaveBeenCalled();
    });
});

describe("email-verified webhook", () => {
    // It used to accept any email from any caller and mark it verified.
    test("is closed while no shared secret is configured", async () => {
        delete process.env.EMAIL_WEBHOOK_SECRET;

        const res = await request(app)
            .post("/api/auth/webhook/email-verified")
            .send({ email: "player@example.com" });

        expect(res.status).toBe(401);
    });

    test("accepts the configured secret", async () => {
        process.env.EMAIL_WEBHOOK_SECRET = "webhook-secret-for-tests";

        const res = await request(app)
            .post("/api/auth/webhook/email-verified")
            .set("x-webhook-secret", "webhook-secret-for-tests")
            .send({ email: "player@example.com" });

        expect(res.status).toBe(200);
        delete process.env.EMAIL_WEBHOOK_SECRET;
    });
});

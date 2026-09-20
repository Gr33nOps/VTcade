const express = require("express");
const request = require("supertest");
const { createMockSupabase } = require("./helpers/mockSupabase");

const mock = createMockSupabase();
jest.mock("../config/supabase", () => ({ supabaseAdmin: mock.client }));

const checkMaintenance = require("../routes/maintenance");

function buildApp() {
    const app = express();
    app.use(checkMaintenance);
    app.get("/test", (req, res) => res.json({ ok: true }));
    return app;
}

beforeEach(() => {
    mock.reset();
    jest.clearAllMocks();
    if (checkMaintenance._resetCache) checkMaintenance._resetCache();
});

test("a failed maintenance lookup does not take the whole API offline", async () => {
    mock.setTable("system_settings", {
        data: null,
        error: { message: "relation system_settings does not exist" }
    });

    const res = await request(buildApp()).get("/test");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
});

test("a confirmed maintenance state still blocks traffic", async () => {
    mock.setTable("system_settings", {
        data: { maintenance_mode: true },
        error: null
    });

    const res = await request(buildApp()).get("/test");

    expect(res.status).toBe(503);
    expect(res.body.maintenanceMode).toBe(true);
});

test("reuses the recent maintenance state instead of querying on every request", async () => {
    mock.setTable("system_settings", {
        data: { maintenance_mode: false },
        error: null
    });
    const app = buildApp();

    await request(app).get("/test").expect(200);
    await request(app).get("/test").expect(200);

    expect(mock.client.from).toHaveBeenCalledTimes(1);
});

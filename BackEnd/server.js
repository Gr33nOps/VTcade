require("dotenv").config();
const express = require("express");
const cors = require("cors");
const checkMaintenance = require("./routes/maintenance");
const { logError, logInfo } = require("./config/logger");

// Fail fast and loudly on missing config rather than dying later with an
// opaque error on the first request that touches Supabase.
const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`FATAL: missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const app = express();

app.use(express.json());
app.use(cors());

// /api/admin is deliberately NOT behind checkMaintenance — an admin must still
// be able to reach the panel and turn maintenance back off while it is on.
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/auth", checkMaintenance, require("./routes/authRoutes"));
app.use("/api/game", checkMaintenance, require("./routes/gameRoutes"));
app.use("/api/leaderboard", checkMaintenance, require("./routes/leaderboard"));
app.use("/api/highscore", checkMaintenance, require("./routes/highscore"));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  res.json({
    message: "VTcade API Server",
    status: "running"
  });
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Express skips non-error middleware once next(err) is called, so this is
// still reached despite being registered after the 404 handler above
// (verified, not assumed).
app.use((err, req, res, next) => {
  logError("unhandled", err, { method: req.method, path: req.originalUrl });
  res.status(500).json({ message: "Server error" });
});

// Don't let a single stray rejection take the process down silently.
process.on("unhandledRejection", (reason) => {
  logError("unhandledRejection", reason);
});
process.on("uncaughtException", (err) => {
  logError("uncaughtException", err);
});

const PORT = process.env.PORT || 5000;

// Only listen when run directly, so tests can import the app without binding a port.
if (require.main === module) {
  app.listen(PORT, () => {
    logInfo("startup", `Server running on port ${PORT}`);
  });
}

module.exports = app;

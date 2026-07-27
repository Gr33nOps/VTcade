require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const checkMaintenance = require("./routes/maintenance");
const { logError, logInfo, logWarn } = require("./config/logger");

// Fail fast and loudly on missing config rather than dying later with an
// opaque error on the first request that touches Supabase.
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_JWT_SECRET"
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`FATAL: missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const app = express();

// Render/Vercel put this behind a proxy; without this the rate limiter keys
// every request to the proxy's IP instead of the real client's.
app.set("trust proxy", 1);

app.use(helmet());
app.use(express.json({ limit: "16kb" }));

// Lock CORS to the known frontend origins instead of the previous bare cors(),
// which reflected any origin.
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500"
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // No Origin header: curl, server-to-server, same-origin navigations.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    logWarn("cors", "blocked disallowed origin", { origin });
    return callback(null, false);
  },
  credentials: true
}));

// Credential endpoints were completely unthrottled and trivially brute-forceable.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please try again later." }
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." }
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/resend-verification", authLimiter);
app.use("/api/admin/login", authLimiter);
app.use("/api/highscore/save", writeLimiter);
app.use("/api/leaderboard/save", writeLimiter);

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

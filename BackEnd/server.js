require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
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

// Present is not the same as adequate. One password and one signing secret
// stand between the internet and every destructive endpoint on the site, and
// nothing used to check that either was worth anything.
//
// Fatal, like the missing-variable check above: a weak signing secret is not a
// degraded state to run in, it is an unlocked door. Refusing to boot is the
// only version of this that cannot be scrolled past in a log.
const { adminSecretProblems } = require("./config/auth");
const secretProblems = adminSecretProblems();
if (secretProblems.length) {
  console.error("FATAL: admin credentials are not strong enough to run with:");
  secretProblems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}

const app = express();

// There are now TWO proxies in front of this: Vercel's rewrite and Render's own
// router. Set this too low and every request resolves to the proxy's address
// instead of the client's, which silently collapses the per-IP rate limiter
// into a single global bucket and locks every user out at once.
//
// Verify after any hosting change with GET /api/admin/diagnostics/ip — if
// `seenIp` is not your own address, this number is wrong.
app.set("trust proxy", Number(process.env.TRUST_PROXY_HOPS || 2));

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

const { allowedOrigins, requireSameOrigin } = require("./config/origins");

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

// The per-IP limiter above buys nothing against an attack spread over a botnet,
// and unlike a player account there is exactly ONE admin password protecting
// every destructive endpoint on the site. This caps failed admin logins across
// all sources at once.
//
// `skipSuccessfulRequests` is what makes a global cap safe to run: a real admin
// signing in correctly never spends any of the budget, so the only way to
// exhaust it is to be wrong 100 times in 15 minutes — which is the case we
// actively want locked out.
const adminLoginGlobalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: () => "admin-login",
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  handler: (req, res) => {
    logWarn("admin.login", "global admin login lockout engaged", { ip: req.ip });
    res.status(429).json({ message: "Too many attempts. Please try again later." });
  }
});

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/resend-verification", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
app.use("/api/auth/reset-password", authLimiter);
app.use("/api/admin/login", authLimiter, adminLoginGlobalLimiter);
app.use("/api/highscore/save", writeLimiter);
app.use("/api/leaderboard/save", writeLimiter);

// /api/admin is deliberately NOT behind checkMaintenance — an admin must still
// be able to reach the panel and turn maintenance back off while it is on.
app.use("/api/admin", requireSameOrigin, require("./routes/adminRoutes"));
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

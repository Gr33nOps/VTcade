// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db"); // your connectDB file
const path = require("path");

const app = express();

// Middleware
app.use(express.json());

// CORS - allow only your frontend in production
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
app.use(cors({
  origin: FRONTEND_URL,
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
}));

// Connect to MongoDB
connectDB();

// Routes (ensure these files export an express.Router)
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/score", require("./routes/scoreRoutes"));
app.use("/api/game", require("./routes/gameRoutes"));
app.use("/api/leaderboard", require("./routes/leaderboard"));
app.use("/api/highscore", require("./routes/highscore"));

// Health check
app.get("/health", (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || "dev" }));

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Better process-level logging
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection:", reason, p);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});

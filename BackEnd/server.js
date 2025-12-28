require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const checkMaintenance = require("./middlewares/checkMaintenance"); // Add this

const app = express();

app.use(express.json());
app.use(cors());

connectDB();

// ==================== ROUTES ====================

// Admin routes - NOT affected by maintenance mode
app.use("/api/admin", require("./routes/adminRoutes"));

// User-facing routes - BLOCKED during maintenance mode
app.use("/api/auth", checkMaintenance, require("./routes/authRoutes"));
app.use("/api/score", checkMaintenance, require("./routes/scoreRoutes"));
app.use("/api/game", checkMaintenance, require("./routes/gameRoutes"));
app.use("/api/leaderboard", checkMaintenance, require("./routes/leaderboard"));
app.use("/api/highscore", checkMaintenance, require("./routes/highscore"));

// Health check - NOT affected by maintenance
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Root endpoint - NOT affected by maintenance
app.get("/", (req, res) => {
  res.json({ 
    message: "VTcade API Server",
    status: "running"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
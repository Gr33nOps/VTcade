// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const path = require("path");

const app = express();

// Middleware
app.use(express.json());

// CORS - Enhanced configuration for production
const FRONTEND_URL = process.env.FRONTEND_URL || "*";
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (FRONTEND_URL === "*") {
      return callback(null, true);
    }
    
    // Check against allowed origins
    const allowedOrigins = FRONTEND_URL.split(',').map(url => url.trim());
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
    return callback(null, true); // Allow anyway for debugging
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.get('origin') || 'none'}`);
  next();
});

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/score", require("./routes/scoreRoutes"));
app.use("/api/game", require("./routes/gameRoutes"));
app.use("/api/leaderboard", require("./routes/leaderboard"));
app.use("/api/highscore", require("./routes/highscore"));

// Health check with detailed info
app.get("/health", (req, res) => {
  res.json({ 
    ok: true, 
    env: process.env.NODE_ENV || "dev",
    timestamp: new Date().toISOString(),
    mongoConnected: require("mongoose").connection.readyState === 1
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "VTcade API Server",
    status: "running",
    endpoints: {
      health: "/health",
      auth: "/api/auth/*",
      score: "/api/score/*",
      game: "/api/game/*",
      leaderboard: "/api/leaderboard/*",
      highscore: "/api/highscore/*"
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found", path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    message: "Internal server error", 
    error: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
});

// Better process-level logging
process.on("unhandledRejection", (reason, p) => {
  console.error("Unhandled Rejection at:", p, "reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  process.exit(1);
});
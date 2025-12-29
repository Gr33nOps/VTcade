require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const checkMaintenance = require("./routes/maintenance"); 

const app = express();

app.use(express.json());
app.use(cors());

connectDB();

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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
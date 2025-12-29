const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Game = require("../models/Game");
const Leaderboard = require("../models/leaderboard");
const SystemSettings = require("../models/SystemSetting");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

function checkAdmin(req, res, next) {
    const { username, password } = req.headers;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ message: "Unauthorized" });
    }
}

router.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            res.json({ 
                message: "Admin login successful",
                username: ADMIN_USERNAME
            });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/stats", checkAdmin, async (req, res) => {
    try {
        const userCount = await User.countDocuments();
        const gameCount = await Game.countDocuments();

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const scoresToday = await Score.countDocuments({ 
            createdAt: { $gte: today } 
        });
        
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({ maintenanceMode: false });
        }
        
        res.json({
            users: userCount,
            games: gameCount,
            scoresToday: scoresToday,
            maintenanceMode: settings.maintenanceMode,
            status: settings.maintenanceMode ? "MAINTENANCE" : "OK"
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/users", checkAdmin, async (req, res) => {
    try {
        const users = await User.find()
            .select('-password')
            .sort({ createdAt: -1 });
        res.json({ users, total: users.length });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/users/:id/ban", checkAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isBanned: true },
            { new: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({ message: "User banned", user });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/users/:id/unban", checkAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { isBanned: false },
            { new: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        res.json({ message: "User unbanned", user });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/users/:id", checkAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        await Score.deleteMany({ userId: req.params.id });
        await Leaderboard.deleteMany({ userId: req.params.id });
        
        res.json({ message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/games", checkAdmin, async (req, res) => {
    try {
        const games = await Game.find().sort({ createdAt: -1 });
        res.json({ games, total: games.length });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/games/:id/enable", checkAdmin, async (req, res) => {
    try {
        const game = await Game.findByIdAndUpdate(
            req.params.id,
            { isActive: true },
            { new: true }
        );
        
        if (!game) {
            return res.status(404).json({ message: "Game not found" });
        }
        res.json({ message: "Game enabled", game });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/games/:id/disable", checkAdmin, async (req, res) => {
    try {
        const game = await Game.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );
        
        if (!game) {
            return res.status(404).json({ message: "Game not found" });
        }
        res.json({ message: "Game disabled", game });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/leaderboards", checkAdmin, async (req, res) => {
    try {
        const { game } = req.query;
        const filter = game ? { game } : {};
        
        const leaderboards = await Leaderboard.find(filter)
            .populate('userId', 'username')
            .sort({ score: -1 })
            .limit(100);
            
        res.json({ leaderboards, total: leaderboards.length });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/leaderboards/:id", checkAdmin, async (req, res) => {
    try {
        const entry = await Leaderboard.findByIdAndDelete(req.params.id);
        if (!entry) {
            return res.status(404).json({ message: "Entry not found" });
        }
        res.json({ message: "Score removed" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/leaderboards/reset/:game", checkAdmin, async (req, res) => {
    try {
        const result = await Leaderboard.deleteMany({ 
            game: req.params.game 
        });
        res.json({ 
            message: "Leaderboard reset", 
            deletedCount: result.deletedCount 
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/leaderboards/:id/flag", checkAdmin, async (req, res) => {
    try {
        const entry = await Leaderboard.findByIdAndUpdate(
            req.params.id,
            { isFlagged: true },
            { new: true }
        );
        
        if (!entry) {
            return res.status(404).json({ message: "Entry not found" });
        }
        res.json({ message: "Score flagged", entry });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/maintenance", checkAdmin, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({ maintenanceMode: false });
        }
        res.json({ maintenanceMode: settings.maintenanceMode });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/maintenance/enable", checkAdmin, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({ maintenanceMode: true });
        } else {
            settings.maintenanceMode = true;
            await settings.save();
        }
        res.json({ message: "Maintenance mode enabled", maintenanceMode: true });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.put("/maintenance/disable", checkAdmin, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({ maintenanceMode: false });
        } else {
            settings.maintenanceMode = false;
            await settings.save();
        }
        res.json({ message: "Maintenance mode disabled", maintenanceMode: false });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;

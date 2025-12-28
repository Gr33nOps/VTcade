const express = require("express");
const Game = require("../models/Game");

const router = express.Router();

router.post("/add", async (req, res) => {
    try {
        const game = await Game.create(req.body);
        res.json(game);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/", async (req, res) => {
    try {
        const games = await Game.find();
        res.json(games);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        await Game.findByIdAndDelete(req.params.id);
        res.json({ msg: "Game deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
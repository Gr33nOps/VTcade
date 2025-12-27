const express = require("express");
const Game = require("../models/Game");

const router = express.Router();

router.post("/add", async (req, res) => {
  const game = await Game.create(req.body);
  res.json(game);
});

router.get("/", async (req, res) => {
  const games = await Game.find();
  res.json(games);
});

router.delete("/:id", async (req, res) => {
  await Game.findByIdAndDelete(req.params.id);
  res.json({ msg: "Game deleted" });
});

module.exports = router;
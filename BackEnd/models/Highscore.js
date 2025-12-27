const mongoose = require("mongoose");

const UserHighscoreSchema = new mongoose.Schema({
    username: { type: String, required: true },
    game: { type: String, required: true },
    highscore: { type: Number, required: true, default: 0 }
});

// ✅ Prevent duplicates
UserHighscoreSchema.index({ username: 1, game: 1 }, { unique: true });

module.exports = mongoose.model("Highscore", UserHighscoreSchema);
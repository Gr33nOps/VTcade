// seedgames.js

require("dotenv").config(); // Load .env
const mongoose = require("mongoose");
const Game = require("./models/Game"); // adjust path if needed

const games = [
    {
        title: "FLAPPY BIRD",
        genre: "arcade",
        description: "Navigate through pipes by tapping to flap",
        difficulty: "medium",
        isActive: true
    },
    {
        title: "RUNNER",
        genre: "arcade",
        description: "Jump over obstacles and collect points",
        difficulty: "easy",
        isActive: true
    },
    {
        title: "SNAKE",
        genre: "arcade",
        description: "Classic snake game - eat food and grow",
        difficulty: "medium",
        isActive: true
    }
];

async function seedGames() {
    try {
        // Connect to MongoDB (no options needed in Mongoose 7+)
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        // Optional: Clear existing games
        // await Game.deleteMany({});
        // console.log("Cleared existing games");

        // Seed games
        for (const game of games) {
            const exists = await Game.findOne({ title: game.title });
            if (!exists) {
                await Game.create(game);
                console.log(`✓ Added: ${game.title}`);
            } else {
                console.log(`⊘ Already exists: ${game.title}`);
            }
        }

        console.log("✓ Seeding completed!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding games:", error);
        process.exit(1);
    }
}

seedGames();

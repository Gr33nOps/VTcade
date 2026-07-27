const express = require("express");
const { supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const { requireAdmin } = require("../config/auth");

const router = express.Router();

// Listing games is public (the dashboard needs it). Creating and deleting
// them previously had NO authentication at all — anyone who knew the URL
// could add or delete games.
router.post("/add", requireAdmin, asyncRoute(async (req, res) => {
    const { title, genre, description, difficulty, thumbnail } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
        return res.status(400).json({ message: "Title is required" });
    }

    // Only allow known columns through; the old version passed req.body
    // straight into the insert, so a client could set any column it liked.
    const { data, error } = await supabaseAdmin
        .from("games")
        .insert({
            title: title.trim(),
            genre: typeof genre === "string" ? genre.trim() : undefined,
            description: typeof description === "string" ? description.trim() : undefined,
            difficulty: typeof difficulty === "string" ? difficulty.trim() : undefined,
            thumbnail: typeof thumbnail === "string" ? thumbnail.trim() : undefined
        })
        .select()
        .single();

    if (error) throw error;

    res.status(201).json(data);
}));

router.get("/", asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("games")
        .select("*");

    if (error) throw error;

    res.json(data);
}));

router.delete("/:id", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("games")
        .delete()
        .eq("id", req.params.id)
        .select("id")
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Game not found" });

    res.json({ msg: "Game deleted" });
}));

module.exports = router;

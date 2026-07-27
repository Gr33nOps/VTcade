const express = require("express");
const { supabaseAdmin } = require("../config/supabase");

const router = express.Router();

router.post("/add", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("games")
            .insert(req.body)
            .select()
            .single();

        if (error) throw error;

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("games")
            .select("*");

        if (error) throw error;

        res.json(data);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const { error } = await supabaseAdmin
            .from("games")
            .delete()
            .eq("id", req.params.id);

        if (error) throw error;

        res.json({ msg: "Game deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;

// src/routes/deals.ts
import express from "express";
import { scrapeCarrefour } from "../scrappers/carrefour.js";

const router = express.Router();

router.get("/carrefour", async (req, res) => {
  try {
    const deals = await scrapeCarrefour();
    res.json(deals);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Carrefour deals" });
  }
});

export default router;

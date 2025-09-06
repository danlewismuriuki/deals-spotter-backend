import express from "express";
import dealsRouter from "../src/routes/deals.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use("/deals", dealsRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

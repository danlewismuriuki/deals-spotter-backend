// import express from "express";
// import dealsRouter from "../src/routes/deals.js";

// const app = express();
// const PORT = process.env.PORT || 3000;
// app.use("/deals", dealsRouter);

// app.listen(PORT, () => {
//   console.log(`Server running at http://localhost:${PORT}`);
// });



import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import dealsRouter from "./routes/deals.js";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found in environment variables");
  console.error("Make sure you have a .env file with MONGODB_URI");
  process.exit(1);
}

console.log("🔄 Connecting to MongoDB Atlas...");

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log("✅ Connected to MongoDB Atlas successfully!");
    console.log("📊 Database:", mongoose.connection.name);
    console.log("🌐 Host:", mongoose.connection.host);
  })
  .catch((error) => {
    console.error("❌ MongoDB connection failed:", error.message);
    console.error("🔍 Check your .env file and connection string");
    process.exit(1);
  });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/deals", dealsRouter);

// Health check endpoint
app.get("/", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";
  res.json({ 
    message: "Deals API Server is running!",
    database: dbStatus,
    endpoints: [
      "GET /api/deals - Get all deals",
      "GET /api/deals/naivas - Get Naivas deals",
      "POST /api/deals/scrape - Trigger scraping",
      "GET /api/deals/test-scrape - Test scraping",
      "GET /api/deals/stats - Get statistics"
    ]
  });
});

// Error handling for unhandled routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
    availableRoutes: ["/", "/api/deals"]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api/deals`);
  console.log(`🏥 Health check at http://localhost:${PORT}/`);
});
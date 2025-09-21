// import express from "express";
// import mongoose from "mongoose";
// import dotenv from "dotenv";
// import dealsRouter from "./routes/deals.js";

// // Load environment variables
// dotenv.config();

// const app = express();
// const PORT = process.env.PORT || 3000;

// // MongoDB connection
// const MONGODB_URI = process.env.MONGODB_URI;

// if (!MONGODB_URI) {
//   console.error("❌ MONGODB_URI not found in environment variables");
//   console.error("Make sure you have a .env file with MONGODB_URI");
//   process.exit(1);
// }

// console.log("🔄 Connecting to MongoDB Atlas...");

// mongoose.connect(MONGODB_URI)
//   .then(() => {
//     console.log("✅ Connected to MongoDB Atlas successfully!");
//     console.log("📊 Database:", mongoose.connection.name);
//     console.log("🌐 Host:", mongoose.connection.host);
//   })
//   .catch((error) => {
//     console.error("❌ MongoDB connection failed:", error.message);
//     console.error("🔍 Check your .env file and connection string");
//     process.exit(1);
//   });

// // Middleware
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// // Routes
// app.use("/api/deals", dealsRouter);

// // Health check endpoint
// app.get("/", (req, res) => {
//   const dbStatus = mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";
//   res.json({ 
//     message: "Deals API Server is running!",
//     database: dbStatus,
//     endpoints: [
//       "GET /api/deals - Get all deals",
//       "GET /api/deals/naivas - Get Naivas deals",
//       "POST /api/deals/scrape - Trigger scraping",
//       "GET /api/deals/test-scrape - Test scraping",
//       "GET /api/deals/stats - Get statistics"
//     ]
//   });
// });

// // Error handling for unhandled routes
// app.use((req, res) => {
//   res.status(404).json({
//     success: false,
//     error: `Route ${req.originalUrl} not found`,
//     availableRoutes: ["/", "/api/deals"]
//   });
// });

// app.listen(PORT, () => {
//   console.log(`🚀 Server running at http://localhost:${PORT}`);
//   console.log(`📡 API available at http://localhost:${PORT}/api/deals`);
//   console.log(`🏥 Health check at http://localhost:${PORT}/`);
// });




// src/index.ts - Enhanced version with CORS and updated endpoints
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

// CORS Middleware (enable cross-origin requests)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/deals", dealsRouter);

// Enhanced health check endpoint
app.get("/", (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";
  res.json({ 
    message: "🎯 Deals Spotter API Server is running!",
    database: dbStatus,
    version: "1.1.0",
    timestamp: new Date().toISOString(),
    endpoints: {
      deals: {
        "GET /api/deals": "Get all deals with filtering & pagination",
        "GET /api/deals/best": "Get best deals by discount %",
        "GET /api/deals/search?q=": "Search deals by product name",
        "GET /api/deals/recent": "Get most recently added deals",
        "GET /api/deals/stores": "Get available stores",
        "GET /api/deals/categories": "Get available categories",
        "GET /api/deals/naivas": "Get Naivas deals only",
        "GET /api/deals/stats": "Get comprehensive statistics"
      },
      scraping: {
        "POST /api/deals/scrape": "Manually trigger scraping",
        "GET /api/deals/test-scrape": "Test scraping functionality"
      }
    },
    examples: {
      "All deals": `http://localhost:${PORT}/api/deals`,
      "Best deals": `http://localhost:${PORT}/api/deals/best`,
      "Search toilet paper": `http://localhost:${PORT}/api/deals/search?q=toilet`,
      "Naivas deals only": `http://localhost:${PORT}/api/deals/naivas`,
      "Recent deals": `http://localhost:${PORT}/api/deals/recent`,
      "Statistics": `http://localhost:${PORT}/api/deals/stats`,
      "Available stores": `http://localhost:${PORT}/api/deals/stores`
    }
  });
});

// Error handling for unhandled routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
    availableRoutes: ["/", "/api/deals"],
    suggestion: "Visit http://localhost:3000/ for available endpoints"
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api/deals`);
  console.log(`🏥 Health check at http://localhost:${PORT}/`);
  console.log(`🔍 Try: http://localhost:${PORT}/api/deals/best`);
  console.log(`📊 Stats: http://localhost:${PORT}/api/deals/stats`);
  console.log(`🔎 Search: http://localhost:${PORT}/api/deals/search?q=toilet`);
});
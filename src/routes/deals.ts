// src/routes/deals.ts
import express from 'express';
import { DealModel } from '../models/Deal.js';
import { scrapeNaivasDeals } from '../scrappers/naivas.js'; // Fixed: correct export name
import type { Deal } from '../models/Deal.js'; // Add Deal type import

const router = express.Router();

// Helper function to safely get error message
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

// GET /api/deals - Get all active deals
router.get('/', async (req, res) => {
  try {
    const { store, location, minDiscount, category } = req.query;
    
    // Build query
    const query: any = { isActive: true };
    
    if (store) query.store = store;
    if (location) query.locations = { $in: [location] };
    if (minDiscount) query.discount = { $gte: parseInt(minDiscount as string) };
    if (category) query.category = new RegExp(category as string, 'i');

    const deals = await DealModel.find(query)
      .sort({ scrapedAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: deals.length,
      deals: deals.map(deal => ({
        id: deal.id,
        name: deal.name,
        store: deal.store,
        currentPrice: deal.currentPrice,
        originalPrice: deal.originalPrice,
        discount: deal.discount,
        discountType: deal.discountType,
        validUntil: deal.validUntil,
        locations: deal.locations,
        category: deal.category,
        image: deal.image,
        lastUpdated: deal.scrapedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch deals' });
  }
});

// GET /api/deals/naivas - Get Naivas deals only
router.get('/naivas', async (req, res) => {
  try {
    const deals = await DealModel.find({ store: 'naivas', isActive: true })
      .sort({ scrapedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      store: 'naivas',
      count: deals.length,
      deals
    });
  } catch (error) {
    console.error('Error fetching Naivas deals:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch Naivas deals' });
  }
});

// POST /api/deals/scrape - Manually trigger scraping
router.post('/scrape', async (req, res) => {
  try {
    const { store } = req.body;
    
    if (!store || store !== 'naivas') {
      return res.status(400).json({ 
        success: false, 
        error: 'Currently only naivas is supported. Use: {"store": "naivas"}' 
      });
    }

    console.log('🚀 Manual scraping triggered for Naivas...');
    
    // Add loading response for user
    res.json({
      success: true,
      message: 'Scraping started for Naivas. This may take 30-60 seconds...',
      status: 'in_progress'
    });

    // Do scraping in background
    try {
      const deals = await scrapeNaivasDeals(); // Fixed: correct function name
      console.log(`📦 Scraped ${deals.length} deals from Naivas`);
      if (deals.length === 0) {
        console.log('⚠️ No deals found - might be a scraping issue');
        return;
      }

      // Save deals to database
      let savedCount = 0;
      for (const deal of deals) { // Fixed: add type annotation
        try {
          // Check if similar deal already exists
          const existingDeal = await DealModel.findOne({
            name: { $regex: new RegExp(deal.name, 'i') },
            store: deal.store,
            currentPrice: deal.currentPrice
          });

          if (!existingDeal) {
            await DealModel.create(deal);
            savedCount++;
          } else {
            // Update existing deal
            await DealModel.updateOne(
              { _id: existingDeal._id },
              { 
                ...deal,
                scrapedAt: new Date(),
                lastVerified: new Date()
              }
            );
          }
        } catch (saveError) {
          console.error('Error saving individual deal:', getErrorMessage(saveError));
        }
      }

      console.log(`✅ Saved/updated ${savedCount} deals to database`);

    } catch (scrapingError) {
      console.error('Background scraping error:', getErrorMessage(scrapingError));
    }

  } catch (error) {
    console.error('Scraping endpoint error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Scraping failed',
      details: getErrorMessage(error)
    });
  }
});

// GET /api/deals/scrape/status - Check scraping status (for testing)
router.get('/test-scrape', async (req, res) => {
  try {
    console.log('🧪 Test scraping Naivas...');
    const startTime = Date.now();
    
    const deals = await scrapeNaivasDeals(); // Fixed: correct function name
    const endTime = Date.now();
    const duration = endTime - startTime;

    res.json({
      success: true,
      message: 'Test scraping completed',
      results: {
        deals_found: deals.length,
        duration_ms: duration,
        duration_seconds: Math.round(duration / 1000),
        sample_deals: deals.slice(0, 3).map((deal: Deal) => ({ // Fixed: add type annotation
          name: deal.name,
          price: deal.currentPrice,
          original_price: deal.originalPrice,
          discount: deal.discount
        }))
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Test scraping failed',
      details: getErrorMessage(error)
    });
  }
});

// GET /api/deals/stats - Basic statistics
router.get('/stats', async (req, res) => {
  try {
    const totalDeals = await DealModel.countDocuments({ isActive: true });
    const dealsByStore = await DealModel.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$store', count: { $sum: 1 } } }
    ]);

    const averageDiscount = await DealModel.aggregate([
      { $match: { isActive: true, discount: { $exists: true, $gt: 0 } } },
      { $group: { _id: null, avgDiscount: { $avg: '$discount' } } }
    ]);

    const recentDeals = await DealModel.find({ isActive: true })
      .sort({ scrapedAt: -1 })
      .limit(5)
      .select('name store currentPrice discount scrapedAt');

    res.json({
      success: true,
      stats: {
        totalActiveDeals: totalDeals,
        dealsByStore: dealsByStore.reduce((acc: Record<string, number>, item) => { // Fixed: add type annotation
          acc[item._id] = item.count;
          return acc;
        }, {}),
        averageDiscount: Math.round(averageDiscount[0]?.avgDiscount || 0),
        lastUpdated: new Date(),
        recentDeals: recentDeals.map(deal => ({
          name: deal.name,
          store: deal.store,
          price: deal.currentPrice,
          discount: deal.discount,
          scrapedAt: deal.scrapedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch stats' });
  }
});

export default router;



// // src/routes/deals.ts - Enhanced version
// import express from 'express';
// import { DealModel } from '../models/Deal.js';
// import { scrapeNaivasDeals } from '../scrappers/naivas.js';
// import type { Deal } from '../models/Deal.js';

// const router = express.Router();

// // Helper function to safely get error message
// const getErrorMessage = (error: unknown): string => {
//   if (error instanceof Error) return error.message;
//   return String(error);
// };

// // GET /api/deals - Get all active deals with enhanced filtering
// router.get('/', async (req, res) => {
//   try {
//     const { 
//       store, 
//       location, 
//       minDiscount, 
//       maxPrice,
//       minPrice,
//       category, 
//       limit = 50,
//       page = 1,
//       sortBy = 'scrapedAt',
//       sortOrder = 'desc'
//     } = req.query;
    
//     // Build query
//     const query: any = { isActive: true };
    
//     if (store) query.store = store;
//     if (location) query.locations = { $in: [location] };
//     if (minDiscount) query.discount = { $gte: parseInt(minDiscount as string) };
//     if (maxPrice) query.currentPrice = { ...query.currentPrice, $lte: parseInt(maxPrice as string) };
//     if (minPrice) query.currentPrice = { ...query.currentPrice, $gte: parseInt(minPrice as string) };
//     if (category) query.category = new RegExp(category as string, 'i');

//     // Pagination
//     const limitNum = Math.min(parseInt(limit as string), 100); // Max 100 items
//     const skip = (parseInt(page as string) - 1) * limitNum;

//     // Sorting
//     const sortOptions: any = {};
//     sortOptions[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

//     const deals = await DealModel.find(query)
//       .sort(sortOptions)
//       .skip(skip)
//       .limit(limitNum);

//     const total = await DealModel.countDocuments(query);

//     res.json({
//       success: true,
//       pagination: {
//         current_page: parseInt(page as string),
//         per_page: limitNum,
//         total: total,
//         total_pages: Math.ceil(total / limitNum)
//       },
//       deals: deals.map(deal => ({
//         id: deal.id,
//         name: deal.name,
//         store: deal.store,
//         currentPrice: deal.currentPrice,
//         originalPrice: deal.originalPrice,
//         discount: deal.discount,
//         discountType: deal.discountType,
//         validUntil: deal.validUntil,
//         locations: deal.locations,
//         category: deal.category,
//         image: deal.image,
//         sourceUrl: deal.sourceUrl,
//         lastUpdated: deal.scrapedAt
//       }))
//     });
//   } catch (error) {
//     console.error('Error fetching deals:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch deals' });
//   }
// });

// // GET /api/deals/best - Get best deals (highest discounts)
// router.get('/best', async (req, res) => {
//   try {
//     const { limit = 20, store, minDiscount = 20 } = req.query;
    
//     const query: any = { 
//       isActive: true,
//       discount: { $gte: parseInt(minDiscount as string) }
//     };
    
//     if (store) query.store = store;

//     const deals = await DealModel.find(query)
//       .sort({ discount: -1, scrapedAt: -1 })
//       .limit(parseInt(limit as string));

//     res.json({
//       success: true,
//       message: `Top ${deals.length} best deals`,
//       filter: {
//         min_discount: parseInt(minDiscount as string),
//         store: store || 'all'
//       },
//       deals: deals.map(deal => ({
//         id: deal.id,
//         name: deal.name,
//         store: deal.store,
//         currentPrice: deal.currentPrice,
//         originalPrice: deal.originalPrice,
//         discount: deal.discount,
//         savings: deal.originalPrice ? deal.originalPrice - deal.currentPrice : 0,
//         category: deal.category,
//         image: deal.image,
//         validUntil: deal.validUntil,
//         lastUpdated: deal.scrapedAt
//       }))
//     });
//   } catch (error) {
//     console.error('Error fetching best deals:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch best deals' });
//   }
// });

// // GET /api/deals/search - Search deals by name
// router.get('/search', async (req, res) => {
//   try {
//     const { q, store, limit = 20 } = req.query;
    
//     if (!q) {
//       return res.status(400).json({
//         success: false,
//         error: 'Search query parameter "q" is required'
//       });
//     }

//     const query: any = {
//       isActive: true,
//       name: { $regex: new RegExp(q as string, 'i') }
//     };
    
//     if (store) query.store = store;

//     const deals = await DealModel.find(query)
//       .sort({ discount: -1, scrapedAt: -1 })
//       .limit(parseInt(limit as string));

//     res.json({
//       success: true,
//       query: q,
//       count: deals.length,
//       deals: deals.map(deal => ({
//         id: deal.id,
//         name: deal.name,
//         store: deal.store,
//         currentPrice: deal.currentPrice,
//         originalPrice: deal.originalPrice,
//         discount: deal.discount,
//         category: deal.category,
//         image: deal.image,
//         sourceUrl: deal.sourceUrl,
//         lastUpdated: deal.scrapedAt
//       }))
//     });
//   } catch (error) {
//     console.error('Error searching deals:', error);
//     res.status(500).json({ success: false, error: 'Failed to search deals' });
//   }
// });

// // GET /api/deals/stores - Get available stores
// router.get('/stores', async (req, res) => {
//   try {
//     const stores = await DealModel.aggregate([
//       { $match: { isActive: true } },
//       { 
//         $group: { 
//           _id: '$store', 
//           count: { $sum: 1 },
//           avgDiscount: { $avg: '$discount' },
//           lastUpdated: { $max: '$scrapedAt' }
//         } 
//       },
//       { $sort: { count: -1 } }
//     ]);

//     res.json({
//       success: true,
//       stores: stores.map(store => ({
//         name: store._id,
//         totalDeals: store.count,
//         averageDiscount: Math.round(store.avgDiscount || 0),
//         lastUpdated: store.lastUpdated
//       }))
//     });
//   } catch (error) {
//     console.error('Error fetching stores:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch stores' });
//   }
// });

// // GET /api/deals/categories - Get available categories
// router.get('/categories', async (req, res) => {
//   try {
//     const { store } = req.query;
    
//     const matchQuery: any = { isActive: true };
//     if (store) matchQuery.store = store;

//     const categories = await DealModel.aggregate([
//       { $match: matchQuery },
//       { $match: { category: { $exists: true, $nin: [null, '', undefined] } } },
//       { 
//         $group: { 
//           _id: '$category', 
//           count: { $sum: 1 },
//           avgDiscount: { $avg: '$discount' }
//         } 
//       },
//       { $sort: { count: -1 } }
//     ]);

//     res.json({
//       success: true,
//       filter: store ? { store } : null,
//       categories: categories.map(cat => ({
//         name: cat._id,
//         totalDeals: cat.count,
//         averageDiscount: Math.round(cat.avgDiscount || 0)
//       }))
//     });
//   } catch (error) {
//     console.error('Error fetching categories:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch categories' });
//   }
// });

// // GET /api/deals/recent - Get most recently added deals
// router.get('/recent', async (req, res) => {
//   try {
//     const { limit = 10, store } = req.query;
    
//     const query: any = { isActive: true };
//     if (store) query.store = store;

//     const deals = await DealModel.find(query)
//       .sort({ scrapedAt: -1 })
//       .limit(parseInt(limit as string));

//     res.json({
//       success: true,
//       message: `${deals.length} most recent deals`,
//       deals: deals.map(deal => ({
//         id: deal.id,
//         name: deal.name,
//         store: deal.store,
//         currentPrice: deal.currentPrice,
//         originalPrice: deal.originalPrice,
//         discount: deal.discount,
//         category: deal.category,
//         image: deal.image,
//         addedAt: deal.scrapedAt,
//         validUntil: deal.validUntil
//       }))
//     });
//   } catch (error) {
//     console.error('Error fetching recent deals:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch recent deals' });
//   }
// });

// // GET /api/deals/naivas - Keep existing Naivas endpoint
// router.get('/naivas', async (req, res) => {
//   try {
//     const { limit = 50 } = req.query;
    
//     const deals = await DealModel.find({ store: 'naivas', isActive: true })
//       .sort({ scrapedAt: -1 })
//       .limit(parseInt(limit as string));

//     res.json({
//       success: true,
//       store: 'naivas',
//       count: deals.length,
//       deals
//     });
//   } catch (error) {
//     console.error('Error fetching Naivas deals:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch Naivas deals' });
//   }
// });

// // Keep all your existing endpoints (scrape, test-scrape, stats)
// // POST /api/deals/scrape - Manually trigger scraping
// router.post('/scrape', async (req, res) => {
//   try {
//     const { store } = req.body;
    
//     if (!store || store !== 'naivas') {
//       return res.status(400).json({ 
//         success: false, 
//         error: 'Currently only naivas is supported. Use: {"store": "naivas"}' 
//       });
//     }

//     console.log('🚀 Manual scraping triggered for Naivas...');
    
//     res.json({
//       success: true,
//       message: 'Scraping started for Naivas. This may take 30-60 seconds...',
//       status: 'in_progress'
//     });

//     // Background scraping logic (same as before)
//     try {
//       const deals = await scrapeNaivasDeals();
//       console.log(`📦 Scraped ${deals.length} deals from Naivas`);

//       if (deals.length === 0) {
//         console.log('⚠️ No deals found - might be a scraping issue');
//         return;
//       }

//       let savedCount = 0;
//       for (const deal of deals) {
//         try {
//           const existingDeal = await DealModel.findOne({
//             name: { $regex: new RegExp(deal.name, 'i') },
//             store: deal.store,
//             currentPrice: deal.currentPrice
//           });

//           if (!existingDeal) {
//             await DealModel.create(deal);
//             savedCount++;
//           } else {
//             await DealModel.updateOne(
//               { _id: existingDeal._id },
//               { 
//                 ...deal,
//                 scrapedAt: new Date(),
//                 lastVerified: new Date()
//               }
//             );
//           }
//         } catch (saveError) {
//           console.error('Error saving individual deal:', getErrorMessage(saveError));
//         }
//       }

//       console.log(`✅ Saved/updated ${savedCount} deals to database`);

//     } catch (scrapingError) {
//       console.error('Background scraping error:', getErrorMessage(scrapingError));
//     }

//   } catch (error) {
//     console.error('Scraping endpoint error:', error);
//     res.status(500).json({ 
//       success: false, 
//       error: 'Scraping failed',
//       details: getErrorMessage(error)
//     });
//   }
// });

// // GET /api/deals/test-scrape - Keep existing
// router.get('/test-scrape', async (req, res) => {
//   try {
//     console.log('🧪 Test scraping Naivas...');
//     const startTime = Date.now();
    
//     const deals = await scrapeNaivasDeals();
//     const endTime = Date.now();
//     const duration = endTime - startTime;

//     res.json({
//       success: true,
//       message: 'Test scraping completed',
//       results: {
//         deals_found: deals.length,
//         duration_ms: duration,
//         duration_seconds: Math.round(duration / 1000),
//         sample_deals: deals.slice(0, 3).map((deal: Deal) => ({
//           name: deal.name,
//           price: deal.currentPrice,
//           original_price: deal.originalPrice,
//           discount: deal.discount
//         }))
//       }
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       error: 'Test scraping failed',
//       details: getErrorMessage(error)
//     });
//   }
// });

// // GET /api/deals/stats - Enhanced statistics
// router.get('/stats', async (req, res) => {
//   try {
//     const totalDeals = await DealModel.countDocuments({ isActive: true });
    
//     const dealsByStore = await DealModel.aggregate([
//       { $match: { isActive: true } },
//       { $group: { _id: '$store', count: { $sum: 1 } } }
//     ]);

//     const averageDiscount = await DealModel.aggregate([
//       { $match: { isActive: true, discount: { $exists: true, $gt: 0 } } },
//       { $group: { _id: null, avgDiscount: { $avg: '$discount' } } }
//     ]);

//     const bestDeals = await DealModel.find({ isActive: true })
//       .sort({ discount: -1 })
//       .limit(5)
//       .select('name store currentPrice originalPrice discount scrapedAt');

//     const priceRanges = await DealModel.aggregate([
//       { $match: { isActive: true } },
//       {
//         $group: {
//           _id: null,
//           under500: { $sum: { $cond: [{ $lt: ['$currentPrice', 500] }, 1, 0] } },
//           between500_1000: { $sum: { $cond: [{ $and: [{ $gte: ['$currentPrice', 500] }, { $lt: ['$currentPrice', 1000] }] }, 1, 0] } },
//           between1000_2000: { $sum: { $cond: [{ $and: [{ $gte: ['$currentPrice', 1000] }, { $lt: ['$currentPrice', 2000] }] }, 1, 0] } },
//           above2000: { $sum: { $cond: [{ $gte: ['$currentPrice', 2000] }, 1, 0] } }
//         }
//       }
//     ]);

//     res.json({
//       success: true,
//       stats: {
//         totalActiveDeals: totalDeals,
//         dealsByStore: dealsByStore.reduce((acc: Record<string, number>, item) => {
//           acc[item._id] = item.count;
//           return acc;
//         }, {}),
//         averageDiscount: Math.round(averageDiscount[0]?.avgDiscount || 0),
//         priceDistribution: priceRanges[0] || {},
//         lastUpdated: new Date(),
//         topDeals: bestDeals.map(deal => ({
//           name: deal.name,
//           store: deal.store,
//           price: deal.currentPrice,
//           originalPrice: deal.originalPrice,
//           discount: deal.discount,
//           savings: deal.originalPrice ? deal.originalPrice - deal.currentPrice : 0,
//           scrapedAt: deal.scrapedAt
//         }))
//       }
//     });
//   } catch (error) {
//     console.error('Error fetching stats:', error);
//     res.status(500).json({ success: false, error: 'Failed to fetch stats' });
//   }
// });

// export default router;
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
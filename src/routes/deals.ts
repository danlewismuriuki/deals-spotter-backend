// src/routes/deals.ts - Enhanced with new comparison features (TypeScript fixed)
import express from 'express';
import { DealModel, UserCorrectionModel } from '../models/Deal.js';
import { scrapeNaivasDeals } from '../scrappers/naivas.js';
import { 
  normalizeInput, 
  findBestMatch, 
  generateCacheKey,
  getCachedResult, 
  setCachedResult, 
  clearCache, 
  getCacheStats 
} from '../services/basketComparison.js';
import type { Deal, MatchResult } from '../models/Deal.js';

const router = express.Router();

// Define cache result interface
interface CachedResult {
  matches: MatchResult[];
  storeComparisons: any[];
  timestamp: string;
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

// NEW: Compare shopping basket endpoint
router.post('/compare-basket', async (req, res) => {
  try {
    const { items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Items array is required and must not be empty',
        example: { items: ["2kg rice", "1L milk", "bread"] }
      });
    }
    
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = generateCacheKey(items);
    const cached = getCachedResult(cacheKey) as CachedResult | undefined;
    
    if (cached) {
      return res.json({
        success: true,
        cached: true,
        summary: {
          totalItems: items.length,
          itemsFound: cached.matches.filter((m: MatchResult) => m.confidence > 50).length,
          averageConfidence: Math.round(
            cached.matches.reduce((sum: number, m: MatchResult) => sum + m.confidence, 0) / cached.matches.length
          ),
          processingTimeMs: 0
        },
        storeComparisons: cached.storeComparisons,
        itemDetails: cached.matches,
        timestamp: cached.timestamp
      });
    }
    
    // Process each item
    const normalizedItems = items.map(normalizeInput);
    const matchPromises = normalizedItems.map(item => findBestMatch(item));
    const matches = await Promise.all(matchPromises);
    
    // Group by store and calculate totals
    const storeMap = new Map<string, MatchResult[]>();
    
    matches.forEach(match => {
      if (match.matchedDealId) {
        // In a real implementation, you'd need to fetch the deal to get the store
        // For now, we'll simulate this
        const stores = ['naivas', 'carrefour', 'quickmart', 'tuskys'];
        stores.forEach(store => {
          if (!storeMap.has(store)) {
            storeMap.set(store, []);
          }
          // Add match to each store (with store-specific pricing)
          storeMap.get(store)!.push({
            ...match,
            totalPrice: match.totalPrice || 0
          });
        });
      }
    });
    
    // Calculate store comparisons
    const storeComparisons = Array.from(storeMap.entries()).map(([store, storeMatches]) => {
      const total = storeMatches.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
      const itemsFound = storeMatches.filter(item => item.confidence > 50).length;
      const avgConfidence = storeMatches.reduce((sum, item) => sum + item.confidence, 0) / storeMatches.length;
      
      return {
        store,
        total: Math.round(total * 100) / 100,
        itemsFound,
        totalItems: matches.length,
        items: storeMatches,
        confidence: Math.round(avgConfidence)
      };
    });
    
    // Sort by total (cheapest first)
    storeComparisons.sort((a, b) => a.total - b.total);
    
    // Cache the result
    const result: CachedResult = {
      matches,
      storeComparisons,
      timestamp: new Date().toISOString()
    };
    setCachedResult(cacheKey, result);
    
    const processingTime = Date.now() - startTime;
    const totalItemsFound = matches.filter(m => m.confidence > 50).length;
    const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
    
    res.json({
      success: true,
      cached: false,
      summary: {
        totalItems: items.length,
        itemsFound: totalItemsFound,
        averageConfidence: Math.round(avgConfidence),
        processingTimeMs: processingTime
      },
      storeComparisons,
      itemDetails: matches,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Compare basket error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to compare basket',
      message: getErrorMessage(error)
    });
  }
});

// NEW: User feedback endpoint for match corrections
router.post('/correct-match', async (req, res) => {
  try {
    const { originalQuery, correctedDealId, userId } = req.body;
    
    if (!originalQuery || !correctedDealId) {
      return res.status(400).json({
        success: false,
        error: 'originalQuery and correctedDealId are required'
      });
    }
    
    // Verify the corrected deal exists
    const correctedDeal = await DealModel.findById(correctedDealId);
    if (!correctedDeal) {
      return res.status(404).json({ 
        success: false, 
        error: 'Corrected deal not found' 
      });
    }
    
    // Store the correction
    const correction = await UserCorrectionModel.create({
      originalQuery: originalQuery.toLowerCase().trim(),
      correctedDealId,
      correctedDealName: correctedDeal.name,
      confidence: 90,
      userId: userId || 'anonymous',
      timestamp: new Date()
    });
    
    // Clear related cache entries
    clearCache();
    
    res.json({
      success: true,
      message: 'Match correction recorded successfully',
      correction: {
        id: correction.id,
        originalQuery: correction.originalQuery,
        correctedDealName: correction.correctedDealName,
        timestamp: correction.timestamp
      }
    });
    
  } catch (error) {
    console.error('Correction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to record correction',
      message: getErrorMessage(error)
    });
  }
});

// NEW: Enhanced search with fuzzy matching
router.get('/search', async (req, res) => {
  try {
    const { q: query, store, limit = 20, offset = 0 } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter "q" is required',
        example: '/api/deals/search?q=rice'
      });
    }
    
    // Use the matching service for consistent results
    const normalizedItem = normalizeInput(query as string);
    const match = await findBestMatch(normalizedItem);
    
    // Also do a broader search for alternatives
    let searchFilter: any = {
      isActive: true,
      scrapedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    };
    
    if (store) searchFilter.store = store;
    
    const deals = await DealModel.find({
      ...searchFilter,
      name: { $regex: normalizedItem.keywords.join('|'), $options: 'i' }
    })
      .sort({ scrapedAt: -1 })
      .limit(Number(limit))
      .skip(Number(offset));
    
    res.json({
      success: true,
      query: query,
      bestMatch: match.confidence > 50 ? {
        name: match.matchedName,
        confidence: match.confidence,
        matchSource: match.matchSource,
        totalPrice: match.totalPrice,
        quantityMultiplier: match.quantityMultiplier
      } : null,
      searchResults: {
        count: deals.length,
        deals: deals.map(deal => ({
          id: deal.id,
          name: deal.name,
          store: deal.store,
          currentPrice: deal.currentPrice,
          originalPrice: deal.originalPrice,
          discount: deal.discount,
          unit: deal.unit,
          unitPrice: deal.unitPrice,
          category: deal.category,
          scrapedAt: deal.scrapedAt
        }))
      }
    });
    
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed',
      message: getErrorMessage(error)
    });
  }
});

// NEW: Get best deals with enhanced filtering
router.get('/best', async (req, res) => {
  try {
    const { minDiscount = 10, store, category, limit = 50 } = req.query;
    
    const query: any = {
      isActive: true,
      discount: { $gte: Number(minDiscount) },
      scrapedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    };
    
    if (store) query.store = store;
    if (category) query.category = new RegExp(category as string, 'i');
    
    const deals = await DealModel.find(query)
      .sort({ discount: -1, scrapedAt: -1 })
      .limit(Number(limit));
    
    res.json({
      success: true,
      filters: { minDiscount, store, category },
      count: deals.length,
      deals: deals.map(deal => ({
        id: deal.id,
        name: deal.name,
        store: deal.store,
        currentPrice: deal.currentPrice,
        originalPrice: deal.originalPrice,
        discount: deal.discount,
        discountType: deal.discountType,
        unit: deal.unit,
        unitPrice: deal.unitPrice,
        savings: deal.originalPrice ? 
          Math.round((deal.originalPrice - deal.currentPrice) * 100) / 100 : 0,
        validUntil: deal.validUntil,
        category: deal.category,
        scrapedAt: deal.scrapedAt
      }))
    });
    
  } catch (error) {
    console.error('Best deals error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch best deals',
      message: getErrorMessage(error)
    });
  }
});

// NEW: Get recent deals
router.get('/recent', async (req, res) => {
  try {
    const { store, limit = 30 } = req.query;
    
    const query: any = { isActive: true };
    if (store) query.store = store;
    
    const deals = await DealModel.find(query)
      .sort({ scrapedAt: -1 })
      .limit(Number(limit));
    
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
        unit: deal.unit,
        category: deal.category,
        scrapedAt: deal.scrapedAt,
        isNew: (Date.now() - deal.scrapedAt.getTime()) < (2 * 60 * 60 * 1000) // New if < 2 hours
      }))
    });
    
  } catch (error) {
    console.error('Recent deals error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent deals',
      message: getErrorMessage(error)
    });
  }
});

// NEW: Get available stores
router.get('/stores', async (req, res) => {
  try {
    const stores = await DealModel.aggregate([
      { $match: { isActive: true } },
      { 
        $group: { 
          _id: '$store', 
          count: { $sum: 1 },
          lastUpdated: { $max: '$scrapedAt' },
          avgDiscount: { $avg: { $ifNull: ['$discount', 0] } }
        } 
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      stores: stores.map(store => ({
        name: store._id,
        dealCount: store.count,
        lastUpdated: store.lastUpdated,
        averageDiscount: Math.round(store.avgDiscount || 0)
      }))
    });
    
  } catch (error) {
    console.error('Stores error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stores',
      message: getErrorMessage(error)
    });
  }
});

// FIXED: Combine the $ne conditions properly
router.get('/categories', async (req, res) => {
  try {
    const categories = await DealModel.aggregate([
      { 
        $match: { 
          isActive: true, 
          category: { 
            $exists: true, 
            $nin: [null, '']
          }
        } 
      },
      { 
        $group: { 
          _id: '$category', 
          count: { $sum: 1 },
          avgDiscount: { $avg: { $ifNull: ['$discount', 0] } }
        } 
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      categories: categories.map(cat => ({
        name: cat._id,
        dealCount: cat.count,
        averageDiscount: Math.round(cat.avgDiscount || 0)
      }))
    });
    
  } catch (error) {
    console.error('Categories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: getErrorMessage(error)
    });
  }
});

// NEW: Admin endpoints for cache management
router.post('/admin/clear-cache', (req, res) => {
  try {
    clearCache();
    res.json({ 
      success: true, 
      message: 'Cache cleared successfully' 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: getErrorMessage(error)
    });
  }
});

router.get('/admin/cache-stats', (req, res) => {
  try {
    const stats = getCacheStats();
    res.json({ 
      success: true, 
      stats: {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get cache stats',
      message: getErrorMessage(error)
    });
  }
});

// EXISTING ENDPOINTS (enhanced)

// GET /api/deals - Enhanced with better filtering
router.get('/', async (req, res) => {
  try {
    const { 
      store, 
      location, 
      minDiscount, 
      category, 
      limit = 100, 
      offset = 0,
      sortBy = 'scrapedAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query: any = { isActive: true };
    
    if (store) query.store = store;
    if (location) query.locations = { $in: [location] };
    if (minDiscount) query.discount = { $gte: parseInt(minDiscount as string) };
    if (category) query.category = new RegExp(category as string, 'i');

    // Build sort object
    const sort: any = {};
    sort[sortBy as string] = sortOrder === 'desc' ? -1 : 1;

    const deals = await DealModel.find(query)
      .sort(sort)
      .limit(Number(limit))
      .skip(Number(offset));

    const totalCount = await DealModel.countDocuments(query);

    res.json({
      success: true,
      pagination: {
        total: totalCount,
        count: deals.length,
        limit: Number(limit),
        offset: Number(offset)
      },
      filters: { store, location, minDiscount, category },
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
        unit: deal.unit,
        unitPrice: deal.unitPrice,
        lastUpdated: deal.scrapedAt
      }))
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch deals' 
    });
  }
});

// Keep existing endpoints unchanged
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

// Enhanced scraping endpoint (Fixed unit parsing errors)
router.post('/scrape', async (req, res) => {
  try {
    const { store } = req.body;
    
    if (!store || store !== 'naivas') {
      return res.status(400).json({ 
        success: false, 
        error: 'Currently only naivas is supported. Use: {"store": "naivas"}' 
      });
    }

    console.log('Manual scraping triggered for Naivas...');
    
    res.json({
      success: true,
      message: 'Scraping started for Naivas. This may take 30-60 seconds...',
      status: 'in_progress'
    });

    // Background scraping with enhanced unit extraction
    try {
      const deals = await scrapeNaivasDeals();
      console.log(`Scraped ${deals.length} deals from Naivas`);
      
      if (deals.length === 0) {
        console.log('No deals found - might be a scraping issue');
        return;
      }

      // Enhanced saving with unit parsing (Fixed TypeScript errors)
      let savedCount = 0;
      for (const deal of deals) {
        try {
          // Extract unit information from deal name if not already present
          if (!deal.unit) {
            const unitMatch = deal.name.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|gram|kilogram)/i);
            if (unitMatch && unitMatch[1] && unitMatch[2]) {
              deal.unit = {
                amount: parseFloat(unitMatch[1]),
                unit: unitMatch[2].toLowerCase() as 'kg' | 'g' | 'l' | 'ml' | 'unit' | 'piece'
              };
            }
          }
          
          // Calculate unit price if possible
          if (deal.unit && !deal.unitPrice) {
            const baseAmount = deal.unit.unit === 'g' ? 
              deal.unit.amount / 1000 : 
              deal.unit.unit === 'ml' ? deal.unit.amount / 1000 : deal.unit.amount;
            
            deal.unitPrice = deal.currentPrice / baseAmount;
          }

          const existingDeal = await DealModel.findOne({
            name: { $regex: new RegExp(deal.name, 'i') },
            store: deal.store,
            currentPrice: deal.currentPrice
          });

          if (!existingDeal) {
            await DealModel.create(deal);
            savedCount++;
          } else {
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

      // Clear cache after successful scraping
      clearCache();
      console.log(`Saved/updated ${savedCount} deals to database and cleared cache`);

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

// Enhanced test scraping
router.get('/test-scrape', async (req, res) => {
  try {
    console.log('Test scraping Naivas...');
    const startTime = Date.now();
    
    const deals = await scrapeNaivasDeals();
    const endTime = Date.now();
    const duration = endTime - startTime;

    res.json({
      success: true,
      message: 'Test scraping completed',
      results: {
        deals_found: deals.length,
        duration_ms: duration,
        duration_seconds: Math.round(duration / 1000),
        sample_deals: deals.slice(0, 3).map((deal: Deal) => ({
          name: deal.name,
          price: deal.currentPrice,
          original_price: deal.originalPrice,
          discount: deal.discount,
          unit: deal.unit,
          unitPrice: deal.unitPrice
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

// Enhanced stats endpoint
router.get('/stats', async (req, res) => {
  try {
    const totalDeals = await DealModel.countDocuments({ isActive: true });
    const totalCorrections = await UserCorrectionModel.countDocuments();
    
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
      .select('name store currentPrice discount scrapedAt unit unitPrice');

    const cacheStats = getCacheStats();

    res.json({
      success: true,
      stats: {
        totalActiveDeals: totalDeals,
        totalUserCorrections: totalCorrections,
        dealsByStore: dealsByStore.reduce((acc: Record<string, number>, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        averageDiscount: Math.round(averageDiscount[0]?.avgDiscount || 0),
        cachePerformance: {
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          hitRate: cacheStats.hits / (cacheStats.hits + cacheStats.misses) || 0
        },
        lastUpdated: new Date(),
        recentDeals: recentDeals.map(deal => ({
          name: deal.name,
          store: deal.store,
          price: deal.currentPrice,
          discount: deal.discount,
          unit: deal.unit,
          unitPrice: deal.unitPrice,
          scrapedAt: deal.scrapedAt
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch stats' 
    });
  }
});

export default router;
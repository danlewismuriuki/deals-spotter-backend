// src/services/basketComparison.ts - Fixed all TypeScript errors
import Fuse from 'fuse.js';
import NodeCache from 'node-cache';
import { DealModel, UserCorrectionModel } from '../models/Deal.js';
import type { Deal, UserCorrection, NormalizedItem, MatchResult } from '../models/Deal.js';

// Initialize cache (30 minute TTL, max 1000 items)
const queryCache = new NodeCache({ stdTTL: 1800, maxKeys: 1000 });

// Fuse.js configuration for fuzzy matching
const fuseOptions = {
  keys: ['name'],
  threshold: 0.4, // Lower = more strict matching
  distance: 100,
  includeScore: true,
  minMatchCharLength: 3
};

// Text normalization and quantity extraction (Fixed null checks)
export function normalizeInput(text: string): NormalizedItem {
  const original = text;
  let clean = text.toLowerCase().trim();
  
  // Extract quantity and unit patterns
  const qtyPattern = /(\d+(?:\.\d+)?)\s*(kg|g|l|ml|litre|liter|gram|kilogram|unit|piece|pc|pcs)\b/gi;
  const matches = [...clean.matchAll(qtyPattern)];
  
  let quantity: number | undefined;
  let unit: string | undefined;
  
  if (matches.length > 0) {
    const match = matches[0];
    // Fixed: Add null checks for match array elements
    if (match && match[1] && match[2]) {
      quantity = parseFloat(match[1]);
      unit = normalizeUnit(match[2]);
      // Remove quantity/unit from clean text
      clean = clean.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
    }
  }
  
  // Extract meaningful keywords (skip common words)
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'per']);
  const keywords = clean
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
  
  return {
    originalText: original,
    cleanText: clean,
    quantity,
    unit,
    keywords
  };
}

function normalizeUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    'gram': 'g',
    'kilogram': 'kg',
    'litre': 'l',
    'liter': 'l',
    'piece': 'unit',
    'pc': 'unit',
    'pcs': 'unit'
  };
  return unitMap[unit.toLowerCase()] || unit.toLowerCase();
}

// Convert units for comparison
function convertToBaseUnit(amount: number, unit: string): { amount: number; unit: string } {
  switch (unit) {
    case 'g':
      return { amount: amount / 1000, unit: 'kg' };
    case 'ml':
      return { amount: amount / 1000, unit: 'l' };
    default:
      return { amount, unit };
  }
}

// Calculate quantity requirements with scaling
function calculateQuantityRequirements(
  requestedQty: number | undefined,
  requestedUnit: string | undefined,
  dealUnit: { amount: number; unit: string } | undefined
): { multiplier: number; canFulfill: boolean } {
  
  if (!requestedQty || !requestedUnit || !dealUnit) {
    return { multiplier: 1, canFulfill: true };
  }

  // Convert both to same unit for comparison
  const normalizedRequested = convertToBaseUnit(requestedQty, requestedUnit);
  const normalizedDeal = convertToBaseUnit(dealUnit.amount, dealUnit.unit);
  
  // Only calculate multiplier if units are compatible
  if (normalizedRequested.unit !== normalizedDeal.unit) {
    return { multiplier: 1, canFulfill: false };
  }
  
  // Calculate how many packages needed
  const multiplier = Math.ceil(normalizedRequested.amount / normalizedDeal.amount);
  
  return { multiplier, canFulfill: true };
}

// Calculate unit price for comparison
function calculateUnitPrice(deal: Deal): number {
  if (deal.unitPrice) return deal.unitPrice;
  
  if (deal.unit) {
    const baseUnit = convertToBaseUnit(deal.unit.amount, deal.unit.unit);
    return deal.currentPrice / baseUnit.amount;
  }
  
  return deal.currentPrice; // fallback to absolute price
}

// Enhanced fuzzy matching (Fixed typing issues)
async function fuzzySearchDeals(normalizedItem: NormalizedItem): Promise<Deal[]> {
  // Get recent deals for fuzzy matching (limit to reasonable number)
  const candidates = await DealModel.find({
    isActive: true,
    scrapedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  }).limit(500).lean();
  
  const fuse = new Fuse(candidates, fuseOptions);
  const searchTerm = normalizedItem.keywords.join(' ');
  
  const results = fuse.search(searchTerm);
  
  return results
    .filter(result => result.score! < 0.6) // Lower score = better match
    .map(result => {
      // Fixed: Convert MongoDB document to Deal interface
      const item = result.item as any;
      return {
        ...item,
        id: item._id?.toString() || item.id
      } as Deal;
    })
    .slice(0, 10);
}

// Check user corrections (Fixed null return type)
async function checkUserCorrections(normalizedItem: NormalizedItem): Promise<Deal | null> {
  try {
    const correction = await UserCorrectionModel.findOne({
      originalQuery: { 
        $regex: normalizedItem.keywords.join('.*'), 
        $options: 'i' 
      }
    }).sort({ timestamp: -1 });
    
    if (correction && correction.confidence > 80) {
      // Fixed: Handle potential null return from findById
      const deal = await DealModel.findById(correction.correctedDealId);
      if (deal) {
        return {
          ...deal.toObject(),
          id: deal._id.toString()
        } as Deal;
      }
    }
  } catch (error) {
    console.error('Error checking user corrections:', error);
  }
  
  return null;
}

// Enhanced scoring with match source consideration
function scoreMatch(deal: Deal, normalizedItem: NormalizedItem, matchSource: string): number {
  let score = 0;
  const dealName = deal.name.toLowerCase();
  
  // Base score by match source
  switch (matchSource) {
    case 'user_correction':
      score = 95;
      break;
    case 'text_search':
      score = 60;
      break;
    case 'regex':
      score = 50;
      break;
    case 'fuzzy':
      score = 40;
      break;
    default:
      score = 60;
  }
  
  // Keyword matching adjustment
  const matchedKeywords = normalizedItem.keywords.filter(keyword => 
    dealName.includes(keyword)
  );
  const keywordRatio = matchedKeywords.length / normalizedItem.keywords.length;
  
  // Adjust base score based on keyword coverage
  score = score * (0.5 + 0.5 * keywordRatio);
  
  // Unit compatibility bonus
  if (normalizedItem.unit && deal.unit) {
    const normalizedDealUnit = normalizeUnit(deal.unit.unit);
    if (normalizedItem.unit === normalizedDealUnit) {
      score += 15;
    }
    else if (
      (normalizedItem.unit === 'kg' && normalizedDealUnit === 'g') ||
      (normalizedItem.unit === 'g' && normalizedDealUnit === 'kg') ||
      (normalizedItem.unit === 'l' && normalizedDealUnit === 'ml') ||
      (normalizedItem.unit === 'ml' && normalizedDealUnit === 'l')
    ) {
      score += 8;
    }
  }
  
  // Exact quantity match bonus
  if (normalizedItem.quantity && deal.unit) {
    const normalizedRequested = convertToBaseUnit(normalizedItem.quantity, normalizedItem.unit || 'unit');
    const normalizedDeal = convertToBaseUnit(deal.unit.amount, deal.unit.unit);
    
    if (normalizedRequested.unit === normalizedDeal.unit) {
      const ratio = normalizedRequested.amount / normalizedDeal.amount;
      if (ratio === 1) score += 10;
      else if (ratio <= 2 && ratio >= 0.5) score += 5;
    }
  }
  
  // Recency bonus
  const daysSinceScraped = (Date.now() - deal.scrapedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceScraped < 1) score += 8;
  else if (daysSinceScraped < 3) score += 4;
  
  // Promotion bonus
  if (deal.originalPrice && deal.originalPrice > deal.currentPrice) {
    score += 5;
  }
  
  return Math.min(score, 100);
}

// Main matching function with all fallbacks (Fixed all typing issues)
export async function findBestMatch(normalizedItem: NormalizedItem): Promise<MatchResult> {
  let matchSource: 'text_search' | 'regex' | 'fuzzy' | 'user_correction' = 'text_search';
  let candidates: Deal[] = [];
  
  // Stage 0: Check user corrections first
  const correctedDeal = await checkUserCorrections(normalizedItem);
  if (correctedDeal) {
    candidates = [correctedDeal];
    matchSource = 'user_correction';
  }
  
  // Stage 1: Text search (Fixed MongoDB lean() typing)
  if (candidates.length === 0) {
    const textQuery = {
      $text: { $search: normalizedItem.keywords.join(' ') },
      isActive: true,
      scrapedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    };
    
    const textResults = await DealModel.find(textQuery).limit(20).lean();
    candidates = textResults.map(item => ({
      ...item,
      id: item._id?.toString() || ''
    })) as Deal[];
  }
  
  // Stage 2: Regex fallback (Fixed typing and filtering)
  if (candidates.length < 5) {
    const regexQuery = {
      name: { 
        $regex: normalizedItem.keywords.map(k => `(?=.*${k})`).join(''), 
        $options: 'i' 
      },
      isActive: true,
      scrapedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    };
    
    const regexResults = await DealModel.find(regexQuery).limit(15).lean();
    const regexCandidates = regexResults.map(item => ({
      ...item,
      id: item._id?.toString() || ''
    })) as Deal[];
    
    if (regexCandidates.length > 0) {
      const existingIds = new Set(candidates.map(c => c.id));
      const newCandidates = regexCandidates.filter(c => !existingIds.has(c.id));
      candidates = candidates.concat(newCandidates);
      
      if (candidates.length === regexCandidates.length) {
        matchSource = 'regex';
      }
    }
  }
  
  // Stage 3: Fuzzy search fallback
  if (candidates.length < 3) {
    const fuzzyCandidates = await fuzzySearchDeals(normalizedItem);
    
    if (fuzzyCandidates.length > 0) {
      const existingIds = new Set(candidates.map(c => c.id));
      const newFuzzyCandidates = fuzzyCandidates.filter(c => !existingIds.has(c.id));
      candidates = candidates.concat(newFuzzyCandidates);
      
      if (matchSource === 'text_search' && candidates.length === fuzzyCandidates.length) {
        matchSource = 'fuzzy';
      }
    }
  }
  
  // Score and rank candidates
  const scoredCandidates = candidates.map(deal => ({
    deal,
    score: scoreMatch(deal, normalizedItem, matchSource)
  }))
  .filter(item => item.score > 20)
  .sort((a, b) => b.score - a.score);
  
  if (scoredCandidates.length === 0) {
    return {
      inputText: normalizedItem.originalText,
      requestedQuantity: normalizedItem.quantity,
      requestedUnit: normalizedItem.unit,
      confidence: 0,
      matchSource: 'text_search'
    };
  }
  
  // Calculate quantity scaling for best match (Fixed undefined check)
  const bestMatch = scoredCandidates[0];
  if (!bestMatch) {
    return {
      inputText: normalizedItem.originalText,
      requestedQuantity: normalizedItem.quantity,
      requestedUnit: normalizedItem.unit,
      confidence: 0,
      matchSource: 'text_search'
    };
  }
  
  const quantityReqs = calculateQuantityRequirements(
    normalizedItem.quantity,
    normalizedItem.unit,
    bestMatch.deal.unit
  );
  
  const unitPrice = calculateUnitPrice(bestMatch.deal);
  const totalPrice = bestMatch.deal.currentPrice * quantityReqs.multiplier;
  
  const alternatives = scoredCandidates
    .slice(1, 4)
    .map(item => ({
      dealId: item.deal.id,
      name: item.deal.name,
      price: item.deal.currentPrice,
      confidence: item.score
    }));
  
  return {
    inputText: normalizedItem.originalText,
    requestedQuantity: normalizedItem.quantity,
    requestedUnit: normalizedItem.unit,
    matchedDealId: bestMatch.deal.id,
    matchedName: bestMatch.deal.name,
    unitPrice,
    totalPrice,
    packageSize: bestMatch.deal.unit,
    quantityMultiplier: quantityReqs.multiplier,
    confidence: bestMatch.score,
    matchSource,
    alternatives: alternatives.length > 0 ? alternatives : undefined
  };
}

// Cache management
export function generateCacheKey(items: string[]): string {
  return `basket:${items.sort().join('|')}`;
}

export function getCachedResult(cacheKey: string) {
  return queryCache.get(cacheKey);
}

export function setCachedResult(cacheKey: string, result: any) {
  queryCache.set(cacheKey, result);
}

export function clearCache() {
  queryCache.flushAll();
}

export function getCacheStats() {
  return queryCache.getStats();
}
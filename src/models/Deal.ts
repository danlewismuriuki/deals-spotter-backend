// // src/models/Deal.ts
// export interface Deal {
//     id: string;
//     name: string;
//     store: 'carrefour' | 'quickmart' | 'naivas' | 'tuskys';
//     currentPrice: number;
//     originalPrice?: number;
//     discount?: number;
//     discountType: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
//     validFrom: Date;
//     validUntil?: Date;
//     locations: string[];
//     category?: string;
//     image?: string;
//     description?: string;
//     sourceUrl?: string;
//     scrapedAt: Date;
//     isActive: boolean;
//     dealTags?: string[];
//     // Validation fields (we'll add these later)
//     confidenceScore?: number;
//     redFlags?: string[];
//     lastVerified?: Date;
//   }
  
//   // src/models/PriceHistory.ts
//   export interface PriceHistory {
//     productId: string;
//     productName: string;
//     store: string;
//     price: number;
//     wasPromotional: boolean;
//     recordedAt: Date;
//     location?: string;
//   }
  
//   // src/models/Product.ts
//   export interface Product {
//     id: string;
//     name: string;
//     normalizedName: string; // For matching similar products
//     brand?: string;
//     category?: string;
//     size?: string;
//     unit?: string;
//   }
  
//   // Database connection setup (src/config/database.ts)
//   import mongoose from 'mongoose';
  
//   export const connectDatabase = async () => {
//     try {
//       await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/deals-spotter');
//       console.log('Database connected successfully');
//     } catch (error) {
//       console.error('Database connection error:', error);
//       process.exit(1);
//     }
//   };
  
//   // Mongoose schemas
//   const DealSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     store: { type: String, required: true },
//     currentPrice: { type: Number, required: true },
//     originalPrice: { type: Number },
//     discount: { type: Number },
//     discountType: { type: String, enum: ['percentage', 'fixed_amount', 'buy_x_get_y'] },
//     validFrom: { type: Date, default: Date.now },
//     validUntil: { type: Date },
//     locations: [{ type: String }],
//     category: { type: String },
//     image: { type: String },
//     description: { type: String },
//     sourceUrl: { type: String },
//     scrapedAt: { type: Date, default: Date.now },
//     isActive: { type: Boolean, default: true },
//     confidenceScore: { type: Number, min: 0, max: 1 },
//     redFlags: [{ type: String }],
//     lastVerified: { type: Date, default: Date.now }
//   });
  
//   const PriceHistorySchema = new mongoose.Schema({
//     productId: { type: String, required: true },
//     productName: { type: String, required: true },
//     store: { type: String, required: true },
//     price: { type: Number, required: true },
//     wasPromotional: { type: Boolean, default: false },
//     recordedAt: { type: Date, default: Date.now },
//     location: { type: String }
//   });
  
//   export const DealModel = mongoose.model('Deal', DealSchema);
//   export const PriceHistoryModel = mongoose.model('PriceHistory', PriceHistorySchema);


// src/models/Deal.ts - Enhanced with new fields
import mongoose from 'mongoose';

export interface Deal {
  id: string;
  name: string;
  store: 'carrefour' | 'quickmart' | 'naivas' | 'tuskys';
  currentPrice: number;
  originalPrice?: number;
  discount?: number;
  discountType: 'percentage' | 'fixed_amount' | 'buy_x_get_y';
  validFrom: Date;
  validUntil?: Date;
  locations: string[];
  category?: string;
  image?: string;
  description?: string;
  sourceUrl?: string;
  scrapedAt: Date;
  isActive: boolean;
  dealTags?: string[];
  
  // Enhanced fields for new features
  unit?: {
    amount: number;
    unit: 'kg' | 'g' | 'l' | 'ml' | 'unit' | 'piece';
  };
  unitPrice?: number; // Price per kg/L/unit for comparison
  productId?: string; // For canonical product mapping
  
  // Existing validation fields
  confidenceScore?: number;
  redFlags?: string[];
  lastVerified?: Date;
}

// New: User correction model for learning
export interface UserCorrection {
  id?: string;
  originalQuery: string;
  correctedDealId: string;
  correctedDealName: string;
  confidence: number;
  userId?: string;
  timestamp: Date;
}

// New: Normalized shopping item for matching
export interface NormalizedItem {
  originalText: string;
  cleanText: string;
  quantity?: number;
  unit?: string;
  keywords: string[];
}

// New: Match result with quantity scaling
export interface MatchResult {
  inputText: string;
  requestedQuantity?: number;
  requestedUnit?: string;
  matchedDealId?: string;
  matchedName?: string;
  unitPrice?: number;
  totalPrice?: number;
  packageSize?: { amount: number; unit: string };
  quantityMultiplier?: number;
  confidence: number;
  matchSource: 'text_search' | 'regex' | 'fuzzy' | 'user_correction';
  alternatives?: Array<{
    dealId: string;
    name: string;
    price: number;
    confidence: number;
  }>;
}

// Enhanced Deal Schema
const DealSchema = new mongoose.Schema({
  name: { type: String, required: true },
  store: { type: String, required: true },
  currentPrice: { type: Number, required: true },
  originalPrice: { type: Number },
  discount: { type: Number },
  discountType: { type: String, enum: ['percentage', 'fixed_amount', 'buy_x_get_y'] },
  validFrom: { type: Date, default: Date.now },
  validUntil: { type: Date },
  locations: [{ type: String }],
  category: { type: String },
  image: { type: String },
  description: { type: String },
  sourceUrl: { type: String },
  scrapedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  
  // Enhanced fields
  unit: {
    amount: { type: Number },
    unit: { type: String, enum: ['kg', 'g', 'l', 'ml', 'unit', 'piece'] }
  },
  unitPrice: { type: Number },
  productId: { type: String },
  
  // Validation fields
  confidenceScore: { type: Number, min: 0, max: 1 },
  redFlags: [{ type: String }],
  lastVerified: { type: Date, default: Date.now }
});

// Text index for search functionality
DealSchema.index({ name: 'text', category: 'text', description: 'text' });
DealSchema.index({ store: 1, isActive: 1, scrapedAt: -1 });

// User Correction Schema
const UserCorrectionSchema = new mongoose.Schema({
  originalQuery: { type: String, required: true },
  correctedDealId: { type: String, required: true },
  correctedDealName: { type: String, required: true },
  confidence: { type: Number, required: true },
  userId: { type: String, default: 'anonymous' },
  timestamp: { type: Date, default: Date.now }
});

UserCorrectionSchema.index({ originalQuery: 'text' });
UserCorrectionSchema.index({ correctedDealId: 1 });

// PriceHistory remains the same
export interface PriceHistory {
  productId: string;
  productName: string;
  store: string;
  price: number;
  wasPromotional: boolean;
  recordedAt: Date;
  location?: string;
}

const PriceHistorySchema = new mongoose.Schema({
  productId: { type: String, required: true },
  productName: { type: String, required: true },
  store: { type: String, required: true },
  price: { type: Number, required: true },
  wasPromotional: { type: Boolean, default: false },
  recordedAt: { type: Date, default: Date.now },
  location: { type: String }
});

// Export models
export const DealModel = mongoose.model('Deal', DealSchema);
export const UserCorrectionModel = mongoose.model('UserCorrection', UserCorrectionSchema);
export const PriceHistoryModel = mongoose.model('PriceHistory', PriceHistorySchema);
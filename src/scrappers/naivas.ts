// src/scrapers/naivas.ts
import axios, { AxiosError } from "axios";
import * as cheerio from "cheerio";
import type { Deal } from "../models/Deal.js";

interface ScrapedDeal {
  name: string;
  currentPrice: number;
  originalPrice?: number;
  discount?: number;
  discountType: 'percentage' | 'fixed_amount';
  image?: string;
  link?: string;
  category?: string;
}

export class NaivasScraper {
  private baseUrl = "https://naivas.online";
  
  private userAgents: string[] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0"
  ];

  private getRandomUserAgent(): string {
    const index = Math.floor(Math.random() * this.userAgents.length);
    return this.userAgents[index]!; // Non-null assertion operator
  }

  private getEnhancedHeaders() {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"'
    };
  }

  async scrapeDeals(): Promise<Deal[]> {
    console.log("🛒 Starting Naivas scraping...");
    
    try {
      // Try multiple approaches
      const approaches = [
        () => this.scrapeWithDelay(),
        () => this.scrapeMainPageFirst(),
        () => this.scrapeWithDifferentEndpoints()
      ];

      for (const approach of approaches) {
        try {
          const deals = await approach();
          if (deals.length > 0) {
            console.log(`✅ Successfully scraped ${deals.length} deals from Naivas`);
            return deals;
          }
        } catch (error) {
          console.log(`❌ Approach failed, trying next...`);
          continue;
        }
      }

      console.log("⚠️ All approaches failed, returning empty array");
      return [];

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error("❌ Naivas scraping failed completely:", errorMessage);
      return [];
    }
  }

  private async scrapeWithDelay(): Promise<Deal[]> {
    console.log("🔄 Trying approach 1: With delay and enhanced headers");
    
    // First, visit main page to establish session
    try {
      await axios.get(this.baseUrl, {
        headers: this.getEnhancedHeaders(),
        timeout: 15000,
        maxRedirects: 5
      });
      
      console.log("✅ Main page visited successfully");
      
      // Wait a bit like a human would
      await this.sleep(2000);
      
    } catch (error) {
      console.log("⚠️ Main page visit failed, continuing anyway");
    }

    // Now try to get promotions
    const promotionUrls = [
      `${this.baseUrl}/promos`,
      `${this.baseUrl}/promotions`,
      `${this.baseUrl}/offers`,
      `${this.baseUrl}/deals`,
      `${this.baseUrl}/specials`,
      `${this.baseUrl}/category/promotions`
    ];

    for (const url of promotionUrls) {
      try {
        console.log(`🔍 Trying URL: ${url}`);
        
        const response = await axios.get(url, {
          headers: this.getEnhancedHeaders(),
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: (status) => status < 400 // Accept redirects
        });
        
        if (response.status === 200 && response.data) {
          console.log(`✅ Success! Got ${response.data.length} characters from ${url}`);
          return await this.parseDealsFromHTML(response.data, url);
        }
        
      } catch (error) {
        const statusCode = this.getErrorStatus(error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`❌ Failed ${url}: ${statusCode || errorMessage}`);
        await this.sleep(1000); // Wait between attempts
      }
    }

    throw new Error("No working promotion URLs found");
  }

  private async scrapeMainPageFirst(): Promise<Deal[]> {
    console.log("🔄 Trying approach 2: Main page scraping");
    
    try {
      const response = await axios.get(this.baseUrl, {
        headers: this.getEnhancedHeaders(),
        timeout: 15000
      });

      if (response.status === 200) {
        console.log(`✅ Main page loaded (${response.data.length} chars)`);
        return await this.parseDealsFromHTML(response.data, this.baseUrl);
      }

      throw new Error(`Main page returned status: ${response.status}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Main page scraping failed: ${errorMessage}`);
    }
  }

  private async scrapeWithDifferentEndpoints(): Promise<Deal[]> {
    console.log("🔄 Trying approach 3: API endpoints");
    
    const apiEndpoints = [
      `${this.baseUrl}/api/promotions`,
      `${this.baseUrl}/wp-json/wp/v2/products`,
      `${this.baseUrl}/products.json`,
      `${this.baseUrl}/feed/promotions`
    ];

    for (const endpoint of apiEndpoints) {
      try {
        console.log(`🔍 Trying API: ${endpoint}`);
        
        const response = await axios.get(endpoint, {
          headers: {
            ...this.getEnhancedHeaders(),
            'Accept': 'application/json, text/plain, */*'
          },
          timeout: 10000
        });
        
        if (response.status === 200 && response.data) {
          console.log(`✅ API success: ${endpoint}`);
          return await this.parseAPIResponse(response.data);
        }
        
      } catch (error) {
        const statusCode = this.getErrorStatus(error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`❌ API failed ${endpoint}: ${statusCode || errorMessage}`);
      }
    }

    throw new Error("No working API endpoints found");
  }

  private getErrorStatus(error: unknown): number | null {
    if (axios.isAxiosError(error) && error.response) {
      return error.response.status;
    }
    return null;
  }

  private async parseDealsFromHTML(html: string, sourceUrl: string): Promise<Deal[]> {
    console.log("📊 Parsing HTML for deals...");
    const $ = cheerio.load(html);
    const deals: Deal[] = [];

    // Debug info
    console.log(`- Page title: ${$('title').text()}`);
    console.log(`- Page contains 'promo': ${html.toLowerCase().includes('promo')}`);
    console.log(`- Page contains 'offer': ${html.toLowerCase().includes('offer')}`);
    console.log(`- Page contains 'deal': ${html.toLowerCase().includes('deal')}`);
    console.log(`- Page contains 'KSh': ${html.includes('KSh')}`);

    // Try multiple selectors for products
    const productSelectors = [
      '.product-item', '.product-card', '.product', '.item',
      '.woocommerce-loop-product__title', '.product-title',
      '[class*="product"]', '[class*="item"]', '[class*="deal"]',
      '.promo-item', '.offer-item', '.special-item'
    ];

    let foundProducts = false;

    for (const selector of productSelectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`🎯 Found ${elements.length} elements with selector: ${selector}`);
        foundProducts = true;

        elements.each((index, element) => {
          const deal = this.extractDealFromElement($, element, sourceUrl);
          if (deal && this.isValidDeal(deal)) {
            deals.push(deal);
          }
        });

        if (deals.length > 0) break; // Stop at first working selector
      }
    }

    if (!foundProducts) {
      console.log("🔍 No standard product selectors worked, trying text analysis...");
      return this.fallbackTextAnalysis($, sourceUrl);
    }

    return deals;
  }

  private async parseAPIResponse(data: any): Promise<Deal[]> {
    console.log("📊 Parsing API response...");
    const deals: Deal[] = [];

    try {
      // Handle different API response formats
      let products = [];

      if (Array.isArray(data)) {
        products = data;
      } else if (data.products) {
        products = data.products;
      } else if (data.data) {
        products = data.data;
      } else if (data.items) {
        products = data.items;
      }

      for (const item of products.slice(0, 20)) { // Limit to first 20
        const deal = this.parseAPIProduct(item);
        if (deal && this.isValidDeal(deal)) {
          deals.push(deal);
        }
      }

    } catch (error) {
      console.error("API parsing error:", error);
    }

    return deals;
  }

  private parseAPIProduct(item: any): Deal | null {
    try {
      const name = item.name || item.title || item.product_name;
      if (!name) return null;

      const currentPrice = this.parsePrice(item.price || item.current_price || item.sale_price);
      if (!currentPrice) return null;

      const originalPrice = this.parsePrice(item.regular_price || item.original_price);
      
      let discount = 0;
      if (originalPrice && currentPrice < originalPrice) {
        discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
      }

      return {
        id: this.generateId(name, 'naivas'),
        name: name.trim(),
        store: 'naivas' as any,
        currentPrice,
        originalPrice: originalPrice || currentPrice, // Ensure it's never undefined
        discount,
        discountType: 'percentage' as const,
        validFrom: new Date(),
        validUntil: this.getDefaultExpiry(),
        locations: ['nairobi'],
        category: item.category || item.product_category || 'general',
        image: item.image || item.featured_image || undefined,
        sourceUrl: item.url || item.permalink,
        scrapedAt: new Date(),
        isActive: true
      };

    } catch (error) {
      console.error("Error parsing API product:", error);
      return null;
    }
  }

  private extractDealFromElement($: any, element: any, sourceUrl: string): Deal | null {
    try {
      const $el = $(element);

      // Extract name
      const name = this.extractText($el, [
        '.product-title', '.product-name', '.title', '.name',
        'h1', 'h2', 'h3', 'h4', 'h5', 'a',
        '[class*="title"]', '[class*="name"]'
      ]);

      if (!name || name.length < 3) return null;

      // Extract prices
      const priceData = this.extractPrices($el);
      if (!priceData.currentPrice) return null;

      return {
        id: this.generateId(name, 'naivas'),
        name: name.trim(),
        store: 'naivas' as any,
        currentPrice: priceData.currentPrice,
        originalPrice: priceData.originalPrice || priceData.currentPrice, // Ensure it's never undefined
        discount: priceData.discount || 0, // Ensure it's never undefined
        discountType: priceData.discountType,
        validFrom: new Date(),
        validUntil: this.getDefaultExpiry(),
        locations: ['nairobi'],
        category: this.extractCategory($el),
        image: this.extractImage($el),
        sourceUrl: this.extractLink($el) || sourceUrl,
        scrapedAt: new Date(),
        isActive: true
      };

    } catch (error) {
      console.error("Error extracting deal:", error);
      return null;
    }
  }

  private fallbackTextAnalysis($: any, sourceUrl: string): Deal[] {
    console.log("🔍 Performing fallback text analysis...");
    const deals: Deal[] = [];

    // Look for price patterns in the text
    const priceRegex = /KSh?\s*(\d{1,3}(?:,\d{3})*|\d+)/gi;
    const textContent = $('body').text();
    const matches = textContent.match(priceRegex);

    if (matches && matches.length > 0) {
      console.log(`💰 Found ${matches.length} price mentions`);
      console.log(`Sample prices: ${matches.slice(0, 5).join(', ')}`);
    }

    // This is a basic implementation - you'd want to enhance this
    // to actually extract meaningful product information
    
    return deals;
  }

  // Helper methods
  private extractText($el: any, selectors: string[]): string | null {
    for (const selector of selectors) {
      const text = $el.find(selector).first().text().trim();
      if (text && text.length > 0) return text;
    }
    return $el.text().trim() || null;
  }

  private extractPrices($el: any) {
    const priceSelectors = [
      '.price', '.current-price', '.sale-price', '.amount',
      '[class*="price"]', '[data-price]'
    ];
    
    const originalPriceSelectors = [
      '.original-price', '.old-price', '.was-price', '.regular-price',
      '[class*="original"]', '[class*="old"]', '[class*="regular"]'
    ];

    let currentPrice = 0;
    let originalPrice: number | undefined;

    // Extract current price
    for (const selector of priceSelectors) {
      const priceText = $el.find(selector).first().text();
      const price = this.parsePrice(priceText);
      if (price > 0) {
        currentPrice = price;
        break;
      }
    }

    // Extract original price
    for (const selector of originalPriceSelectors) {
      const priceText = $el.find(selector).first().text();
      const price = this.parsePrice(priceText);
      if (price > 0 && price > currentPrice) {
        originalPrice = price;
        break;
      }
    }

    // Calculate discount
    let discount: number | undefined;
    let discountType: 'percentage' | 'fixed_amount' = 'percentage';

    if (originalPrice && currentPrice && originalPrice > currentPrice) {
      discount = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    }

    return { currentPrice, originalPrice, discount, discountType };
  }

  private parsePrice(priceText: string): number {
    if (!priceText) return 0;
    
    const cleanText = priceText.replace(/[^\d.,]/g, '');
    const price = parseFloat(cleanText.replace(/,/g, ''));
    
    return isNaN(price) ? 0 : price;
  }

  private extractImage($el: any): string | undefined {
    const img = $el.find('img').first();
    if (img.length) {
      let src = img.attr('src') || img.attr('data-src') || img.attr('data-lazy');
      if (src && !src.startsWith('http')) {
        src = `${this.baseUrl}${src}`;
      }
      return src;
    }
    return undefined;
  }

  private extractLink($el: any): string | undefined {
    const link = $el.find('a').first().attr('href') || $el.closest('a').attr('href');
    if (link && !link.startsWith('http')) {
      return `${this.baseUrl}${link}`;
    }
    return link;
  }

  private extractCategory($el: any): string {
    const categorySelectors = [
      '.category', '.product-category', '[class*="category"]', '.breadcrumb'
    ];

    for (const selector of categorySelectors) {
      const category = $el.find(selector).first().text().trim();
      if (category) return category;
    }

    return 'general'; // Always return a string, never undefined
  }

  private generateId(name: string, store: string): string {
    const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `${store}_${normalized}_${Date.now()}`;
  }

  private getDefaultExpiry(): Date {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7);
    return expiry;
  }

  private isValidDeal(deal: Deal): boolean {
    if (!deal.name || deal.name.length < 3) return false;
    if (!deal.currentPrice || deal.currentPrice <= 0) return false;
    if (deal.originalPrice && deal.originalPrice <= deal.currentPrice) return false;
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export function for use in routes
export const scrapeNaivas = async (): Promise<Deal[]> => {
  const scraper = new NaivasScraper();
  return await scraper.scrapeDeals();
};
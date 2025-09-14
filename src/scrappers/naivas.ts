import puppeteer from 'puppeteer';
import type { Deal } from '../models/Deal.js';

export class AdvancedNaivasScraper {
    private readonly BASE_URL = 'https://naivas.online';
    
    // Updated based on your structure with fallback categories
    // private readonly DEAL_CATEGORIES = [
    //     '/food-cupboard-deals',
    //     '/fresh-deals', 
    //     '/great-value',
    //     '/electronics-deals',
    //     '/beauty-cosmetics-deals',
    //     '/beverage-deals',
    //     '/cleaning-deals',
    //     '/snacks-deals',
    //     '/baby-kids-deals',
    //     '/stationery-deals',
    //     '/liqour-deals'
    // ];

    private readonly DEAL_CATEGORIES = [
        '/promos',              // ← Main deals page
        '/food-cupboard',       // ← Real URL
        '/fresh-food',          // ← Real URL
        '/electronics',         // ← Real URL
        '/beauty-cosmetics',    // ← This one might be correct
        '/beverage',            // ← Real URL (not 'beverage-deals')
        '/cleaning',            // ← Real URL
        '/baby-kids',           // ← Real URL
        '/naivas-liqour',        // ← Real URL

        // new deals endpoints
        '/food-cupboard-deals',
        '/fresh-deals',
        '/great-value',
        '/liqour-deals',
        '/electronics-deals',
        '/beauty-cosmetics-deals',
        '/beverage-deals',
        '/cleaning-deals',
        '/snacks-deals',
        '/baby-kids-deals',
        '/stationery-deals',
        '/liqour-deals',
        '/dairy-deals'
    ];

    // Fallback regular product categories
    private readonly PRODUCT_CATEGORIES = [
        '/food-cupboard',
        '/fresh-produce', 
        '/electronics',
        '/beauty-cosmetics',
        '/beverages',
        '/cleaning-household',
        '/snacks',
        '/baby-kids',
        '/stationery',
        '/liquor'
    ];

    private getRandomUserAgent(): string {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0'
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)]!;
    }

    private generateId(name: string, store: string): string {
        const cleanName = name.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hash = cleanName.split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
        return `${store}-${Math.abs(hash)}`;
    }

    private getDefaultExpiry(): Date {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        return expiry;
    }

    private async setupBrowser() {
        console.log("🚀 Launching Puppeteer browser...");
        
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-blink-features=AutomationControlled',
                '--disable-extensions',
                '--no-default-browser-check',
                '--disable-plugins-discovery',
                '--disable-preconnect',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding'
            ]
        });

        const page = await browser.newPage();
        
        // Enhanced stealth setup matching your style
        await page.setViewport({ 
            width: 1366 + Math.floor(Math.random() * 100), 
            height: 768 + Math.floor(Math.random() * 100) 
        });
        await page.setUserAgent(this.getRandomUserAgent());
        
        // Block only images to speed up, keep CSS for proper rendering
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Enhanced headers matching your style
        await page.setExtraHTTPHeaders({
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
            'Cache-Control': 'max-age=0'
        });

        // Remove webdriver property matching your approach
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        return { browser, page };
    }

    private async humanLikeDelay(min = 1000, max = 3000) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Method to discover current categories by exploring navigation
    public async discoverCategoryUrls(): Promise<string[]> {
        const { browser, page } = await this.setupBrowser();
        
        try {
            console.log("🔍 Discovering category URLs from homepage...");
            
            const success = await this.navigateWithRetry(page, this.BASE_URL);
            if (!success) {
                console.log("❌ Could not access homepage for discovery");
                return this.DEAL_CATEGORIES; // Return fallback
            }
            
            const categoryUrls = await page.evaluate(() => {
                const urls: string[] = [];
                
                // Look for deal/promo links in navigation and content
                const links = document.querySelectorAll('a[href*="deals"], a[href*="promos"], a[href*="offer"]');
                
                links.forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && !urls.includes(href)) {
                        // Convert relative URLs to paths only
                        if (href.startsWith('/')) {
                            urls.push(href);
                        } else if (href.includes('naivas.online')) {
                            try {
                                urls.push(new URL(href).pathname);
                            } catch (e) {
                                // Skip invalid URLs
                            }
                        }
                    }
                });

                // Also look for category navigation
                const categoryLinks = document.querySelectorAll('nav a, .category a, .menu a');
                categoryLinks.forEach(link => {
                    const href = link.getAttribute('href');
                    const text = link.textContent?.toLowerCase() || '';
                    
                    if (href && (text.includes('deal') || text.includes('promo') || text.includes('offer'))) {
                        if (href.startsWith('/') && !urls.includes(href)) {
                            urls.push(href);
                        }
                    }
                });

                return urls;
            });

            console.log(`🎯 Discovered ${categoryUrls.length} category URLs:`, categoryUrls);
            return categoryUrls.length > 0 ? categoryUrls : this.DEAL_CATEGORIES;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log("❌ Error discovering categories:", errorMessage);
            return this.DEAL_CATEGORIES; // Fallback to predefined categories
        } finally {
            await browser.close();
        }
    }

    private async scrapeProductsFromPage(page: any, category: string): Promise<Deal[]> {
        console.log(`📦 Extracting products from ${category}...`);
        
        await this.humanLikeDelay(2000, 4000);
        
        // Wait for product grid to load with multiple selectors
        try {
            await Promise.race([
                page.waitForSelector('.grid', { timeout: 15000 }),
                page.waitForSelector('[class*="product"]', { timeout: 15000 }),
                page.waitForSelector('[wire\\:id]', { timeout: 15000 })
            ]);
        } catch (error) {
            console.log(`⚠️ Product grid not found on ${category}, continuing anyway...`);
        }

        // Simulate human scrolling matching your approach
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 4);
        });
        await this.humanLikeDelay(500, 1000);
        
        await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await this.humanLikeDelay(500, 1000);

        // Try to handle infinite scroll/load more
        await this.handleInfiniteScroll(page);

        const products = await page.evaluate((categoryName: string) => {
            // Multiple selector strategies - enhanced version
            const selectors = [
                'div[wire\\:snapshot*="product-card-component"]', // Livewire components
                '.border.border-naivas-bg.p-3.rounded-xl', // Your original selector
                '[wire\\:id*="product-card"]',
                '.product-card',
                '[class*="product-item"]',
                '.grid > div', // Grid children
                '[data-product]',
                'article' // Semantic products
            ];
            
            let productCards: NodeListOf<Element> | null = null;
            let usedSelector = '';
            
            for (const selector of selectors) {
                try {
                    const cards = document.querySelectorAll(selector);
                    if (cards.length > 0) {
                        productCards = cards;
                        usedSelector = selector;
                        console.log(`Found ${cards.length} products using selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }

            if (!productCards || productCards.length === 0) {
                console.log('No product cards found with any selector');
                return [];
            }

            const productsData: any[] = [];

            productCards.forEach((card, index) => {
                // if (index >= 100) return; // Limit per category
                if (index >= 1000) return; // Much higher limit for full scraping
                
                try {
                    // Enhanced name extraction with multiple fallbacks
                    const nameSelectors = [
                        '.line-clamp-2.text-ellipsis', // Updated selector
                        '.text-naivas-gray-dark.text-xs.lg\\:text-sm .line-clamp-2',
                        '.text-naivas-gray-dark a',
                        'h3',
                        'h4',
                        '.product-name',
                        '[title]',
                        'a[href*="/product"]',
                        '.product-title',
                        '.font-medium',
                        '.text-sm'
                    ];
                    
                    let productName = '';
                    for (const selector of nameSelectors) {
                        try {
                            const element = card.querySelector(selector);
                            if (element) {
                                productName = element.textContent?.trim() || element.getAttribute('title') || '';
                                if (productName && productName.length > 2) break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    // Enhanced link extraction
                    const linkSelectors = [
                        'a[href*="naivas.online/"]',
                        'a[href^="/product"]',
                        'a[href^="/"]',
                        'a'
                    ];
                    
                    let productUrl = '';
                    for (const selector of linkSelectors) {
                        try {
                            const element = card.querySelector(selector);
                            if (element) {
                                productUrl = element.getAttribute('href') || '';
                                if (productUrl) {
                                    if (!productUrl.startsWith('http')) {
                                        productUrl = 'https://naivas.online' + productUrl;
                                    }
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    // Enhanced price extraction
                    const priceSelectors = [
                        '.font-bold.text-naivas-green', // Main price selector
                        '.text-naivas-green.font-bold',
                        '.product-price .font-bold',
                        '.text-naivas-green',
                        '.price',
                        '[class*="price"]',
                        '.font-bold'
                    ];
                    
                    let currentPrice = 0;
                    for (const selector of priceSelectors) {
                        try {
                            const element = card.querySelector(selector);
                            if (element) {
                                const priceText = element.textContent?.trim() || '';
                                const price = parseFloat(priceText.replace(/[^\d.]/g, ''));
                                if (price > 0) {
                                    currentPrice = price;
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    // Enhanced original price extraction
                    const originalPriceSelectors = [
                        '.text-red-600.text-xs.line-through',
                        '.line-through',
                        '[class*="strike"]',
                        '[class*="original"]',
                        '.text-red-600'
                    ];
                    
                    let originalPrice = currentPrice;
                    for (const selector of originalPriceSelectors) {
                        try {
                            const element = card.querySelector(selector);
                            if (element) {
                                const priceText = element.textContent?.trim() || '';
                                const price = parseFloat(priceText.replace(/[^\d.]/g, ''));
                                if (price > 0 && price > currentPrice) {
                                    originalPrice = price;
                                    break;
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    // Enhanced discount extraction
                    const discountSelectors = [
                        '.bg-naivas-orange\\/10.text-naivas-orange',
                        '.pill',
                        '[class*="off"]',
                        '[class*="discount"]',
                        '[class*="save"]',
                        '[id*="pill"]'
                    ];
                    
                    let discountPercent = 0;
                    for (const selector of discountSelectors) {
                        try {
                            const element = card.querySelector(selector);
                            if (element) {
                                const discountText = element.textContent?.trim() || '';
                                if (discountText) {
                                    const percentMatch = discountText.match(/(\d+)%/);
                                    if (percentMatch && percentMatch[1]) {
                                        discountPercent = parseInt(percentMatch[1]);
                                        break;
                                    }
                                    // Also look for "Save" amounts
                                    if (discountText.toLowerCase().includes('save')) {
                                        // Calculate from prices if available
                                        if (originalPrice > currentPrice) {
                                            discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                    
                    // Calculate discount if not found in badges
                    if (discountPercent === 0 && originalPrice > currentPrice && originalPrice > 0) {
                        discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
                    }

                    // Enhanced image extraction
                    const imageSelectors = [
                        'img[src*="cloudfront"]',
                        'img[src*="naivas"]',
                        'img[src*="cdn"]',
                        'img[data-src]',
                        'img'
                    ];
                    
                    let imageUrl = '';
                    for (const selector of imageSelectors) {
                        try {
                            const element = card.querySelector(selector);
                            if (element) {
                                imageUrl = element.getAttribute('src') || element.getAttribute('data-src') || '';
                                if (imageUrl && imageUrl !== '#') break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    // Extract deal badges
                    const dealBadges: string[] = [];
                    const pillElements = card.querySelectorAll('.pill, [id*="pill"], .badge');
                    pillElements.forEach(pill => {
                        const badgeText = pill.textContent?.trim();
                        if (badgeText && badgeText.length > 0) dealBadges.push(badgeText);
                    });

                    // Only add products with valid data - stricter validation
                    if (productName && productName.length > 2 && currentPrice > 0) {
                        productsData.push({
                            name: productName,
                            url: productUrl,
                            currentPrice,
                            originalPrice,
                            discount: discountPercent,
                            image: imageUrl,
                            category: categoryName,
                            badges: dealBadges,
                            hasDiscount: originalPrice > currentPrice,
                            selector: usedSelector // For debugging
                        });
                    }
                } catch (error) {
                    console.log(`Error extracting product ${index}:`, error);
                }
            });

            return productsData;
        }, category);

        console.log(`✅ Found ${products.length} products in ${category}`);
        return this.formatDeals(products);
    }

    // private async handleInfiniteScroll(page: any): Promise<void> {
    //     try {
    //         // Scroll to trigger lazy loading
    //         await page.evaluate(() => {
    //             window.scrollTo(0, document.body.scrollHeight);
    //         });
    //         await this.humanLikeDelay(2000, 3000);

    //         // Look for "Load More" buttons with multiple selectors
    //         const loadMoreSelectors = [
    //             'button[wire\\:click*="loadMore"]',
    //             'button[wire\\:click*="load"]',
    //             '.load-more',
    //             '[class*="load-more"]',
    //             'button:contains("Load More")',
    //             'button:contains("Show More")',
    //             '[onclick*="load"]'
    //         ];

    //         for (const selector of loadMoreSelectors) {
    //             try {
    //                 const button = await page.$(selector);
    //                 if (button) {
    //                     console.log(`🔄 Found Load More button with selector: ${selector}`);
    //                     await button.click();
    //                     await this.humanLikeDelay(3000, 5000);
    //                     break;
    //                 }
    //             } catch (e) {
    //                 continue;
    //             }
    //         }
    //     } catch (error: unknown) {
    //         const errorMessage = error instanceof Error ? error.message : String(error);
    //         console.log("⚠️ Error handling infinite scroll:", errorMessage);
    //     }
    // }


    private async handleInfiniteScroll(page: any): Promise<void> {
        try {
            console.log("🔄 Starting automatic infinite scroll (no buttons)...");
            
            let previousProductCount = 0;
            let stableCount = 0;
            const maxScrollAttempts = 15;
            
            for (let attempt = 0; attempt < maxScrollAttempts; attempt++) {
                // Count products before scrolling
                const currentProducts = await page.evaluate(() => {
                    return document.querySelectorAll('.border.border-naivas-bg.p-3.rounded-xl').length;
                });
                
                console.log(`📊 Scroll attempt ${attempt + 1}: ${currentProducts} products loaded`);
                
                // Scroll to very bottom to trigger loading
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                // Wait a bit for scroll to register
                await this.humanLikeDelay(1500, 2500);
                
                // Look for loading spinner/indicator
                const hasLoader = await page.evaluate(() => {
                    // Check for various loading indicators
                    const loaders = document.querySelectorAll(
                        '.loading, .spinner, [class*="loading"], [class*="spinner"], ' +
                        'svg[class*="animate"], [role="status"], .animate-spin, ' +
                        '[class*="rotate"], [class*="pulse"]'
                    );
                    return loaders.length > 0;
                });
                
                if (hasLoader) {
                    console.log("⏳ Loading spinner detected - waiting for products...");
                    await this.humanLikeDelay(4000, 6000);
                } else {
                    // No spinner visible, wait shorter time
                    await this.humanLikeDelay(2000, 3000);
                }
                
                // Count products after waiting
                const newProductCount = await page.evaluate(() => {
                    return document.querySelectorAll('.border.border-naivas-bg.p-3.rounded-xl').length;
                });
                
                const gained = newProductCount - currentProducts;
                console.log(`📈 After scroll: ${newProductCount} products (gained ${gained})`);
                
                if (newProductCount <= previousProductCount) {
                    stableCount++;
                    console.log(`🔄 No new products loaded (${stableCount}/3 stable attempts)`);
                    
                    if (stableCount >= 3) {
                        console.log("✅ No more products loading - infinite scroll complete");
                        break;
                    }
                } else {
                    stableCount = 0; // Reset if we got new products
                }
                
                previousProductCount = newProductCount;
                
                // Longer delay between scroll attempts
                await this.humanLikeDelay(2000, 4000);
            }
            
            const finalCount = await page.evaluate(() => {
                return document.querySelectorAll('.border.border-naivas-bg.p-3.rounded-xl').length;
            });
            
            console.log(`🎉 Infinite scroll complete: ${finalCount} total products loaded`);
            
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log("⚠️ Error in infinite scroll:", errorMessage);
        }
    }

    private formatDeals(products: any[]): Deal[] {
        return products.map(product => ({
            id: this.generateId(product.name, 'naivas'),
            name: product.name,
            store: 'naivas' as any,
            currentPrice: product.currentPrice,
            originalPrice: product.originalPrice,
            discount: product.discount,
            discountType: 'percentage' as const,
            validFrom: new Date(),
            validUntil: this.getDefaultExpiry(),
            locations: ['nairobi'],
            category: product.category.replace('/', '').replace('-deals', '') || 'general',
            image: product.image,
            sourceUrl: product.url,
            scrapedAt: new Date(),
            isActive: true,
            dealTags: product.badges || []
        }));
    }

    private async navigateWithRetry(page: any, url: string, maxRetries = 3): Promise<boolean> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🔄 Attempt ${attempt} - Loading ${url}`);
                
                const response = await page.goto(url, { 
                    waitUntil: ['networkidle0', 'domcontentloaded'],
                    timeout: 45000,
                    referer: this.BASE_URL
                });

                if (response?.status() === 200) {
                    await this.humanLikeDelay(3000, 5000);
                    return true;
                } else if (response?.status() === 403) {
                    console.log(`🚫 403 Forbidden for ${url}`);
                    return false;
                }
                
                console.log(`❌ Status ${response?.status()} for ${url}`);
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log(`❌ Attempt ${attempt} failed for ${url}: ${errorMessage}`);
                if (attempt < maxRetries) {
                    const delay = 5000 * attempt + Math.random() * 2000;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        return false;
    }

    private async scrapeCategory(page: any, category: string): Promise<Deal[]> {
        const fullUrl = `${this.BASE_URL}${category}`;
        
        const success = await this.navigateWithRetry(page, fullUrl);
        if (!success) {
            console.log(`💥 Failed to load ${category} after all retries`);
            return [];
        }

        // Check for access blocks matching your approach
        // const pageContent = await page.content();
        // if (pageContent.includes('403') || pageContent.includes('Access Denied') || 
        //     pageContent.includes('blocked') || pageContent.includes('Forbidden')) {
        //     console.log(`🚫 Access blocked for ${category}`);
        //     return [];
        // }


        const response = await page.goto(fullUrl, { 
            waitUntil: ['networkidle0', 'domcontentloaded'],
            timeout: 45000,
            referer: this.BASE_URL
        });


        if (!response || response.status() !== 200) {
            console.log(`💥 HTTP error ${response?.status()} for ${category}`);
            return [];
        }

        // Only check for actual blocking pages, not content that mentions blocking
        const title = await page.title();
        if (title.toLowerCase().includes('403') || title.toLowerCase().includes('access denied')) {
            console.log(`🚫 Access blocked for ${category}`);
            return [];
        }

        return await this.scrapeProductsFromPage(page, category);
    }

    private async scrapeHomepage(page: any): Promise<Deal[]> {
        console.log("🏠 Trying homepage for products...");
        
        const success = await this.navigateWithRetry(page, this.BASE_URL);
        if (!success) {
            return [];
        }

        return await this.scrapeProductsFromPage(page, 'homepage');
    }

    public async scrapeDeals(useDiscoveredCategories: boolean = false): Promise<Deal[]> {
        const { browser, page } = await this.setupBrowser();
        const allDeals: Deal[] = [];

        try {
            // Test homepage accessibility first
            console.log("🏠 Testing homepage accessibility...");
            const success = await this.navigateWithRetry(page, this.BASE_URL);
            if (!success) {
                throw new Error("Cannot access Naivas homepage - possible IP block or site down");
            }

            console.log("✅ Homepage accessible, proceeding with category scraping...");

            // Get categories to scrape
            let categoriesToScrape = this.DEAL_CATEGORIES;
            if (useDiscoveredCategories) {
                console.log("🔍 Discovering categories...");
                try {
                    const discoveredCategories = await this.discoverCategoryUrls();
                    if (discoveredCategories.length > 0) {
                        categoriesToScrape = [...new Set([...discoveredCategories, ...this.DEAL_CATEGORIES])];
                        console.log(`📋 Using ${categoriesToScrape.length} total categories (discovered + predefined)`);
                    }
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.log("⚠️ Category discovery failed, using predefined:", errorMessage);
                }
            }

            // Try homepage first
            try {
                const homepageDeals = await this.scrapeHomepage(page);
                if (homepageDeals.length > 0) {
                    allDeals.push(...homepageDeals);
                    console.log(`📦 Found ${homepageDeals.length} deals on homepage`);
                }
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.log("⚠️ Homepage scraping failed:", errorMessage);
            }

            // Try deal categories first (limited to avoid blocking)
            console.log("🔍 Trying deal categories...");
            let successfulCategories = 0;
            
            for (const category of categoriesToScrape.slice(0, 3)) { // Try first 3
                try {
                    const categoryDeals = await this.scrapeCategory(page, category);
                    if (categoryDeals.length > 0) {
                        allDeals.push(...categoryDeals);
                        successfulCategories++;
                        console.log(`✅ Successfully scraped ${categoryDeals.length} deals from ${category}`);
                    }
                    
                    await this.humanLikeDelay(3000, 6000); // Longer delays between categories
                } catch (error: unknown) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.log(`⚠️ Error scraping ${category}: ${errorMessage}`);
                    continue;
                }
            }

            // If deal categories fail, try regular product categories
            if (successfulCategories === 0 && allDeals.length === 0) {
                console.log("🔄 Deal categories blocked/empty, trying regular product pages...");
                
                for (const category of this.PRODUCT_CATEGORIES.slice(0, 2)) { // Try first 2
                    try {
                        const categoryDeals = await this.scrapeCategory(page, category);
                        if (categoryDeals.length > 0) {
                            allDeals.push(...categoryDeals);
                            console.log(`✅ Successfully scraped ${categoryDeals.length} deals from ${category}`);
                        }
                        
                        await this.humanLikeDelay(4000, 7000); // Even longer delays
                    } catch (error: unknown) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        console.log(`⚠️ Error scraping ${category}: ${errorMessage}`);
                        continue;
                    }
                }
            }

            console.log(`🎉 Successfully scraped ${allDeals.length} total deals from Naivas!`);
            
            // Remove duplicates based on product name and price
            const uniqueDeals = allDeals.filter((deal, index, arr) => 
                arr.findIndex(d => d.name === deal.name && d.currentPrice === deal.currentPrice) === index
            );

            console.log(`🧹 Removed ${allDeals.length - uniqueDeals.length} duplicates`);
            return uniqueDeals;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("💥 Scraping failed:", errorMessage);
            throw error;
        } finally {
            await browser.close();
            console.log("🔐 Browser closed");
        }
    }

    // Test method for single category matching your style
    public async testCategory(category: string): Promise<Deal[]> {
        const { browser, page } = await this.setupBrowser();
        
        try {
            console.log(`🧪 Testing category: ${category}`);
            const deals = await this.scrapeCategory(page, category);
            console.log(`📊 Test results: ${deals.length} deals found`);
            
            // Log sample deals for debugging
            if (deals.length > 0) {
                console.log("🔍 Sample deals:");
                deals.slice(0, 3).forEach(deal => {
                    console.log(`- ${deal.name}: KES ${deal.currentPrice} (${deal.discount}% off)`);
                });
            }
            
            return deals;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log("❌ Test failed:", errorMessage);
            throw error;
        } finally {
            await browser.close();
        }
    }

    // Get page source for manual debugging
    public async getPageSource(url: string): Promise<string> {
        const { browser, page } = await this.setupBrowser();
        
        try {
            const fullUrl = url.startsWith('http') ? url : `${this.BASE_URL}${url}`;
            const success = await this.navigateWithRetry(page, fullUrl);
            if (!success) {
                throw new Error(`Could not access ${fullUrl}`);
            }
            return await page.content();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log("❌ Error getting page source:", errorMessage);
            throw error;
        } finally {
            await browser.close();
        }
    }

    // Method to scrape specific product details matching your style
    public async scrapeProductDetails(productUrl: string): Promise<any> {
        const { browser, page } = await this.setupBrowser();

        try {
            const success = await this.navigateWithRetry(page, productUrl);
            if (!success) {
                throw new Error(`Cannot access product page: ${productUrl}`);
            }

            const productDetails = await page.evaluate(() => {
                // Extract detailed product information
                const name = document.querySelector('.text-xl')?.textContent?.trim();
                const price = document.querySelector('.product-price .font-bold.text-naivas-green')?.textContent?.trim();
                const stock = document.querySelector('.text-naivas-orange')?.textContent?.trim();
                const description = document.querySelector('.short-description p')?.textContent?.trim();
                const sku = document.querySelector('span:contains("SKU") + div span')?.textContent?.trim();
                const brand = document.querySelector('a[href*="brand="]')?.textContent?.trim();
                
                // Extract all images
                const images: string[] = [];
                document.querySelectorAll('img[src*="cloudfront"]').forEach(img => {
                    const src = img.getAttribute('src');
                    if (src) images.push(src);
                });

                return {
                    name,
                    price,
                    stock,
                    description,
                    sku,
                    brand,
                    images
                };
            });

            return productDetails;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.log("❌ Error scraping product details:", errorMessage);
            throw error;
        } finally {
            await browser.close();
        }
    }
}

// Usage examples matching your original exports:
export async function scrapeNaivasDeals(): Promise<Deal[]> {
    const scraper = new AdvancedNaivasScraper();
    return await scraper.scrapeDeals();
}

export async function testNaivasCategory(category: string): Promise<Deal[]> {
    const scraper = new AdvancedNaivasScraper();
    return await scraper.testCategory(category);
}

export async function discoverNaivasCategories(): Promise<string[]> {
    const scraper = new AdvancedNaivasScraper();
    return await scraper.discoverCategoryUrls();
}

export async function getNaivasPageSource(url: string): Promise<string> {
    const scraper = new AdvancedNaivasScraper();
    return await scraper.getPageSource(url);
}

// Export for use in your existing system
export { AdvancedNaivasScraper as NaivasScraper };
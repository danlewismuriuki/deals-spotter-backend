// src/scrapers/carrefour.ts
// import axios from "axios";
// import * as cheerio from "cheerio";

// export const scrapeCarrefour = async () => {
//     try {
//       const url = "https://www.carrefourkenya.com/promotions";
//       const { data } = await axios.get(url, {
//         headers: {
//           'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
//           'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
//           'Accept-Language': 'en-US,en;q=0.5',
//           'Accept-Encoding': 'gzip, deflate',
//           'Connection': 'keep-alive',
//         }
//       });
      
//       const $ = cheerio.load(data);
//       const deals: any[] = [];
      
//       // Rest of your code...
      
//       return deals;
//     } catch (error) {
//       console.error("Carrefour scraping error:", error);
//       throw new Error("Failed to fetch Carrefour deals");
//     }
//   };



// src/scrapers/carrefour.ts
import axios from "axios";
import * as cheerio from "cheerio";

export const scrapeCarrefour = async () => {
  try {
    const url = "https://naivas.online/promos";
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      }
    });
    
    const $ = cheerio.load(data);
    
    // Debug: Let's see what we actually got
    console.log("Page title:", $('title').text());
    console.log("Page contains 'promotion':", data.includes('promotion'));
    console.log("Page contains 'product':", data.includes('product'));
    console.log("First 500 characters:", data.substring(0, 500));
    
    // Look for common class patterns
    console.log("Elements with 'product' in class:", $('[class*="product"]').length);
    console.log("Elements with 'item' in class:", $('[class*="item"]').length);
    console.log("Elements with 'card' in class:", $('[class*="card"]').length);
    
    const deals: any[] = [];
    
    // Try different selectors
    $(".product-card, .item, .product, [class*='product'], [class*='item']").each((_, el) => {
      const $el = $(el);
      console.log("Found element classes:", $el.attr('class'));
      console.log("Element HTML:", $el.html()?.substring(0, 200));
    });
    
    return deals;
  } catch (error) {
    console.error("Carrefour scraping error:", error);
    throw new Error("Failed to fetch Carrefour deals");
  }
};
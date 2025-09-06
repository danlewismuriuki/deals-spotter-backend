// src/scrapers/carrefour.ts
import axios from "axios";
import * as cheerio from "cheerio";

export const scrapeCarrefour = async () => {
  const url = "https://www.carrefourkenya.com/promotions";
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const deals: any[] = [];

  $(".product-card").each((_, el) => {
    const name = $(el).find(".product-title").text().trim();
    const price = $(el).find(".product-price").text().trim();
    const oldPrice = $(el).find(".old-price").text().trim();
    const link = $(el).find("a").attr("href");
    const image = $(el).find("img").attr("src");
    
    deals.push({ name, price, oldPrice, link, image });
  });

  return deals;
};

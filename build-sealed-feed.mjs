#!/usr/bin/env node
/**
 * Builds sealed-products.json: every sealed Pokémon product on Cardmarket with its
 * current price, small enough for the Binder app to download.
 *
 * Source: Cardmarket's public daily downloads (product catalogue + price guide),
 * https://www.cardmarket.com/Data/Download. Pokémon is game id 6.
 *
 * Usage: node build-sealed-feed.mjs [output-path]
 * Runs daily in .github/workflows/sealed-feed.yml. Needs Node 18+ (global fetch), no dependencies.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const PRODUCTS_URL = `${BASE}/productList/products_nonsingles_6.json`;
const PRICES_URL = `${BASE}/priceGuide/price_guide_6.json`;
const OUTPUT = process.argv[2] ?? 'sealed-products.json';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

const round = (n) => (typeof n === 'number' && n > 0 ? Math.round(n * 100) / 100 : null);

const [catalogue, priceGuide] = await Promise.all([getJson(PRODUCTS_URL), getJson(PRICES_URL)]);
const prices = new Map(priceGuide.priceGuides.map((p) => [p.idProduct, p]));

const products = catalogue.products
  .map((p) => {
    const price = prices.get(p.idProduct);
    return {
      id: p.idProduct,
      name: p.name,
      category: p.categoryName,
      expansionId: p.idExpansion,
      added: String(p.dateAdded).slice(0, 10),
      trend: round(price?.trend),
      avg: round(price?.avg),
      low: round(price?.low),
    };
  })
  // Newest first, so the app can show recent products before anyone types.
  .sort((a, b) => b.added.localeCompare(a.added) || b.id - a.id);

const feed = {
  updatedAt: priceGuide.createdAt ?? new Date().toISOString(),
  source: 'Cardmarket price guide and product catalogue (https://www.cardmarket.com/Data/Download)',
  products,
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(feed));
const priced = products.filter((p) => p.trend || p.avg || p.low).length;
console.log(`Wrote ${products.length} sealed products (${priced} with a price) to ${OUTPUT}`);

#!/usr/bin/env node
/**
 * Builds sealed-products.json: every sealed Pokémon product on Cardmarket with its
 * current price, region and matching international set, small enough for the Binder app.
 *
 * Sources:
 * - Cardmarket's public daily downloads (product catalogue + price guide),
 *   https://www.cardmarket.com/Data/Download. Pokémon is game id 6.
 * - The international set list from https://pokemontcg.io, to recognise which set a product
 *   belongs to (the app shows that set's logo) and which products are international.
 *
 * Cardmarket has no language field, so the region is derived:
 * 1. an explicit marker in a product name ("S-Ch", "Korean", "Indonesian", "JP", ...);
 * 2. otherwise, an expansion whose products match an international set is international;
 * 3. otherwise, an expansion with international-only formats (Elite Trainer Boxes, sleeved
 *    boosters, blisters, ...) is international, e.g. a new set pokemontcg.io doesn't list yet;
 * 4. otherwise, an expansion that contains boosters is a Japanese-only set
 *    (Chinese, Korean, Indonesian and Thai products are always marked in the name);
 * 5. anything else (tins, figures, accessories without a set) is international.
 *
 * Usage: node build-sealed-feed.mjs [output-path]
 * Runs daily in .github/workflows/sealed-feed.yml. Needs Node 18+ (global fetch), no dependencies.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = 'https://downloads.s3.cardmarket.com/productCatalog';
const PRODUCTS_URL = `${BASE}/productList/products_nonsingles_6.json`;
const PRICES_URL = `${BASE}/priceGuide/price_guide_6.json`;
const SETS_URL =
  'https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=250&select=id,name,series,releaseDate';
const OUTPUT = process.argv[2] ?? 'sealed-products.json';

async function getJson(url, attempts = 1) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      lastError = new Error(`${url} returned ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    // pokemontcg.io often answers 500/502; retry quickly.
    await new Promise((r) => setTimeout(r, Math.min(300 * (i + 1), 2000)));
  }
  throw lastError;
}

const round = (n) => (typeof n === 'number' && n > 0 ? Math.round(n * 100) / 100 : null);

const normalize = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[—–]/g, '-')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Explicit region markers in product names. Order matters: the first match wins. */
const REGION_MARKERS = [
  ['chinese', /\b(s-ch|t-ch|chinese)\b/i],
  // Chinese products also use set codes ending in a capital C, e.g. "CSV10.5C:", "CBB6C:", "151C:".
  ['chinese', /^[A-Za-z0-9.]*C:/],
  ['korean', /\bkorean\b/i],
  ['indonesian', /\bindonesian\b/i],
  ['thai', /\bthai\b/i],
  // Gym promos and "M-P" (Mega promo) packs are only distributed in Japan.
  ['japanese', /\b(japanese|japan|jp)\b|pok[eé]mon card gym|\bm-p promos?\b/i],
];

const INTERNATIONAL_ONLY =
  /elite trainer box|sleeved booster|booster bundle|build (&|and) battle|checklane|blister|prize pack|world championships?|\bwcd\b|general mills|mcdonald|trick or trade/i;

function markedRegion(name) {
  for (const [region, pattern] of REGION_MARKERS) {
    if (!pattern.test(name)) continue;
    // "JP" also appears in deck names such as WCD 2025 "JP Raging Bolt", an international product.
    if (region === 'japanese' && /\bwcd\b/i.test(name)) return null;
    return region;
  }
  return null;
}

/** Longest international set name that a product name starts with (after an optional "CODE:" prefix). */
function matchSet(name, sets) {
  const full = normalize(name.replace(/^[A-Za-z0-9.]+:\s*/, ''));
  // Cardmarket calls old sets "EX Ruby & Sapphire"; pokemontcg.io calls them "Ruby & Sapphire".
  const candidates = [full, full.replace(/^ex /, '')];
  let best = null;
  for (const set of sets) {
    if (set.key.length < 3) continue;
    const hit = candidates.some((n) => n === set.key || n.startsWith(`${set.key} `));
    if (hit && (!best || set.key.length > best.key.length)) best = set;
  }
  return best;
}

async function loadPreviousFeed() {
  try {
    const previous = JSON.parse(await readFile(OUTPUT, 'utf8'));
    return new Map(previous.products.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

const [catalogue, priceGuide, previous] = await Promise.all([
  getJson(PRODUCTS_URL),
  getJson(PRICES_URL),
  loadPreviousFeed(),
]);
const prices = new Map(priceGuide.priceGuides.map((p) => [p.idProduct, p]));

let sets = null;
try {
  const res = await getJson(SETS_URL, 20);
  sets = res.data.map((s) => ({ id: s.id, key: normalize(s.name) }));
} catch (e) {
  console.warn(`Could not load sets from pokemontcg.io (${e.message}); reusing yesterday's regions.`);
}

// Pass 1: per product, an explicit region marker and a matching international set.
const raw = catalogue.products.map((p) => ({
  p,
  marked: markedRegion(p.name),
  set: sets ? matchSet(p.name, sets) : null,
}));

// Pass 2: decide per Cardmarket expansion.
const byExpansion = new Map();
for (const item of raw) {
  const list = byExpansion.get(item.p.idExpansion) ?? [];
  list.push(item);
  byExpansion.set(item.p.idExpansion, list);
}
const expansionInfo = new Map();
for (const [expansionId, items] of byExpansion) {
  // Chinese/Korean/... markers apply to the whole expansion; a "JP" marker only to its own product.
  const marked = items.find((i) => i.marked && i.marked !== 'japanese')?.marked ?? null;
  const set = items.find((i) => !i.marked && i.set)?.set ?? null;
  const hasBoosters = items.some((i) => /booster/i.test(i.p.name) || /Booster|Display/.test(i.p.categoryName));
  // Formats that only exist internationally; catches new sets pokemontcg.io doesn't list yet.
  const internationalFormat = items.some((i) => !i.marked && INTERNATIONAL_ONLY.test(i.p.name));
  const region =
    marked ?? (set || internationalFormat ? 'international' : hasBoosters ? 'japanese' : 'international');
  expansionInfo.set(expansionId, { region });
}

const products = raw
  .map(({ p, marked, set }) => {
    const price = prices.get(p.idProduct);
    const info = expansionInfo.get(p.idExpansion);
    const old = previous.get(p.idProduct);
    const region = sets ? marked ?? info.region : old?.region ?? marked ?? 'international';
    // Only a product's own name decides its set: expansions on Cardmarket can mix sets.
    const setId = sets ? (region === 'international' ? set?.id ?? null : null) : old?.setId ?? null;
    return {
      id: p.idProduct,
      name: p.name,
      category: p.categoryName,
      expansionId: p.idExpansion,
      region,
      setId,
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

await mkdir(dirname(OUTPUT) || '.', { recursive: true });
await writeFile(OUTPUT, JSON.stringify(feed));

const count = (key) =>
  Object.entries(products.reduce((acc, p) => ({ ...acc, [p[key] ? (key === 'setId' ? 'with set' : p[key]) : 'none']: (acc[p[key] ? (key === 'setId' ? 'with set' : p[key]) : 'none'] ?? 0) + 1 }), {}))
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
const priced = products.filter((p) => p.trend || p.avg || p.low).length;
console.log(`Wrote ${products.length} sealed products (${priced} with a price) to ${OUTPUT}`);
console.log(`Regions: ${count('region')}`);
console.log(`Set logos: ${count('setId')}`);

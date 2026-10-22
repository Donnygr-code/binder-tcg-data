# binder-tcg-data

Daily data feed for the Binder Pokémon TCG app.

`sealed-products.json` lists every sealed Pokémon product on Cardmarket (booster boxes,
Elite Trainer Boxes, tins, blisters, …) with its current trend, average and lowest price in EUR,
its region (`international`, `japanese`, `chinese`, `korean`, `indonesian`, `thai`) and, when the
name matches an international set on pokemontcg.io, that set's id (`setId`, used for the set logo). `apiId` is the matching product on
[pokemontcgapi.com](https://pokemontcgapi.com), linked by name, which the app uses to show the
product photo. Only that id is stored here, no photos or pokemontcgapi.com prices.

Cardmarket has no language field, so the region is derived from product names and formats;
see the comment at the top of the script. It is right for the vast majority of products, but
not guaranteed for every one.

It is rebuilt every morning by [`.github/workflows/sealed-feed.yml`](.github/workflows/sealed-feed.yml)
from Cardmarket's public price guide and product catalogue
(<https://www.cardmarket.com/Data/Download>), using [`build-sealed-feed.mjs`](build-sealed-feed.mjs).

Run it locally with Node 18 or newer:

```bash
node build-sealed-feed.mjs
```

Without a `BINDER_API_TOKEN` environment variable the previous `apiId` values are kept.

Prices are Cardmarket's; this repository only reformats them.

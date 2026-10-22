# binder-tcg-data

Daily data feed for the Binder Pokémon TCG app.

`sealed-products.json` lists every sealed Pokémon product on Cardmarket (booster boxes,
Elite Trainer Boxes, tins, blisters, …) with its current trend, average and lowest price in EUR.

It is rebuilt every morning by [`.github/workflows/sealed-feed.yml`](.github/workflows/sealed-feed.yml)
from Cardmarket's public price guide and product catalogue
(<https://www.cardmarket.com/Data/Download>), using [`build-sealed-feed.mjs`](build-sealed-feed.mjs).

Run it locally with Node 18 or newer:

```bash
node build-sealed-feed.mjs
```

Prices are Cardmarket's; this repository only reformats them.

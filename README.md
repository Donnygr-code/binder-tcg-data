# binder-tcg-data

Daily data feed for the Binder Pokémon TCG app.

`sealed-products.json` lists every sealed Pokémon product on Cardmarket (booster boxes,
Elite Trainer Boxes, tins, blisters, …) with its current trend, average and lowest price in EUR,
its region (`international`, `japanese` or `chinese`; Binder supports no other regions, so
Korean, Indonesian and Thai products are left out) and, when the
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

## Release calendar

`release-calendar.json` lists announced sets that are not out yet, kept by hand from official
announcements. The Chase TCG Worker reads it every morning: a new entry is announced to those with
new-set notifications on ("Coming 6 November: Delta Reign"), and on its release day they get "Out
Today". Each entry has a stable `id` (never reuse one), a `name`, a `region` (`international`,
`japanese` or `chinese`) and a `releaseDate` (`YYYY-MM-DD`). Add a set once its date is official;
a changed date can simply be edited. Entries can stay after release.

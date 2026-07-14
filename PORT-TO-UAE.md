# Porting the MLS Landing-Page Builder to MLS UAE

> Hand this file to Claude Code running in the **MLS UAE** repo. It explains the `mls_*`
> landing-page builder built for MLS Oman and exactly how to replicate it on
> `mls-uae.myshopify.com`. The UAE store is where this code originally came from, so all the
> brand components it depends on already exist there.

---

## 1. What this system is

A **metaobject-driven landing-page builder**. A Shopify page opts in by setting a
`custom.landing_page` metafield → an `mls_landing_page` metaobject → an **ordered list of section
metaobjects**. One dynamic path in `pages.$handle.tsx` renders any landing page. Adding a page =
create metaobjects in admin (or via the seeder) — **no per-page code**.

**15 reusable section types**, each a metaobject + a React component:

| Section metaobject | Component | Purpose |
|---|---|---|
| `mls_section_hero` | `MlsHero` | Hero (desktop+mobile image, heading, CTA, black strip). `_ar` image twins |
| `mls_section_icons` | `MlsIcons` | "THE MLS EXPERIENCE" icon row (child `mls_icon_item`) |
| `mls_section_message` | `MlsMessage` | Thin colored message strip |
| `mls_section_card_grid` | `MlsCardGrid` | Origin/Cut cards — circle style OR overlay (VIEW COLLECTION) style. child `mls_card_item`. Mobile carousel / desktop grid |
| `mls_section_product_carousel` | `MlsProductCarousel` | Products from a collection — `layout: carousel|grid` |
| `mls_section_reels` | `MlsReels` | Video reels (child `mls_reel_item`) → brand ReelsCarousel |
| `mls_section_feature_cards` | `MlsFeatureCards` | Icon+heading+body cards (child `mls_feature_item`). Mobile carousel |
| `mls_section_media_showcase` | `MlsMediaShowcase` | Image tiles w/ captions (child `mls_media_item`) |
| `mls_section_comparison` | `MlsComparison` | "MLS vs THEM" animated split-panel (child `mls_comparison_row`) |
| `mls_section_promo_banner` | `MlsPromoBanner` | Bold colored CTA band |
| `mls_section_reviews` | `MlsReviews` | Testimonial carousel (child `mls_review_item`) |
| `mls_section_awards` | `MlsAwards` | Award/badge row (child `mls_award_item`) |
| `mls_section_feature_panel` | `MlsFeaturePanel` | Crimson panel w/ points OR `variant:plain` image+bullets (child `mls_panel_point`) |
| `mls_section_process` | `MlsProcess` | Video + timeline steps (child `mls_process_step`) |
| `mls_section_featured_products` | `MlsFeaturedProducts` | Hand-picked products (list.product_reference) as large blocks w/ inline variant options + add-to-cart; alternating bg when >1 |

Page-level **light/dark theme** via a `theme` field on `mls_landing_page`.
Arabic: text via Shopify Translate & Adapt; only IMAGE fields have `_ar` twins (via `applyArImages`).

---

## 2. Files to copy from the Oman repo (verbatim)

From `hydrogen/` in the Oman repo, copy these into the same paths in the UAE repo:

```
app/components/mls-landing/          # ALL 16 files: the 15 Mls*.tsx components + fields.ts
app/lib/mlsLanding.tsx               # query + loadLandingSections() + MlsLandingSections renderer
scripts/create-landing-pages.ts      # the seeder (definitions + page seeding)
```

These import only:
- `~/lib/arImages` (`applyArImages`) — already exists in UAE (it's the same headless codebase).
- `@/lib/shopify` (`ShopifyProduct`, `formatPrice`, `shopifyImageUrl`, `type ReelProduct`).
- Brand components already in UAE: `ProductCard`, `home/HScroller`, `home/ReelsCarousel`,
  `reviews/StarRating`, `shared/OptionButton`, `shared/QuantitySelector`, `ui/button`,
  stores `cartStore` / `quickBuyStore` / `localeStore`.

If any import path differs in the UAE repo, adjust the import — the logic is unchanged.

---

## 3. Store-specific changes (MUST do for UAE)

### a) Country context: `"OM"` → `"AE"`
In `app/lib/mlsLanding.tsx` there are **3** `country: "OM" as const` — change all to `"AE"`.
(That's the only hardcoded country in the builder code.)

### b) Currency / copy
The Oman seeder text uses **OMR** and Oman place names. For UAE, prices are **AED** and copy says
"Dubai"/"UAE". The `formatPrice` helper already picks decimals by currency, so the CODE needs no
change — only the **seeded text** does. Since UAE pages are different anyway (see §5), you'll write
fresh copy per UAE screenshot.

### c) Seeder env (`hydrogen/.env`)
```
PUBLIC_STORE_DOMAIN=mls-uae.myshopify.com
SHOPIFY_ADMIN_API_TOKEN=<UAE Admin API token, scopes: write_metaobject_definitions,
                         write_metaobjects, read_metaobjects, write_metafield_definitions,
                         write_metafields, read/write products, read/write content(pages)>
PUBLIC_STOREFRONT_API_VERSION=2025-07
```
The seeder reads `.env` itself (no dotenv dep). `.env` is gitignored.

### d) Delivery copy
Oman standardized to **"1 hour"**. Confirm what UAE uses (likely "2 hours" or same) and set
accordingly in the seeded hero/icon text.

---

## 4. Wire the route (once)

The builder is invoked from `pages.$handle.tsx`. In the UAE repo, add to its `loader` — BEFORE the
existing page logic — and to the component:

```ts
// top of file
import { loadLandingSections, MlsLandingSections } from "~/lib/mlsLanding";

// in loader(), right after you compute userLanguage ("AR"/"EN"):
const mlsLanding = await loadLandingSections(context, handle, userLanguage);
if (mlsLanding) {
  return {
    isMlsLanding: true as const,
    sections: mlsLanding.sections,
    productsByCollection: mlsLanding.productsByCollection,
    productsByHandle: mlsLanding.productsByHandle,
    mlsTheme: mlsLanding.theme,
    // ...plus whatever fields the rest of the component/meta expect, defaulted
  };
}
// ...existing loader continues (add `isMlsLanding: false as const` to its other returns)

// in the component, before existing render branches:
if (data.isMlsLanding) {
  return <MlsLandingSections sections={data.sections}
           productsByCollection={data.productsByCollection}
           productsByHandle={data.productsByHandle} theme={data.mlsTheme} />;
}
```

`loadLandingSections` returns `null` when the page has no `custom.landing_page` metafield, so normal
pages fall through untouched. **Do not touch the UAE store's existing landing/prose page logic** —
this sits in front of it, metafield-gated.

Also run the seeder once with the metafield-definition step so `custom.landing_page` (PAGE metafield,
type metaobject_reference → mls_landing_page) exists in admin. The seeder's
`ensurePageMetafieldDefinition()` handles this.

---

## 5. How to build each UAE page (the workflow used on Oman)

UAE has DIFFERENT pages — don't copy Oman's page seed functions. For each UAE screenshot:

1. **Find handles first** (Admin API): the Shopify page handle + the collection/product handles the
   page references. (Storefront `products(query:"handle:x")` is FUZZY — use `product(handle:)` for
   exact, and Admin `products(first,query:"handle:x")` returns GIDs.)
2. **Map the screenshot to the 15 section types** above. Almost everything reuses existing types.
   Only build a NEW section type + component if a genuinely new layout appears (rare).
3. **Write a `seedX()` function** in `create-landing-pages.ts` following the existing pattern
   (`seedBeefCollection`, `seedWagyu`, etc.): create section entries, order them in the page's
   `sections` list, seed the `mls_landing_page` entry, `linkPage()` the metafield.
4. **Run** `npx tsx scripts/create-landing-pages.ts --page <name>` and verify on local dev
   (`npm run dev` → `/pages/<handle>`).

### Seeder patterns/gotchas learned on Oman (reuse them):
- `ensureDefinition()` skips existing defs → to ADD a field later use `ensureFields()`.
- Mixed section list = `list.mixed_reference` with `metaobject_definition_ids` validation; when you
  add a new section type, `syncLandingSectionsValidation()` must re-add all ids to the existing
  `mls_landing_page.sections` field.
- Shopify can't change a field's `type` in place; `url` fields reject `#anchor`/relative paths — the
  Oman seeder uses text fields for `button_url`/card `link` (see `fixUrlFieldToText`). Keep that.
- `list.mixed_reference`/`metaobject_reference` need a definition-id validation or Shopify errors
  ("Validations require that you select a metaobject").
- `collection_reference`/`product_reference` need **GIDs**, not handles → resolve via Admin API
  (`collGid()`, `productGids()` helpers).
- `ensurePage()` creates the Shopify page if missing; `seedCards()` seeds card items; icons can be
  shared across pages (see `migrateSharedIcons` / `mls-shared-icon-*`).
- Idempotent: `upsertEntry()` updates existing entries by handle, so re-running is safe.

### Content assignment (in admin, after seeding):
Sections seed with text/structure but EMPTY images. Upload hero/icon/showcase images, process video,
reels, and pick collections/products per section in Shopify admin. Product grids/carousels show real
products immediately once the collection is set.

---

## 6. Quick start checklist for UAE Claude Code

1. Copy the 3 file groups from §2 into the UAE `hydrogen/`.
2. Change `country: "OM"` → `"AE"` (3 spots in `mlsLanding.tsx`).
3. Create `hydrogen/.env` with UAE domain + Admin token (§3c).
4. Wire `pages.$handle.tsx` (§4).
5. Run the seeder once to create all definitions + the page metafield definition:
   `npx tsx scripts/create-landing-pages.ts --defs-only`
6. Per UAE screenshot: follow §5 (find handles → map sections → write `seedX()` → run → verify).
7. Commit to the UAE working branch.

The Oman `MEMORY.md` + `.claude/.../memory/landing-page-schema-v1.md` document the full history and
every decision — read them for detail.
```

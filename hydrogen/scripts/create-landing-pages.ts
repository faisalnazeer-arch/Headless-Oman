#!/usr/bin/env node
/**
 * create-landing-pages.ts
 *
 * The MLS landing-page BUILDER (mls_* system). Creates every metaobject definition for the
 * new landing-page builder, idempotently, then seeds the first page ("beef-collection") and
 * points the Shopify page's `custom.landing_page` metafield at it.
 *
 * Design (confirmed with Faraz):
 *   - Shopify page (already created in admin) → metafield custom.landing_page (metaobject ref)
 *       → mls_landing_page → ordered `sections` (list.metaobject_reference) → mls_section_* entries.
 *   - pages.$handle.tsx auto-detects the custom.landing_page metafield and renders the mls_* builder.
 *     Adding a new page = create metaobjects + YOU assign the metafield in admin. No code changes.
 *   - This script creates the metaobjects + the metafield DEFINITION, then prints the
 *     mls_landing_page id. It does NOT auto-assign the page metafield — you pick which page uses
 *     which design in Shopify admin (Page → Metafields → Landing Page).
 *   - Arabic: text auto-translates via Shopify Translate & Adapt (definitions are translatable:true);
 *     only IMAGE fields get an `_ar` twin so Arabic banners can differ (handled by applyArImages).
 *   - HARD RULE: ≤20 images per metaobject → card/icon/reel-heavy sections use CHILD item metaobjects
 *     referenced as a list, so no single entry ever holds >20 images.
 *   - Every definition + every entry has a human `name` for easy identification in admin.
 *
 * Prerequisites (hydrogen/.env):
 *   PUBLIC_STORE_DOMAIN       e.g. muscat-livestock.myshopify.com
 *   SHOPIFY_ADMIN_API_TOKEN   Custom App token — scopes: write_metaobject_definitions,
 *                             write_metaobjects, write_metaobjects, write_products (for page metafield)
 *
 * Usage:
 *   npx tsx scripts/create-landing-pages.ts                 # create defs + seed beef-collection
 *   npx tsx scripts/create-landing-pages.ts --defs-only     # only create/ensure definitions
 *   npx tsx scripts/create-landing-pages.ts --page beef-collection
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── .env ─────────────────────────────────────────────────────────────────────
async function loadDotEnv() {
  try {
    const raw = await fs.readFile(path.join(ROOT, ".env"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
}
await loadDotEnv();

const SHOP = process.env.PUBLIC_STORE_DOMAIN ?? "";
const TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN ?? "";
const API_VERSION = "2024-10";

if (!SHOP || !TOKEN) {
  console.error("❌  Set PUBLIC_STORE_DOMAIN and SHOPIFY_ADMIN_API_TOKEN in hydrogen/.env");
  process.exit(1);
}

const GQL_URL = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
const args = process.argv.slice(2);
const DEFS_ONLY = args.includes("--defs-only");
const PAGE_HANDLE = (() => {
  const i = args.indexOf("--page");
  return i >= 0 && args[i + 1] ? args[i + 1] : "beef-collection";
})();

// ── GraphQL helper ───────────────────────────────────────────────────────────
async function gql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as any;
  if (json.errors) {
    console.error("GraphQL errors:", JSON.stringify(json.errors, null, 2));
    throw new Error(json.errors[0].message);
  }
  return json.data as T;
}

// ── Definition helpers ───────────────────────────────────────────────────────
const defIdCache = new Map<string, string>();

async function getDefId(type: string): Promise<string> {
  if (defIdCache.has(type)) return defIdCache.get(type)!;
  const r = await gql<any>(`{ metaobjectDefinitionByType(type: "${type}") { id } }`);
  const id = r?.metaobjectDefinitionByType?.id ?? "";
  if (id) defIdCache.set(type, id);
  return id;
}

async function ensureDefinition(type: string, name: string, fieldDefinitions: any[]) {
  const existing = await getDefId(type);
  if (existing) {
    console.log(`ℹ️   ${type} — already exists`);
    return existing;
  }
  console.log(`📦  Creating definition: ${type}`);
  const res = await gql<any>(
    `mutation CreateDef($def: MetaobjectDefinitionCreateInput!) {
       metaobjectDefinitionCreate(definition: $def) {
         metaobjectDefinition { id type }
         userErrors { field message }
       }
     }`,
    {
      def: {
        type,
        name,
        access: { storefront: "PUBLIC_READ" },
        capabilities: { translatable: { enabled: true } },
        fieldDefinitions,
      },
    }
  );
  const errs = res?.metaobjectDefinitionCreate?.userErrors ?? [];
  if (errs.length) {
    console.error("❌", errs.map((e: any) => e.message).join("; "));
    process.exit(1);
  }
  const id = res?.metaobjectDefinitionCreate?.metaobjectDefinition?.id;
  console.log(`✅  Created: ${id}`);
  if (id) defIdCache.set(type, id);
  return id as string;
}

// Update the mls_landing_page `sections` field so its allowed section-type ids match the current
// set (adds newly-created section types to an already-existing definition).
async function syncLandingSectionsValidation(sectionIdsList: string[]) {
  const defId = await getDefId("mls_landing_page");
  if (!defId) return;
  const cur = await gql<any>(
    `{ metaobjectDefinitionByType(type:"mls_landing_page"){ fieldDefinitions{ key validations{ name value } } } }`
  );
  const sf = cur?.metaobjectDefinitionByType?.fieldDefinitions?.find((f: any) => f.key === "sections");
  const existing: string[] = (() => {
    try { return JSON.parse(sf?.validations?.find((v: any) => v.name === "metaobject_definition_ids")?.value ?? "[]"); }
    catch { return []; }
  })();
  const merged = Array.from(new Set([...existing, ...sectionIdsList])).filter(Boolean);
  if (merged.length === existing.length && merged.every((id) => existing.includes(id))) return; // no change
  console.log(`\n=== Syncing mls_landing_page.sections allowed types (${merged.length}) ===`);
  const res = await gql<any>(
    `mutation($id: ID!, $val: String!) {
       metaobjectDefinitionUpdate(id: $id, definition: {
         fieldDefinitions: [{ update: { key: "sections", validations: [{ name: "metaobject_definition_ids", value: $val }] } }]
       }) { metaobjectDefinition { id } userErrors { field message } }
     }`,
    { id: defId, val: JSON.stringify(merged) }
  );
  const errs = res?.metaobjectDefinitionUpdate?.userErrors ?? [];
  if (errs.length) console.warn("⚠️   ", errs.map((e: any) => e.message).join("; "));
  else console.log("✅  sections field now allows all section types.");
}

// Ensure specific fields exist on an ALREADY-existing definition (ensureDefinition only creates new
// definitions; it won't add fields to one that already exists). Adds any missing fields via update.
async function ensureFields(type: string, fields: { key: string; name: string; typeName: string }[]) {
  const defId = await getDefId(type);
  if (!defId) return;
  const cur = await gql<any>(`{ metaobjectDefinitionByType(type:"${type}"){ fieldDefinitions{ key } } }`);
  const have = new Set((cur?.metaobjectDefinitionByType?.fieldDefinitions ?? []).map((f: any) => f.key));
  const missing = fields.filter((f) => !have.has(f.key));
  if (missing.length === 0) return;
  console.log(`\n=== Adding ${missing.length} field(s) to ${type}: ${missing.map((m) => m.key).join(", ")} ===`);
  const creates = missing.map((m) => `{ create: { key: "${m.key}", name: "${m.name}", type: "${m.typeName}" } }`).join("\n");
  const res = await gql<any>(
    `mutation($id: ID!) {
       metaobjectDefinitionUpdate(id: $id, definition: { fieldDefinitions: [${creates}] }) {
         metaobjectDefinition { id } userErrors { field message }
       }
     }`,
    { id: defId }
  );
  const errs = res?.metaobjectDefinitionUpdate?.userErrors ?? [];
  if (errs.length) console.warn("⚠️   ", errs.map((e: any) => e.message).join("; "));
  else console.log(`✅  ${type} fields ensured.`);
}

// Convenience field builders
const text = (key: string, name: string, req = false) => ({ key, name, type: "single_line_text_field", required: req });
const multiline = (key: string, name: string) => ({ key, name, type: "multi_line_text_field" });
const url = (key: string, name: string) => ({ key, name, type: "url" });
const bool = (key: string, name: string) => ({ key, name, type: "boolean" });
const int = (key: string, name: string) => ({ key, name, type: "number_integer" });
const img = (key: string, name: string) => ({ key, name, type: "file_reference" });
// Image + its Arabic twin (only images get _ar per Faraz's Arabic strategy).
const imgPair = (key: string, name: string) => [img(key, name), img(`${key}_ar`, `${name} (Arabic)`)];
const collectionRef = (key: string, name: string) => ({ key, name, type: "collection_reference" });
const productRef = (key: string, name: string) => ({ key, name, type: "product_reference" });
const videoRef = (key: string, name: string) => ({ key, name, type: "file_reference" });
const listRef = (key: string, name: string, defId: string) => ({
  key,
  name,
  type: "list.metaobject_reference",
  validations: defId ? [{ name: "metaobject_definition_id", value: defId }] : [],
});

// ── 1. Leaf item definitions (referenced by sections) ────────────────────────
async function createDefinitions() {
  console.log("\n=== Definitions ===");

  // Icon item (feature/trust badge): icon image + heading + subtitle
  await ensureDefinition("mls_icon_item", "Landing · Icon Item", [
    text("name", "Name (admin label)", true),
    img("icon", "Icon"),
    text("heading", "Heading"),
    text("sub_title", "Sub Title"),
  ]);

  // Card item (origin/cut card): image (+ar) + label + collection ref + optional tab
  // `link` is text (not url) so relative paths like /collections/foo work and override the collection ref.
  await ensureDefinition("mls_card_item", "Landing · Card Item", [
    text("name", "Name (admin label)", true),
    ...imgPair("image", "Image"),
    text("label", "Label"),
    collectionRef("collection", "Collection"),
    text("link", "Manual Link or /path (optional, overrides Collection)"),
    text("category", "Tab / Category (optional)"),
    text("country_code", "Country Code (optional, e.g. AU — flag fallback)"),
    text("button_text", "Button Text (overlay style, e.g. 'View Collection')"),
  ]);

  // Reel item: video upload + poster + title + optional product
  await ensureDefinition("mls_reel_item", "Landing · Reel Item", [
    text("name", "Name (admin label)", true),
    videoRef("video", "Video (upload)"),
    img("poster", "Poster Image"),
    text("title", "Title"),
    productRef("product", "Linked Product (optional)"),
  ]);

  const iconItemId = await getDefId("mls_icon_item");
  // Feature item ("Why South African Beef?" card): icon image + heading + body text
  await ensureDefinition("mls_feature_item", "Landing · Feature Item", [
    text("name", "Name (admin label)", true),
    img("icon", "Icon"),
    text("heading", "Heading"),
    multiline("body", "Body Text"),
  ]);

  // Media showcase item ("We trace it" panel): image (+ar) + optional caption + optional link
  await ensureDefinition("mls_media_item", "Landing · Media Item", [
    text("name", "Name (admin label)", true),
    ...imgPair("image", "Image"),
    text("caption", "Caption (optional overlay)"),
    text("link", "Link or /path (optional)"),
  ]);

  // Comparison row ("MLS vs THEM"): label + whether MLS/them have it
  await ensureDefinition("mls_comparison_row", "Landing · Comparison Row", [
    text("name", "Name (admin label)", true),
    text("mls_label", "MLS Label (e.g. 'Fresh Meat')"),
    text("them_label", "Them Label (defaults to MLS label if empty)"),
    bool("mls_has", "MLS has it (check)"),
    bool("them_has", "Them has it (check)"),
  ]);

  // Review item (testimonial): quote + author + rating
  await ensureDefinition("mls_review_item", "Landing · Review Item", [
    text("name", "Name (admin label)", true),
    multiline("quote", "Quote"),
    text("author", "Author"),
    int("rating", "Rating (1-5)"),
  ]);

  // Award item (badge): logo image + caption
  await ensureDefinition("mls_award_item", "Landing · Award Item", [
    text("name", "Name (admin label)", true),
    img("image", "Badge Image"),
    text("caption", "Caption"),
  ]);

  // Panel point ("Things You Need To Know" callout): icon + title + text
  await ensureDefinition("mls_panel_point", "Landing · Panel Point", [
    text("name", "Name (admin label)", true),
    img("icon", "Icon (optional)"),
    text("title", "Title"),
    multiline("body", "Body Text"),
  ]);

  // Process step (dry-aged timeline): label + image + text
  await ensureDefinition("mls_process_step", "Landing · Process Step", [
    text("name", "Name (admin label)", true),
    text("label", "Label (e.g. 'Days 0-7: The Promise')"),
    img("image", "Image"),
    multiline("body", "Body Text"),
  ]);

  const cardItemId = await getDefId("mls_card_item");
  const reelItemId = await getDefId("mls_reel_item");
  const featureItemId = await getDefId("mls_feature_item");
  const mediaItemId = await getDefId("mls_media_item");
  const awardItemId = await getDefId("mls_award_item");
  const panelPointId = await getDefId("mls_panel_point");
  const processStepId = await getDefId("mls_process_step");
  const comparisonRowId = await getDefId("mls_comparison_row");
  const reviewItemId = await getDefId("mls_review_item");

  // ── 2. Section definitions ───────────────────────────────────────────────
  // Hero: desktop+mobile image (+ar), heading/subheading, button, and the black "strip" bar text.
  await ensureDefinition("mls_section_hero", "Landing · Section: Hero", [
    text("name", "Name (admin label)", true),
    ...imgPair("desktop_image", "Desktop Image"),
    ...imgPair("mobile_image", "Mobile Image"),
    text("heading", "Heading"),
    multiline("subheading", "Subheading"),
    text("button_text", "Button Text"),
    // Text (not url) so it accepts hash anchors (#products) and relative paths, not just full URLs.
    text("button_url", "Button URL or #anchor"),
    text("strip_text", "Strip Text (black bar under hero)"),
  ]);

  // Icons row: heading + list of icon items
  await ensureDefinition("mls_section_icons", "Landing · Section: Icons", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading"),
    listRef("items", "Icon Items", iconItemId),
  ]);

  // Message strip (black bar): text + optional colors
  await ensureDefinition("mls_section_message", "Landing · Section: Message Strip", [
    text("name", "Name (admin label)", true),
    text("message", "Message"),
    text("bg_color", "Background Color (hex, optional)"),
    text("text_color", "Text Color (hex, optional)"),
  ]);

  // Card grid (Shop by Origin / Shop by Cut / Wagyu MB): eyebrow + heading + list of card items + style
  await ensureDefinition("mls_section_card_grid", "Landing · Section: Card Grid", [
    text("name", "Name (admin label)", true),
    text("eyebrow", "Eyebrow"),
    text("heading", "Heading"),
    listRef("cards", "Cards", cardItemId),
    // "circle" (default, round image + label under, for origin/cut) or "overlay"
    // (rectangular image with label + VIEW COLLECTION button overlaid, for Wagyu MB cards).
    text("style", "Card Style: circle or overlay"),
  ]);

  // Product carousel / grid: heading + collection ref + view-all toggle + layout (carousel|grid)
  await ensureDefinition("mls_section_product_carousel", "Landing · Section: Products", [
    text("name", "Name (admin label)", true),
    text("eyebrow", "Eyebrow"),
    text("heading", "Heading"),
    multiline("subheading", "Subheading (optional)"),
    collectionRef("collection", "Collection"),
    bool("show_view_all", "Show 'View All' link"),
    int("max_products", "Max Products (default 12)"),
    // "carousel" (default, horizontal) or "grid" (wrapping grid, e.g. full 'Shop Cuts' section).
    text("layout", "Layout: carousel or grid"),
  ]);

  // Reels: eyebrow + heading + list of reel items
  await ensureDefinition("mls_section_reels", "Landing · Section: Reels", [
    text("name", "Name (admin label)", true),
    text("eyebrow", "Eyebrow"),
    text("heading", "Heading"),
    listRef("reels", "Reels", reelItemId),
  ]);

  // Feature cards ("Why South African Beef?"): eyebrow/heading + list of feature items + CTA
  await ensureDefinition("mls_section_feature_cards", "Landing · Section: Feature Cards", [
    text("name", "Name (admin label)", true),
    text("eyebrow", "Eyebrow"),
    text("heading", "Heading"),
    listRef("items", "Feature Items", featureItemId),
    text("button_text", "Button Text (optional)"),
    text("button_url", "Button URL or /path (optional)"),
  ]);

  // Media showcase ("We trace it, so you can trust it!"): heading/subheading + list of media items
  await ensureDefinition("mls_section_media_showcase", "Landing · Section: Media Showcase", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading"),
    multiline("subheading", "Subheading"),
    listRef("items", "Media Items", mediaItemId),
  ]);

  // Comparison ("MLS vs THEM"): headings for each side + list of rows
  await ensureDefinition("mls_section_comparison", "Landing · Section: Comparison", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading (optional)"),
    text("us_label", "Our Column Label (default 'MLS')"),
    text("them_label", "Their Column Label (default 'THEM')"),
    listRef("rows", "Rows", comparisonRowId),
  ]);

  // Promo banner ("Easy on the pocket, hard on the flavor!"): bold heading + button on a color band.
  await ensureDefinition("mls_section_promo_banner", "Landing · Section: Promo Banner", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading"),
    multiline("subheading", "Subheading (optional)"),
    text("button_text", "Button Text"),
    text("button_url", "Button URL or #anchor"),
    text("bg_color", "Background Color (hex, default crimson)"),
    ...imgPair("background_image", "Background Image (optional)"),
  ]);

  // Reviews (testimonial quotes): heading + star count + list of review items
  await ensureDefinition("mls_section_reviews", "Landing · Section: Reviews", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading"),
    int("rating", "Star Rating to show (1-5)"),
    listRef("reviews", "Reviews", reviewItemId),
  ]);

  // Awards ("MLS brings award-winning Angus beef"): heading/subheading + list of badge items
  await ensureDefinition("mls_section_awards", "Landing · Section: Awards", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading"),
    multiline("subheading", "Subheading (optional)"),
    listRef("items", "Award Badges", awardItemId),
  ]);

  // Feature panel ("Things You Need To Know"): crimson panel + heading/intro + image + labeled points
  await ensureDefinition("mls_section_feature_panel", "Landing · Section: Feature Panel", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading"),
    multiline("intro", "Intro Text (optional)"),
    ...imgPair("image", "Image"),
    text("button_text", "Button Text (optional)"),
    text("button_url", "Button URL or /path (optional)"),
    text("bg_color", "Background Color (hex, default crimson)"),
    listRef("points", "Points", panelPointId),
  ]);

  // Process / timeline (dry-aged process): video/image on one side + heading/intro + timeline steps
  await ensureDefinition("mls_section_process", "Landing · Section: Process", [
    text("name", "Name (admin label)", true),
    videoRef("video", "Video (upload, left side)"),
    ...imgPair("image", "Image (fallback if no video)"),
    text("heading", "Heading"),
    multiline("intro", "Intro Text (optional)"),
    listRef("steps", "Timeline Steps", processStepId),
  ]);

  // Featured products: heading + a list of specific product references (large detail blocks).
  await ensureDefinition("mls_section_featured_products", "Landing · Section: Featured Products", [
    text("name", "Name (admin label)", true),
    text("heading", "Heading (optional)"),
    { key: "products", name: "Products", type: "list.product_reference" },
  ]);

  const sectionDefIds = {
    hero: await getDefId("mls_section_hero"),
    icons: await getDefId("mls_section_icons"),
    message: await getDefId("mls_section_message"),
    card_grid: await getDefId("mls_section_card_grid"),
    product_carousel: await getDefId("mls_section_product_carousel"),
    reels: await getDefId("mls_section_reels"),
    feature_cards: await getDefId("mls_section_feature_cards"),
    media_showcase: await getDefId("mls_section_media_showcase"),
    comparison: await getDefId("mls_section_comparison"),
    promo_banner: await getDefId("mls_section_promo_banner"),
    reviews: await getDefId("mls_section_reviews"),
    awards: await getDefId("mls_section_awards"),
    feature_panel: await getDefId("mls_section_feature_panel"),
    process: await getDefId("mls_section_process"),
    featured_products: await getDefId("mls_section_featured_products"),
  };

  // ── 3. Page definition ───────────────────────────────────────────────────
  // `sections` is a MIXED list of section metaobjects (different types in one ordered list).
  // Shopify requires list.mixed_reference for that, with the allowed definition ids listed.
  const sectionIdsList = Object.values(sectionDefIds).filter(Boolean);
  await ensureDefinition("mls_landing_page", "Landing Page", [
    text("name", "Name (admin label)", true),
    text("handle_label", "Page Handle (for reference)"),
    text("seo_title", "SEO Title"),
    multiline("seo_description", "SEO Description"),
    // "light" (default) or "dark" — dark renders sections on charcoal + gold accents (premium pages).
    text("theme", "Theme: light or dark"),
    {
      key: "sections",
      name: "Sections (ordered)",
      type: "list.mixed_reference",
      validations: [{ name: "metaobject_definition_ids", value: JSON.stringify(sectionIdsList) }],
    },
  ]);

  // If mls_landing_page already existed, ensureDefinition skipped it — so ALWAYS sync the
  // allowed section-type ids on the `sections` field, otherwise new section types (feature_cards,
  // media_showcase, comparison) can't be added to pages in admin.
  await syncLandingSectionsValidation(sectionIdsList);

  return sectionDefIds;
}

// ── Seed helpers ─────────────────────────────────────────────────────────────
async function upsertEntry(type: string, handle: string, fields: { key: string; value: string }[]): Promise<string | null> {
  // Try to find existing by handle first (idempotent re-runs update rather than error).
  const existing = await gql<any>(
    `query($handle: MetaobjectHandleInput!) { metaobjectByHandle(handle: $handle) { id } }`,
    { handle: { type, handle } }
  );
  const existingId = existing?.metaobjectByHandle?.id;
  if (existingId) {
    const res = await gql<any>(
      `mutation Update($id: ID!, $fields: [MetaobjectFieldInput!]!) {
         metaobjectUpdate(id: $id, metaobject: { fields: $fields }) {
           metaobject { id handle } userErrors { field message }
         }
       }`,
      { id: existingId, fields }
    );
    const errs = res?.metaobjectUpdate?.userErrors ?? [];
    if (errs.length) { console.error("❌", errs.map((e: any) => e.message).join("; ")); return null; }
    console.log(`♻️   Updated: ${type}/${handle}`);
    return existingId;
  }
  const res = await gql<any>(
    `mutation Create($o: MetaobjectCreateInput!) {
       metaobjectCreate(metaobject: $o) { metaobject { id handle } userErrors { field message } }
     }`,
    { o: { type, handle, fields } }
  );
  const errs = res?.metaobjectCreate?.userErrors ?? [];
  if (errs.length) { console.error("❌", errs.map((e: any) => e.message).join("; ")); return null; }
  console.log(`✅  Seeded: ${type}/${handle}`);
  return res?.metaobjectCreate?.metaobject?.id ?? null;
}

// ── 4. Seed the beef-collection page (placeholder content — Faraz fills images/collections in admin) ──
async function seedBeefCollection() {
  console.log(`\n=== Seeding page: ${PAGE_HANDLE} ===`);
  const P = PAGE_HANDLE; // handle prefix for uniqueness

  // Hero
  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Beef Collection — Hero" },
    { key: "heading", value: "Experience the World's Finest Beef Selection" },
    { key: "subheading", value: "Fresh, Halal and sourced from around the world for you." },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" }, // requires button_url to be text (fixHeroButtonUrlField)
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  // Icons (MLS Experience)
  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Beef — Icon: 1hr Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Beef — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-halal`, name: "Beef — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [
      { key: "name", value: it.name },
      { key: "heading", value: it.heading },
    ]);
    if (id) iconIds.push(id);
  }
  const iconsSectionId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Beef Collection — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  // Message strip
  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Beef Collection — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Shop Beef by Origin — cards from the screenshot.
  const originCardIds = await seedCards(`${P}-origin-card`, [
    { label: "South African Grass-Fed Beef", collection: "south-african-grass-fed-beef", code: "za" },
    { label: "FIFA Brazil Grass-Fed Beef", collection: "brazil-grass-fed-beef", code: "br" },
    { label: "Australian Grass-fed Beef", collection: "australian-grass-fed-beef", code: "au" },
    { label: "Australian Black Angus Beef", collection: "australian-black-angus-beef", code: "au" },
    { label: "Australian Wagyu Beef MB 4/5", collection: "australian-wagyu-beef", code: "au" },
    { label: "Japanese Wagyu Beef", collection: "japanese-wagyu-beef", code: "jp" },
    { label: "New Zealand Grass-fed Beef", collection: "new-zealand-grass-fed-beef", code: "nz" },
    { label: "Fresh Somali Beef", collection: "somali-beef", code: "so" },
    { label: "Fresh Pakistani Beef", collection: "pakistani-beef", code: "pk" },
    { label: "Local Salalah Beef", collection: "local-salalah-beef", code: "om" },
    { label: "US Choice Black Angus Beef", collection: "us-choice-black-angus-beef", code: "us" },
    { label: "Seasoned Beef", collection: "seasoned-beef" },
  ]);
  const originGridId = await upsertEntry("mls_section_card_grid", `${P}-origin-grid`, [
    { key: "name", value: "Beef Collection — Shop Beef by Origin" },
    { key: "heading", value: "SHOP BEEF BY ORIGIN" },
    { key: "cards", value: JSON.stringify(originCardIds) },
  ]);

  // Shop Beef by Cut — cards from the screenshot.
  const cutCardIds = await seedCards(`${P}-cut-card`, [
    { label: "Beef Boneless Cubes", collection: "beef-boneless-cubes" },
    { label: "Beef Bone-In Cubes", collection: "beef-bone-in-cubes" },
    { label: "Beef Steaks", collection: "beef-steaks" },
    { label: "Beef Mishkak & Fondue", collection: "beef-mishkak-fondue" },
    { label: "Beef Mince", collection: "beef-mince" },
    { label: "Beef Ribs", collection: "beef-ribs" },
    { label: "Beef Brisket", collection: "beef-brisket" },
    { label: "Beef Roast", collection: "beef-roast" },
    { label: "Thin Beef Slices", collection: "thin-beef-slices" },
    { label: "Beef Burgers", collection: "beef-burgers" },
    { label: "Beef Stroganoff", collection: "beef-stroganoff" },
    { label: "Seasoned Beef", collection: "seasoned-beef" },
    { label: "Sausages", collection: "sausages" },
  ]);
  const cutGridId = await upsertEntry("mls_section_card_grid", `${P}-cut-grid`, [
    { key: "name", value: "Beef Collection — Shop Beef by Cut" },
    { key: "heading", value: "SHOP BEEF BY CUT" },
    { key: "cards", value: JSON.stringify(cutCardIds) },
  ]);

  // Product carousel — Featured collection
  const carouselId = await upsertEntry("mls_section_product_carousel", `${P}-featured`, [
    { key: "name", value: "Beef Collection — Featured Collection" },
    { key: "heading", value: "Featured Collection" },
    { key: "show_view_all", value: "true" },
  ]);

  // Reels — empty list; Faraz uploads reels in admin
  const reelsId = await upsertEntry("mls_section_reels", `${P}-reels`, [
    { key: "name", value: "Beef Collection — Reels" },
    { key: "heading", value: "MLS Reels" },
    { key: "eyebrow", value: "Watch & Shop" },
    { key: "reels", value: JSON.stringify([]) },
  ]);

  const sectionIds = [heroId, iconsSectionId, messageId, originGridId, cutGridId, carouselId, reelsId].filter(Boolean) as string[];

  // Page entry — ordered sections
  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Beef Collection (Landing Page)" },
    { key: "handle_label", value: P },
    { key: "seo_title", value: "Beef Collection — MLS Oman" },
    { key: "seo_description", value: "Shop the world's finest fresh, Halal beef by origin and cut. Delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return pageId;
}

// ── Page 2: South African Grass-Fed Beef ──────────────────────────────────────
async function seedSouthAfricanBeef() {
  const P = "sa-beef";
  const COLL = "south-african-grass-fed-beef";
  console.log(`\n=== Seeding page: south-african-grass-fed-beef ===`);

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "SA Beef — Hero" },
    { key: "heading", value: "Introducing MLS South African Grass-Fed Beef" },
    { key: "subheading", value: "From East London Abattoir, the best in class factory in South Africa. Fresh meat delivered in one hour." },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  // Icons (4 — includes Hormone Free)
  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "SA Beef — Icon: Fresh Delivery", heading: "1 Hour Fresh Delivery" },
    { h: `${P}-icon-box`, name: "SA Beef — Icon: Delivered in a box", heading: "Delivered in a box" },
    { h: `${P}-icon-halal`, name: "SA Beef — Icon: Fresh & Halal", heading: "Fresh & Halal" },
    { h: `${P}-icon-hormone`, name: "SA Beef — Icon: Hormone Free", heading: "Hormone Free" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "SA Beef — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  // Feature cards — Why South African Beef?
  const featIds: string[] = [];
  for (const f of [
    { h: `${P}-feat-1`, name: "SA Beef — Feature: Lean & Flavorful", heading: "Lean & Flavorful", body: "Younger cattle = less fat, but intense, natural taste." },
    { h: `${P}-feat-2`, name: "SA Beef — Feature: Grass Fed Goodness", heading: "Grass Fed Goodness", body: "Enjoy healthy Omega-3s from cattle raised on natural pastures." },
    { h: `${P}-feat-3`, name: "SA Beef — Feature: Quality You Can Trust", heading: "Quality You Can Trust", body: "Natural grading ensures consistent tenderness and excellence." },
  ]) {
    const id = await upsertEntry("mls_feature_item", f.h, [
      { key: "name", value: f.name }, { key: "heading", value: f.heading }, { key: "body", value: f.body },
    ]);
    if (id) featIds.push(id);
  }
  const featuresId = await upsertEntry("mls_section_feature_cards", `${P}-features`, [
    { key: "name", value: "SA Beef — Why South African Beef?" },
    { key: "heading", value: "Why South African Beef?" },
    { key: "items", value: JSON.stringify(featIds) },
    { key: "button_text", value: "View Collection" },
    { key: "button_url", value: `/collections/${COLL}` },
  ]);

  // Media showcase — We trace it, so you can trust it!
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "SA Beef — Trace image 1", caption: "" },
    { h: `${P}-media-2`, name: "SA Beef — Trace image 2", caption: "South African Beef Stroganoff" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }, { key: "caption", value: m.caption }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "SA Beef — We Trace It" },
    { key: "heading", value: "We trace it, so you can trust it!" },
    { key: "subheading", value: "MLS delivers the finest quality South African beef directly to your doorstep." },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  // Reviews — loved by 50,000 customers (shared carousel testimonials)
  const saReviewsId = await seedReviewsSection(P, "SA Beef");

  // Message strip — special requests
  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "SA Beef — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Resolve the collection GID so the product grid works immediately (collection_reference needs a GID).
  const collLookup = await gql<any>(`{ collections(first:1, query:"handle:${COLL}"){ nodes{ id } } }`);
  const collGid: string = collLookup?.collections?.nodes?.[0]?.id ?? "";

  // Product grid — Shop Your Favourite Cuts (grid layout)
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "SA Beef — Shop Your Favourite Cuts" },
    { key: "heading", value: "Shop Your Favourite MLS South Africa Beef Cuts" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "24" },
    { key: "show_view_all", value: "true" },
  ];
  if (collGid) gridFields.push({ key: "collection", value: collGid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  // You May Also Like — carousel
  const alsoId = await upsertEntry("mls_section_product_carousel", `${P}-also-like`, [
    { key: "name", value: "SA Beef — You May Also Like" },
    { key: "heading", value: "You May Also Like" },
    { key: "layout", value: "carousel" },
    { key: "max_products", value: "12" },
  ]);

  // Reels — empty list; upload reels in admin (mls_reel_item: video + poster + optional product)
  const reelsId = await upsertEntry("mls_section_reels", `${P}-reels`, [
    { key: "name", value: "SA Beef — Reels" },
    { key: "heading", value: "MLS Reels" },
    { key: "eyebrow", value: "Watch & Shop" },
    { key: "reels", value: JSON.stringify([]) },
  ]);

  // Comparison — MLS vs THEM
  const rowIds: string[] = [];
  for (const r of [
    { h: `${P}-cmp-1`, mls: "Fresh Meat", them: "Fresh Meat", mlsHas: true, themHas: false },
    { h: `${P}-cmp-2`, mls: "No smell", them: "Bad smell", mlsHas: true, themHas: false },
    { h: `${P}-cmp-3`, mls: "Eco-friendly Packaging", them: "Plastic Bags", mlsHas: true, themHas: false },
    { h: `${P}-cmp-4`, mls: "Clean & Hygienic Stores", them: "Unhygienic Stores", mlsHas: true, themHas: false },
    { h: `${P}-cmp-5`, mls: "Fast Delivery", them: "The convenience", mlsHas: true, themHas: false },
  ]) {
    const id = await upsertEntry("mls_comparison_row", r.h, [
      { key: "name", value: `SA Beef — ${r.mls}` },
      { key: "mls_label", value: r.mls }, { key: "them_label", value: r.them },
      { key: "mls_has", value: String(r.mlsHas) }, { key: "them_has", value: String(r.themHas) },
    ]);
    if (id) rowIds.push(id);
  }
  const comparisonId = await upsertEntry("mls_section_comparison", `${P}-comparison`, [
    { key: "name", value: "SA Beef — MLS vs THEM" },
    { key: "us_label", value: "MLS" }, { key: "them_label", value: "THEM" },
    { key: "rows", value: JSON.stringify(rowIds) },
  ]);

  const sectionIds = [heroId, iconsId, featuresId, showcaseId, saReviewsId, messageId, gridId, alsoId, reelsId, comparisonId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "South African Grass-Fed Beef (Landing Page)" },
    { key: "handle_label", value: COLL },
    { key: "seo_title", value: "MLS South African Grass-Fed Beef — MLS Oman" },
    { key: "seo_description", value: "Premium South African grass-fed beef, delivered fresh in one hour. Lean, flavorful, hormone-free." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: COLL };
}

// Helper: resolve a collection handle → GID (collection_reference fields need a GID).
async function collGid(handle: string): Promise<string> {
  const r = await gql<any>(`{ collections(first:1, query:"handle:${handle}"){ nodes{ id } } }`);
  return r?.collections?.nodes?.[0]?.id ?? "";
}

// Seed a shared set of testimonials (so the reviews section renders as a real carousel with dots)
// and return a reviews-section id for the given page prefix. Content is generic MLS testimonials.
async function seedReviewsSection(prefix: string, label: string) {
  const REVIEWS = [
    { author: "Emet A. ( Verified Customer)", quote: "Tomahawk Amazing !!! Simply an amazing piece of meat, good quality, taste great and no other taste... must have to give it a try!", rating: 5 },
    { author: "Graeme S. (Verified Customer)", quote: "Professional And Clean Delivery. Super quality meat. Very professional and clean delivery. Probably the best butcher in Muscat currently.", rating: 5 },
    { author: "Sara M. (Verified Customer)", quote: "Freshest meat in Oman. Delivered fast, beautifully packed, and always halal. My family won't buy anywhere else now.", rating: 5 },
    { author: "Ahmed R. (Verified Customer)", quote: "Consistently excellent. The grass-fed cuts are tender and full of flavor. Highly recommend the steaks.", rating: 5 },
  ];
  const ids: string[] = [];
  for (let i = 0; i < REVIEWS.length; i++) {
    const rv = REVIEWS[i];
    const id = await upsertEntry("mls_review_item", `${prefix}-rev-${i + 1}`, [
      { key: "name", value: `${label} — Review: ${rv.author}` },
      { key: "author", value: rv.author }, { key: "quote", value: rv.quote }, { key: "rating", value: String(rv.rating) },
    ]);
    if (id) ids.push(id);
  }
  return upsertEntry("mls_section_reviews", `${prefix}-reviews`, [
    { key: "name", value: `${label} — Reviews` },
    { key: "heading", value: "MLS is loved by over 50,000 customers" },
    { key: "rating", value: "5" },
    { key: "reviews", value: JSON.stringify(ids) },
  ]);
}

// ── Page 3: New Zealand Grass-Fed Beef ────────────────────────────────────────
async function seedNzBeef() {
  const P = "nz-beef";
  const PAGE = "nz-grass-fed-beef";               // Shopify page handle
  const COLL = "new-zealand-grass-fed-beef";      // collection handle
  console.log(`\n=== Seeding page: ${PAGE} ===`);

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "NZ Beef — Hero" },
    { key: "heading", value: "Stop buying old and frozen New Zealand beef and buy grass-fed and FRESH!" },
    { key: "subheading", value: "8 steaks Shipston for as low as OMR 13.000." },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Icons (4)
  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "NZ Beef — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "NZ Beef — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "NZ Beef — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "NZ Beef — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "NZ Beef — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  // MLS vs THEM
  const rowIds: string[] = [];
  for (const r of [
    { h: `${P}-cmp-1`, mls: "Fresh Meat", them: "Fresh Meat" },
    { h: `${P}-cmp-2`, mls: "No smell", them: "Bad smell" },
    { h: `${P}-cmp-3`, mls: "Eco-friendly Packaging", them: "Plastic Bags" },
    { h: `${P}-cmp-4`, mls: "Clean & Hygienic Stores", them: "Unhygienic Stores" },
    { h: `${P}-cmp-5`, mls: "Fast Delivery", them: "The convenience" },
  ]) {
    const id = await upsertEntry("mls_comparison_row", r.h, [
      { key: "name", value: `NZ Beef — ${r.mls}` },
      { key: "mls_label", value: r.mls }, { key: "them_label", value: r.them },
      { key: "mls_has", value: "true" }, { key: "them_has", value: "false" },
    ]);
    if (id) rowIds.push(id);
  }
  const comparisonId = await upsertEntry("mls_section_comparison", `${P}-comparison`, [
    { key: "name", value: "NZ Beef — MLS vs THEM" },
    { key: "us_label", value: "MLS" }, { key: "them_label", value: "THEM" },
    { key: "rows", value: JSON.stringify(rowIds) },
  ]);

  // Reviews (shared carousel testimonials)
  const reviewsId = await seedReviewsSection(P, "NZ Beef");

  // Promo banner — Easy on the pocket
  const promoId = await upsertEntry("mls_section_promo_banner", `${P}-promo`, [
    { key: "name", value: "NZ Beef — Easy on the Pocket Promo" },
    { key: "heading", value: "Easy on the pocket, hard on the flavor!" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
  ]);

  // Media showcase — Take a look at pure goodness (3 images)
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "NZ Beef — Goodness image 1" },
    { h: `${P}-media-2`, name: "NZ Beef — Goodness image 2" },
    { h: `${P}-media-3`, name: "NZ Beef — Goodness image 3" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "NZ Beef — Take a Look at Pure Goodness" },
    { key: "heading", value: "Take a look at pure goodness" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  // Product grid — Fresh New Zealand Beef in best prices
  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "NZ Beef — Fresh NZ Beef in Best Prices" },
    { key: "heading", value: "Fresh New Zealand Beef in best prices" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "48" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  const sectionIds = [heroId, iconsId, comparisonId, reviewsId, promoId, showcaseId, gridId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "New Zealand Grass-Fed Beef (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Fresh New Zealand Grass-Fed Beef — MLS Oman" },
    { key: "seo_description", value: "Stop buying old, frozen beef. Fresh New Zealand grass-fed beef at the best prices, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 4: Australian Grass-Fed Beef ─────────────────────────────────────────
async function seedAusBeef() {
  const P = "aus-beef";
  const PAGE = "australian-grass-fed-beef";
  const COLL = "australian-grass-fed-beef";
  console.log(`\n=== Seeding page: ${PAGE} ===`);

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "AUS Beef — Hero" },
    { key: "heading", value: "Upgrade to Fresh, Grass-Fed Australian Beef! Say No to Frozen Imports!" },
    { key: "subheading", value: "Get 8x Beef Ribeye Steaks for as low as OMR 13.000!" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "100% free returns & replacements because you deserve only the best!" },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "AUS Beef — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "AUS Beef — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "AUS Beef — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "AUS Beef — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "AUS Beef — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  // Media showcase — Take a Look at Pure Goodness (3 items)
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "AUS Beef — Goodness image 1" },
    { h: `${P}-media-2`, name: "AUS Beef — Goodness image 2" },
    { h: `${P}-media-3`, name: "AUS Beef — Goodness image 3" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "AUS Beef — Take a Look at Pure Goodness" },
    { key: "heading", value: "Take a Look at Pure Goodness" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  // Reviews (shared carousel)
  const reviewsId = await seedReviewsSection(P, "AUS Beef");

  // MLS vs THEM
  const rowIds: string[] = [];
  for (const r of [
    { h: `${P}-cmp-1`, mls: "Fresh Meat", them: "Fresh Meat" },
    { h: `${P}-cmp-2`, mls: "No smell", them: "Bad smell" },
    { h: `${P}-cmp-3`, mls: "Eco-friendly Packaging", them: "Plastic Bags" },
    { h: `${P}-cmp-4`, mls: "Clean & Hygienic Stores", them: "Unhygienic Stores" },
    { h: `${P}-cmp-5`, mls: "Fast Delivery", them: "The convenience" },
  ]) {
    const id = await upsertEntry("mls_comparison_row", r.h, [
      { key: "name", value: `AUS Beef — ${r.mls}` },
      { key: "mls_label", value: r.mls }, { key: "them_label", value: r.them },
      { key: "mls_has", value: "true" }, { key: "them_has", value: "false" },
    ]);
    if (id) rowIds.push(id);
  }
  const comparisonId = await upsertEntry("mls_section_comparison", `${P}-comparison`, [
    { key: "name", value: "AUS Beef — MLS vs THEM" },
    { key: "us_label", value: "MLS" }, { key: "them_label", value: "THEM" },
    { key: "rows", value: JSON.stringify(rowIds) },
  ]);

  // Product grid — Fresh Australian Grass-Fed Beef
  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "AUS Beef — Fresh Australian Grass-Fed Beef" },
    { key: "heading", value: "FRESH AUSTRALIAN GRASS-FED BEEF" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "48" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  const sectionIds = [heroId, iconsId, showcaseId, reviewsId, comparisonId, gridId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Australian Grass-Fed Beef (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Fresh Australian Grass-Fed Beef — MLS Oman" },
    { key: "seo_description", value: "Upgrade to fresh, grass-fed Australian beef. Say no to frozen imports. Delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 5: Australian Wagyu Beef ─────────────────────────────────────────────
async function seedWagyu() {
  const P = "wagyu";
  const PAGE = "australian-wagyu-beef";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Australian Wagyu Beef");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Wagyu — Hero" },
    { key: "heading", value: "Unmatched Flavor, Pure Luxury" },
    { key: "subheading", value: "Aus Wagyu Beef 125gm x 2 for just OMR 2.880!" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Wagyu — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Wagyu — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "Wagyu — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "Wagyu — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Wagyu — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Wagyu — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Media showcase — Experience the luxury from farm to your fork (3 images)
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "Wagyu — Luxury image 1" },
    { h: `${P}-media-2`, name: "Wagyu — Luxury image 2" },
    { h: `${P}-media-3`, name: "Wagyu — Luxury image 3" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "Wagyu — Farm to Fork" },
    { key: "heading", value: "Experience the luxury from farm to your fork" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Wagyu");

  // Promo banner — Your luxurious meat experience awaits you
  const promoId = await upsertEntry("mls_section_promo_banner", `${P}-promo`, [
    { key: "name", value: "Wagyu — Luxurious Experience Promo" },
    { key: "heading", value: "Your luxurious meat experience awaits you" },
    { key: "button_text", value: "Watch How We Pack It" },
    { key: "button_url", value: "#products" },
  ]);

  // Card grid (overlay style) — MLS Australian Wagyu Beef → MB 4/5, 6/7, 8/9
  const wagyuCardIds: string[] = [];
  for (const c of [
    { h: `${P}-card-45`, label: "AUS Wagyu Beef MB 4/5", coll: "australian-wagyu-beef-mb-4-5" },
    { h: `${P}-card-67`, label: "AUS Wagyu Beef MB 6/7", coll: "australian-wagyu-beef-mb-6-7" },
    { h: `${P}-card-89`, label: "AUS Wagyu Beef MB 8/9", coll: "australian-wagyu-beef-mb-8-9" },
  ]) {
    const id = await upsertEntry("mls_card_item", c.h, [
      { key: "name", value: `Wagyu — Card: ${c.label}` },
      { key: "label", value: c.label },
      { key: "link", value: `/collections/${c.coll}` },
      { key: "button_text", value: "View Collection" },
    ]);
    if (id) wagyuCardIds.push(id);
  }
  const cardGridId = await upsertEntry("mls_section_card_grid", `${P}-mb-cards`, [
    { key: "name", value: "Wagyu — MLS Australian Wagyu Beef (MB cards)" },
    { key: "heading", value: "MLS Australian Wagyu Beef" },
    { key: "style", value: "overlay" },
    { key: "cards", value: JSON.stringify(wagyuCardIds) },
  ]);

  // 3 product carousels — one per marbling score
  const carouselIds: string[] = [];
  for (const c of [
    { h: `${P}-carousel-45`, heading: "Australian Wagyu Beef MB 4/5", coll: "australian-wagyu-beef-mb-4-5" },
    { h: `${P}-carousel-67`, heading: "Australian Wagyu Beef MB 6/7", coll: "australian-wagyu-beef-mb-6-7" },
    { h: `${P}-carousel-89`, heading: "Australian Wagyu Beef MB 8/9", coll: "australian-wagyu-beef-mb-8-9" },
  ]) {
    const gid = await collGid(c.coll);
    const fields: { key: string; value: string }[] = [
      { key: "name", value: `Wagyu — Carousel: ${c.heading}` },
      { key: "heading", value: c.heading },
      { key: "layout", value: "carousel" },
      { key: "max_products", value: "12" },
      { key: "show_view_all", value: "true" },
    ];
    if (gid) fields.push({ key: "collection", value: gid });
    const id = await upsertEntry("mls_section_product_carousel", c.h, fields);
    if (id) carouselIds.push(id);
  }

  const sectionIds = [heroId, iconsId, messageId, showcaseId, reviewsId, promoId, cardGridId, ...carouselIds].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Australian Wagyu Beef (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "MLS Australian Wagyu Beef — MLS Oman" },
    { key: "seo_description", value: "Unmatched flavor, pure luxury. Fresh Australian Wagyu beef from marbling score 4/5 to 8/9, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 6: Australian Black Angus Beef ───────────────────────────────────────
async function seedAngus() {
  const P = "angus";
  const PAGE = "australian-black-angus-beef";
  const COLL = "australian-black-angus-beef";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Australian Black Angus Beef");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Angus — Hero" },
    { key: "heading", value: "Tender, Juicy & Flavorful" },
    { key: "subheading", value: "MLS brings pure Australian Black Angus beef for genuine meat lovers." },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "First retailer in Oman to deliver fresh Angus beef from Australia within 1 hour." },
  ]);

  // Awards — MLS brings award-winning Angus beef
  const awardIds: string[] = [];
  for (const a of [
    { h: `${P}-award-1`, caption: "2019 World Steak Challenge" },
    { h: `${P}-award-2`, caption: "Australian Beef Farmer of the Year" },
    { h: `${P}-award-3`, caption: "World Steak Challenge" },
  ]) {
    const id = await upsertEntry("mls_award_item", a.h, [{ key: "name", value: `Angus — Award: ${a.caption}` }, { key: "caption", value: a.caption }]);
    if (id) awardIds.push(id);
  }
  const awardsId = await upsertEntry("mls_section_awards", `${P}-awards`, [
    { key: "name", value: "Angus — Award-Winning Badges" },
    { key: "heading", value: "MLS brings award-winning Angus beef to your plate" },
    { key: "subheading", value: "Sourced from Rosedale Farms in Australia" },
    { key: "items", value: JSON.stringify(awardIds) },
  ]);

  // Feature panel — Things You Need To Know
  const pointIds: string[] = [];
  for (const pt of [
    { h: `${P}-pt-1`, title: "Quality", body: "High-quality beef that comes from black angus cattle raised in Australia." },
    { h: `${P}-pt-2`, title: "Freshly Imported", body: "MLS imports it fresh and chilled by air shipment, which helps to ensure that the meat stays fresh and maintains its quality during transportation." },
    { h: `${P}-pt-3`, title: "Nutrition", body: "Rich source of protein, almost too good to be true for your muscles." },
    { h: `${P}-pt-4`, title: "Grain-fed 150+ days", body: "Grain-fed for over 150 days, which helps to produce meat that is tender, juicy, and full of flavor." },
    { h: `${P}-pt-5`, title: "Popular Cuts", body: "We offer popular cuts like ribeye, sirloin, and tenderloin, which can be cooked in a variety of ways to suit different tastes and preferences." },
  ]) {
    const id = await upsertEntry("mls_panel_point", pt.h, [
      { key: "name", value: `Angus — Point: ${pt.title}` }, { key: "title", value: pt.title }, { key: "body", value: pt.body },
    ]);
    if (id) pointIds.push(id);
  }
  const panelId = await upsertEntry("mls_section_feature_panel", `${P}-panel`, [
    { key: "name", value: "Angus — Things You Need To Know" },
    { key: "heading", value: "Things You Need To Know" },
    { key: "intro", value: "From boneless to bone-in, from quality to the ultimate beef experience, MLS got you covered! So why settle for less? Treat your tastebuds to the finest beef on the market." },
    { key: "button_text", value: "Order Now" },
    { key: "button_url", value: "#products" },
    { key: "points", value: JSON.stringify(pointIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Angus — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Angus — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Angus — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "Angus — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "Angus — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Angus — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  // Media showcase — Savor the flavors (1 image)
  const mediaId = await upsertEntry("mls_media_item", `${P}-media-1`, [{ key: "name", value: "Angus — Savor image 1" }]);
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "Angus — Savor the Flavors" },
    { key: "heading", value: "Savor the flavors - Presenting MLS Black Angus beef" },
    { key: "subheading", value: "From pasture to your plate, discover the journey of premium MLS Australian Angus beef and get ready to savor every bite." },
    { key: "items", value: JSON.stringify([mediaId].filter(Boolean)) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Angus");

  // MLS vs THEM
  const rowIds: string[] = [];
  for (const r of [
    { h: `${P}-cmp-1`, mls: "Fresh Meat", them: "Fresh Meat" },
    { h: `${P}-cmp-2`, mls: "No smell", them: "Bad smell" },
    { h: `${P}-cmp-3`, mls: "Eco-friendly Packaging", them: "Plastic Bags" },
    { h: `${P}-cmp-4`, mls: "Clean & Hygienic Stores", them: "Unhygienic Stores" },
    { h: `${P}-cmp-5`, mls: "Fast Delivery", them: "The convenience" },
  ]) {
    const id = await upsertEntry("mls_comparison_row", r.h, [
      { key: "name", value: `Angus — ${r.mls}` },
      { key: "mls_label", value: r.mls }, { key: "them_label", value: r.them },
      { key: "mls_has", value: "true" }, { key: "them_has", value: "false" },
    ]);
    if (id) rowIds.push(id);
  }
  const comparisonId = await upsertEntry("mls_section_comparison", `${P}-comparison`, [
    { key: "name", value: "Angus — MLS vs THEM" },
    { key: "us_label", value: "MLS" }, { key: "them_label", value: "THEM" },
    { key: "rows", value: JSON.stringify(rowIds) },
  ]);

  // Product grid
  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "Angus — Shop Your Favourite Cuts" },
    { key: "heading", value: "Shop Your Favourite MLS Angus Beef Cuts" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "48" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  const sectionIds = [heroId, awardsId, panelId, messageId, iconsId, showcaseId, reviewsId, comparisonId, gridId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Australian Black Angus Beef (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Australian Black Angus Beef — MLS Oman" },
    { key: "seo_description", value: "Tender, juicy, flavorful Australian Black Angus beef. Award-winning, grain-fed 150+ days, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 7: US Angus Beef ─────────────────────────────────────────────────────
async function seedUsAngus() {
  const P = "us-angus";
  const PAGE = "us-angus-beef";
  const COLL = "us-choice-black-angus-beef";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "US Angus Beef");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "US Angus — Hero" },
    { key: "heading", value: "Classic American Flavor" },
    { key: "subheading", value: "US Angus Beef Striploin Steak 250gm for just 4.00 OMR!" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "US Angus — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "US Angus — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "US Angus — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "US Angus — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "US Angus — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "US Angus — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const rowIds: string[] = [];
  for (const r of [
    { h: `${P}-cmp-1`, mls: "Fresh Meat", them: "Fresh Meat" },
    { h: `${P}-cmp-2`, mls: "No smell", them: "Bad smell" },
    { h: `${P}-cmp-3`, mls: "Eco-friendly Packaging", them: "Plastic Bags" },
    { h: `${P}-cmp-4`, mls: "Clean & Hygienic Stores", them: "Unhygienic Stores" },
    { h: `${P}-cmp-5`, mls: "Fast Delivery", them: "The convenience" },
  ]) {
    const id = await upsertEntry("mls_comparison_row", r.h, [
      { key: "name", value: `US Angus — ${r.mls}` },
      { key: "mls_label", value: r.mls }, { key: "them_label", value: r.them },
      { key: "mls_has", value: "true" }, { key: "them_has", value: "false" },
    ]);
    if (id) rowIds.push(id);
  }
  const comparisonId = await upsertEntry("mls_section_comparison", `${P}-comparison`, [
    { key: "name", value: "US Angus — MLS vs THEM" },
    { key: "us_label", value: "MLS" }, { key: "them_label", value: "THEM" },
    { key: "rows", value: JSON.stringify(rowIds) },
  ]);

  // Media showcase — US Angus goodness in visuals (3 images)
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "US Angus — Visual 1" },
    { h: `${P}-media-2`, name: "US Angus — Visual 2" },
    { h: `${P}-media-3`, name: "US Angus — Visual 3" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "US Angus — Goodness in Visuals" },
    { key: "heading", value: "US Angus goodness in visuals" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  const reviewsId = await seedReviewsSection(P, "US Angus");

  const promoId = await upsertEntry("mls_section_promo_banner", `${P}-promo`, [
    { key: "name", value: "US Angus — Classic Flavorful Fresh Promo" },
    { key: "heading", value: "Classic, flavorful & fresh" },
    { key: "button_text", value: "Watch How We Pack It" },
    { key: "button_url", value: "#products" },
  ]);

  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "US Angus — Explore US Angus in Best Prices" },
    { key: "heading", value: "Explore US Angus in best prices" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "48" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  const sectionIds = [heroId, iconsId, messageId, comparisonId, showcaseId, reviewsId, promoId, gridId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "US Angus Beef (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "US Angus Beef — Classic American Flavor — MLS Oman" },
    { key: "seo_description", value: "Classic American flavor. Premium US Angus beef at the best prices, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 8: Dry-Aged Beef (DARK theme) ────────────────────────────────────────
async function seedDryAged() {
  const P = "dry-aged";
  const PAGE = "dry-aged";
  const COLL = "dry-aged-beef-and-lamb";
  console.log(`\n=== Seeding page: ${PAGE} (dark) ===`);
  await ensurePage(PAGE, "Dry Aged");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Dry-Aged — Hero" },
    { key: "heading", value: "OMAN'S FIRST: TASTE MLS DRY-AGED PERFECTION" },
    { key: "subheading", value: "Introducing Dry-Aged meat for the first time in Oman, where meat ages with flavor." },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Feature cards — Rich Flavour / Tender Texture / Culinary Versatility
  const featIds: string[] = [];
  for (const f of [
    { h: `${P}-feat-1`, title: "Rich Flavour", body: "Dry Aging intensifies the meat's natural flavours, resulting in a richer and more complex taste." },
    { h: `${P}-feat-2`, title: "Tender Texture", body: "The aging process naturally tenderizes the meat, making it incredibly juicy and easy to cut." },
    { h: `${P}-feat-3`, title: "Culinary Versatility", body: "Dry-aged meat can be prepared in various ways, from grilling and roasting to sous-vide cooking, allowing for diverse culinary experiences." },
  ]) {
    const id = await upsertEntry("mls_feature_item", f.h, [
      { key: "name", value: `Dry-Aged — Feature: ${f.title}` }, { key: "heading", value: f.title }, { key: "body", value: f.body },
    ]);
    if (id) featIds.push(id);
  }
  const featuresId = await upsertEntry("mls_section_feature_cards", `${P}-features`, [
    { key: "name", value: "Dry-Aged — Benefits Cards" },
    { key: "items", value: JSON.stringify(featIds) },
  ]);

  // Process — THE DRY-AGED PROCESS (video left + timeline)
  const stepIds: string[] = [];
  for (const s of [
    { h: `${P}-step-1`, label: "Days 0-7: The Promise", body: "In the first week, dry-aged meat begins its transformation." },
    { h: `${P}-step-2`, label: "Days 8-14: Flavor building", body: "Flavors intensify, with subtle nuttiness and sweetness." },
    { h: `${P}-step-3`, label: "Days 15-21: Culmination", body: "Tender, intense, and a spectrum of flavors." },
    { h: `${P}-step-4`, label: "Days 25-40: Peak Flavor", body: "Meat is ready — incredibly tender, with intense beefiness." },
  ]) {
    const id = await upsertEntry("mls_process_step", s.h, [
      { key: "name", value: `Dry-Aged — Step: ${s.label}` }, { key: "label", value: s.label }, { key: "body", value: s.body },
    ]);
    if (id) stepIds.push(id);
  }
  const processId = await upsertEntry("mls_section_process", `${P}-process`, [
    { key: "name", value: "Dry-Aged — The Dry-Aged Process" },
    { key: "heading", value: "THE DRY-AGED PROCESS" },
    { key: "intro", value: "At MLS, we're taking this timeless tradition to the next level, offering you a taste like no other." },
    { key: "steps", value: JSON.stringify(stepIds) },
  ]);

  // Product grid — LUXURY IN EVERY BITE
  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "Dry-Aged — Luxury In Every Bite" },
    { key: "heading", value: "LUXURY IN EVERY BITE" },
    { key: "subheading", value: "We carefully select our wide variety of high-quality meats and age them for 30-90 days to develop peak flavor and buttery texture, bringing you a true farm-to-table experience unlike any others. Shop now!" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "24" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  // Media showcase — For the first time in Oman (3 images)
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "Dry-Aged — Showcase 1" },
    { h: `${P}-media-2`, name: "Dry-Aged — Showcase 2" },
    { h: `${P}-media-3`, name: "Dry-Aged — Showcase 3" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "Dry-Aged — Explore Dry-Aged Perfection" },
    { key: "heading", value: "For the first time in Oman: Explore Dry-Aged Perfection at MLS" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  const sectionIds = [heroId, featuresId, processId, gridId, showcaseId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Dry-Aged Beef (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "theme", value: "dark" },
    { key: "seo_title", value: "MLS Dry-Aged Beef — Oman's First — MLS Oman" },
    { key: "seo_description", value: "Oman's first dry-aged perfection. Meat aged 30-90 days for rich flavor and buttery texture. Explore at MLS." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// Create 4 SHARED icon items (upload images to these once → every page's icons update) and repoint
// every existing mls_section_icons entry at them. Run via `--shared-icons`.
async function migrateSharedIcons() {
  console.log(`\n=== Shared icons migration ===`);
  const SHARED = [
    { h: "mls-shared-icon-delivery", name: "Shared Icon: 1HR Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: "mls-shared-icon-box", name: "Shared Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: "mls-shared-icon-hormone", name: "Shared Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: "mls-shared-icon-halal", name: "Shared Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ];
  const ids: Record<string, string> = {};
  for (const s of SHARED) {
    const id = await upsertEntry("mls_icon_item", s.h, [{ key: "name", value: s.name }, { key: "heading", value: s.heading }]);
    if (id) ids[s.h] = id;
  }
  // Map: which shared icons each section should show. Most pages have 4; some (beef/lamb/mishkak/
  // prime/signature/carcass) show 3 (no hormones). Detect by current item count and keep that many.
  const all = await gql<any>(`{ metaobjects(type:"mls_section_icons", first:50){ nodes{ id handle
    items: field(key:"items"){ references(first:10){ nodes{ ... on Metaobject { id } } } } } } }`);
  const four = [ids["mls-shared-icon-delivery"], ids["mls-shared-icon-box"], ids["mls-shared-icon-hormone"], ids["mls-shared-icon-halal"]].filter(Boolean);
  const three = [ids["mls-shared-icon-delivery"], ids["mls-shared-icon-box"], ids["mls-shared-icon-halal"]].filter(Boolean);
  let updated = 0;
  for (const sec of all?.metaobjects?.nodes ?? []) {
    if ((sec.handle as string)?.startsWith("mls-shared")) continue;
    const count = sec.items?.references?.nodes?.length ?? 4;
    const target = count <= 3 ? three : four;
    const res = await gql<any>(
      `mutation($id: ID!, $val: String!) {
         metaobjectUpdate(id: $id, metaobject: { fields: [{ key: "items", value: $val }] }) { userErrors { message } }
       }`,
      { id: sec.id, val: JSON.stringify(target) }
    );
    if (!(res?.metaobjectUpdate?.userErrors ?? []).length) updated++;
  }
  console.log(`✅  Repointed ${updated} icon sections at the 4 shared icon items.`);
  console.log(`   Now upload your 4 icon images to: mls-shared-icon-delivery/box/hormone/halal`);
  console.log(`   (Content → Metaobjects → "Landing · Icon Item" → each shared entry → Icon field.)`);
}

// Seed card items for a card-grid. country_code = flag fallback until an image is uploaded;
// collection = handle to link (seeded as a manual /collections/<h> link; adjust in admin if needed).
async function seedCards(prefix: string, cards: { label: string; collection?: string; code?: string }[]) {
  const ids: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const fields: { key: string; value: string }[] = [
      { key: "name", value: `${prefix.replace(/-/g, " ")} — ${c.label}` },
      { key: "label", value: c.label },
    ];
    if (c.code) fields.push({ key: "country_code", value: c.code });
    if (c.collection) fields.push({ key: "link", value: `/collections/${c.collection}` });
    const id = await upsertEntry("mls_card_item", `${prefix}-${i + 1}`, fields);
    if (id) ids.push(id);
  }
  return ids;
}

// ── Page 10: Lamb & Mutton Collection ─────────────────────────────────────────
async function seedLambCollection() {
  const P = "lamb-collection";
  const PAGE = "lamb-sub-collection";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Lamb Collection");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Lamb — Hero" },
    { key: "heading", value: "Experience the World's Finest MLS Lamb & Mutton Selection!" },
    { key: "subheading", value: "Fresh Mishkak offers starting from just 3.45 OMR!" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Lamb — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Lamb — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-halal`, name: "Lamb — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Lamb — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Lamb — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Reels (video showcase) — empty; upload in admin
  const reelsId = await upsertEntry("mls_section_reels", `${P}-reels`, [
    { key: "name", value: "Lamb — Reels" },
    { key: "heading", value: "MLS Reels" },
    { key: "eyebrow", value: "Watch & Shop" },
    { key: "reels", value: JSON.stringify([]) },
  ]);

  // Shop Lamb by Origin
  const originCardIds = await seedCards(`${P}-origin-card`, [
    { label: "Australian Mutton", collection: "fresh-australian-mutton", code: "au" },
    { label: "Australian Grass-Fed Lamb", collection: "australian-grass-fed-lamb", code: "au" },
    { label: "Freshly Slaughtered Australian Lamb", collection: "australian-grass-fed-lamb", code: "au" },
    { label: "New Zealand Grass-Fed Lamb", collection: "new-zealand-grass-fed-lamb", code: "nz" },
    { label: "Fresh Somali Lamb", collection: "somali-lamb", code: "so" },
    { label: "Fresh Pakistani Mutton", collection: "fresh-pakistani-mutton", code: "pk" },
    { label: "Fresh Indian Mutton", collection: "fresh-indian-mutton", code: "in" },
    { label: "Freshly Slaughtered Local Omani Lamb", collection: "bushra-lamb", code: "om" },
  ]);
  const originGridId = await upsertEntry("mls_section_card_grid", `${P}-origin-grid`, [
    { key: "name", value: "Lamb — Shop Lamb by Origin" },
    { key: "heading", value: "SHOP LAMB BY ORIGIN" },
    { key: "cards", value: JSON.stringify(originCardIds) },
  ]);

  // Shop Lamb by Cut
  const cutCardIds = await seedCards(`${P}-cut-card`, [
    { label: "Lamb Boneless Cubes", collection: "boneless-cubes" },
    { label: "Lamb Bone-In Cubes", collection: "bone-in-cubes" },
    { label: "Lamb Mince", collection: "mince" },
    { label: "Lamb Chops", collection: "chops" },
    { label: "Lamb Ribs", collection: "all-lamb" },
    { label: "Lamb Burgers", collection: "burgers" },
    { label: "Lamb Mishkak & Fondue", collection: "mishkak-and-fondue" },
    { label: "Lamb Shanks", collection: "all-lamb" },
    { label: "Whole Carcass", collection: "whole-carcass" },
    { label: "Seasoned Lamb", collection: "all-lamb" },
    { label: "Sausages", collection: "all-lamb" },
  ]);
  const cutGridId = await upsertEntry("mls_section_card_grid", `${P}-cut-grid`, [
    { key: "name", value: "Lamb — Shop Lamb by Cut" },
    { key: "heading", value: "SHOP LAMB BY CUT" },
    { key: "cards", value: JSON.stringify(cutCardIds) },
  ]);

  // Featured collection carousel
  const gid = await collGid("all-lamb");
  const carFields: { key: string; value: string }[] = [
    { key: "name", value: "Lamb — Featured Collection" },
    { key: "heading", value: "Featured collection" },
    { key: "layout", value: "carousel" },
    { key: "show_view_all", value: "true" },
    { key: "max_products", value: "12" },
  ];
  if (gid) carFields.push({ key: "collection", value: gid });
  const carouselId = await upsertEntry("mls_section_product_carousel", `${P}-featured`, carFields);

  const sectionIds = [heroId, iconsId, messageId, reelsId, originGridId, cutGridId, carouselId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Lamb & Mutton Collection (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Lamb & Mutton Collection — MLS Oman" },
    { key: "seo_description", value: "The world's finest lamb & mutton, by origin and cut. Fresh Mishkak from 3.45 OMR, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 17: Signature Box ────────────────────────────────────────────────────
async function seedSignatureBox() {
  const P = "signature-box";
  const PAGE = "signature-box";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Signature Box");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Signature Box — Hero" },
    { key: "heading", value: "A fun way to get all the compliments" },
    { key: "subheading", value: "Peace of mind that you will host the best barbecue ever! Delivered fresh in 1 hour." },
    { key: "button_text", value: "Shop Signature Box" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Signature Box — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Signature Box — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-halal`, name: "Signature Box — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Signature Box — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Signature Box — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const reelsId = await upsertEntry("mls_section_reels", `${P}-reels`, [
    { key: "name", value: "Signature Box — MLS Experience Reels" },
    { key: "heading", value: "MLS Experience" },
    { key: "eyebrow", value: "Watch & Shop" },
    { key: "reels", value: JSON.stringify([]) },
  ]);

  // Benefits you will get — plain feature panel
  const pointIds: string[] = [];
  for (const pt of [
    { h: `${P}-pt-1`, body: "It contains fresh & 100% Halal meat. Mishkak, chops, steaks and chicken - it's the most perfect barbecue box." },
    { h: `${P}-pt-2`, body: "Fresh Australian lamb chops and mishkak for the beautiful barbecue experience." },
    { h: `${P}-pt-3`, body: "Fresh prime cuts of grass-fed beef for the perfect steak gathering." },
    { h: `${P}-pt-4`, body: "Everyday use fresh chicken main cuts." },
    { h: `${P}-pt-5`, body: "You save a fortune on your barbecue meat purchase and host the best party ever." },
  ]) {
    const id = await upsertEntry("mls_panel_point", pt.h, [{ key: "name", value: `Signature Box — Benefit ${pt.h}` }, { key: "body", value: pt.body }]);
    if (id) pointIds.push(id);
  }
  const benefitsId = await upsertEntry("mls_section_feature_panel", `${P}-benefits`, [
    { key: "name", value: "Signature Box — Benefits You Will Get" },
    { key: "variant", value: "plain" },
    { key: "heading", value: "Benefits you will get" },
    { key: "intro", value: "This box is curated with the finest meat collection." },
    { key: "points", value: JSON.stringify(pointIds) },
  ]);

  // 2 products: main box (tinted bg) + a 2nd box (plain bg). Swap the 2nd handle in admin as needed.
  const prodGids = await productGids(["mls-signature-box-12kg", "mls-eid-barbeque-box-4kg"]);
  const featuredId = await upsertEntry("mls_section_featured_products", `${P}-featured`, [
    { key: "name", value: "Signature Box — MLS Signature Box 12kg" },
    { key: "products", value: JSON.stringify(prodGids) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Signature Box");

  const sectionIds = [heroId, iconsId, messageId, reelsId, benefitsId, featuredId, reviewsId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Signature Box (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "MLS Signature Box — A Fun Way to Get All the Compliments — MLS Oman" },
    { key: "seo_description", value: "Host the best barbecue ever. The MLS Signature Box: premium lamb, beef & chicken curated for the perfect gathering, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 16: Prime Box ────────────────────────────────────────────────────────
async function seedPrimeBox() {
  const P = "prime-box";
  const PAGE = "prime-box";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Prime Box");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Prime Box — Hero" },
    { key: "heading", value: "A box which completes a home" },
    { key: "subheading", value: "A meat box for everyday meals or a party, the decision is yours!" },
    { key: "button_text", value: "Shop Prime Box" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Prime Box — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Prime Box — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-halal`, name: "Prime Box — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Prime Box — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Prime Box — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const reelsId = await upsertEntry("mls_section_reels", `${P}-reels`, [
    { key: "name", value: "Prime Box — MLS Experience Reels" },
    { key: "heading", value: "MLS Experience" },
    { key: "eyebrow", value: "Watch & Shop" },
    { key: "reels", value: JSON.stringify([]) },
  ]);

  // Benefits you will get — plain feature panel (image + green-check bullet list)
  const pointIds: string[] = [];
  for (const pt of [
    { h: `${P}-pt-1`, body: "It contains fresh & 100% Halal meat." },
    { h: `${P}-pt-2`, body: "All prime fresh beef steaks in one box." },
    { h: `${P}-pt-3`, body: "Everyday use fresh chicken main cuts in this box." },
    { h: `${P}-pt-4`, body: "You save a fortune on your meat purchases and daily meals because of this box." },
    { h: `${P}-pt-5`, body: "Beef Burgers and mince, top quality grass-fed beef included." },
  ]) {
    const id = await upsertEntry("mls_panel_point", pt.h, [{ key: "name", value: `Prime Box — Benefit ${pt.h}` }, { key: "body", value: pt.body }]);
    if (id) pointIds.push(id);
  }
  const benefitsId = await upsertEntry("mls_section_feature_panel", `${P}-benefits`, [
    { key: "name", value: "Prime Box — Benefits You Will Get" },
    { key: "variant", value: "plain" },
    { key: "heading", value: "Benefits you will get" },
    { key: "intro", value: "This box is curated with the finest meat collection." },
    { key: "points", value: JSON.stringify(pointIds) },
  ]);

  // Featured product — MLS Prime Box 10kg (single product; description = "THE BOX CONTAINS")
  // 2 products: main box (tinted bg) + a 2nd box (plain bg). Swap the 2nd handle in admin as needed.
  const prodGids = await productGids(["mls-prime-box-10kg", "mls-ramadan-box-4-5-kg"]);
  const featuredId = await upsertEntry("mls_section_featured_products", `${P}-featured`, [
    { key: "name", value: "Prime Box — MLS Prime Box 10kg" },
    { key: "products", value: JSON.stringify(prodGids) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Prime Box");

  const sectionIds = [heroId, iconsId, messageId, reelsId, benefitsId, featuredId, reviewsId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Prime Box (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "MLS Prime Box — A Box Which Completes a Home — MLS Oman" },
    { key: "seo_description", value: "A meat box for everyday meals or a party. The MLS Prime Box: fresh, Halal beef & chicken curated in one box, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 15: NOMU Collection (spices/rubs collab) ─────────────────────────────
async function seedNomu() {
  const P = "nomu";
  const PAGE = "nomu";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Nomu");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Nomu — Hero" },
    { key: "heading", value: "MLS x Nomu" },
    { key: "subheading", value: "Adding More Flavor to Our Fresh Meat" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Nomu — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Nomu — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "Nomu — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "Nomu — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Nomu — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  // What is Nomu? — plain feature panel (image + text + View Collection)
  const whatId = await upsertEntry("mls_section_feature_panel", `${P}-what`, [
    { key: "name", value: "Nomu — What is Nomu?" },
    { key: "variant", value: "plain" },
    { key: "heading", value: "WHAT IS NOMU?" },
    { key: "intro", value: "Nomu are one of SA's leading, independent food innovators. Their ever-expanding and award-winning range of quality spices & rubs collection is now available at MLS to add more flavor to our fresh meat." },
    { key: "button_text", value: "View Collection" },
    { key: "button_url", value: "/collections/rubs-and-grinders" },
  ]);

  const bannerId = await upsertEntry("mls_section_message", `${P}-banner`, [
    { key: "name", value: "Nomu — NOMU WITH MLS MEAT Banner" },
    { key: "message", value: "NOMU WITH MLS MEAT" },
  ]);

  // Media showcase — NOMU Rubs & Grinders / gift boxes (3 images)
  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "Nomu — Rubs & Grinders" },
    { h: `${P}-media-2`, name: "Nomu — For your MLS meat" },
    { h: `${P}-media-3`, name: "Nomu — Gift boxes" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "Nomu — NOMU with MLS Meat Showcase" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Nomu");

  // Product grid — Must-haves for delicious meals
  const gid = await collGid("rubs-and-grinders");
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "Nomu — Must-haves for Delicious Meals" },
    { key: "heading", value: "Must-haves for delicious meals" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "24" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  // Card grid (overlay) — Nomu Collection: Rubs / Grinders / Gift Boxes
  const cardIds: string[] = [];
  for (const c of [
    { h: `${P}-card-rubs`, label: "Nomu Rubs", coll: "nomu-rubs" },
    { h: `${P}-card-grinders`, label: "Nomu Grinders", coll: "nomu-grinders" },
    { h: `${P}-card-gift`, label: "Nomu Gift Boxes", coll: "nomu-gift-box" },
  ]) {
    const id = await upsertEntry("mls_card_item", c.h, [
      { key: "name", value: `Nomu — Card: ${c.label}` },
      { key: "label", value: c.label },
      { key: "link", value: `/collections/${c.coll}` },
      { key: "button_text", value: "View Collection" },
    ]);
    if (id) cardIds.push(id);
  }
  const cardGridId = await upsertEntry("mls_section_card_grid", `${P}-collection-cards`, [
    { key: "name", value: "Nomu — Nomu Collection Cards" },
    { key: "heading", value: "Nomu Collection" },
    { key: "eyebrow", value: "Elevate your dining experience with NOMU's exquisite range of spices, seasonings, and the essence of Giftyness, now within arm's reach at MLS." },
    { key: "style", value: "overlay" },
    { key: "cards", value: JSON.stringify(cardIds) },
  ]);

  const sectionIds = [heroId, iconsId, whatId, bannerId, showcaseId, reviewsId, gridId, cardGridId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "NOMU Collection (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "MLS x Nomu — Spices, Rubs & Grinders — MLS Oman" },
    { key: "seo_description", value: "MLS x Nomu. Award-winning South African spices, rubs & grinders to add more flavor to your fresh MLS meat. Now in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 14: Fresh Poultry / Chicken Collection ───────────────────────────────
async function seedPoultry() {
  const P = "poultry";
  const PAGE = "fresh-poultry";
  const COLL = "mls-fresh-poultry";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Fresh Poultry");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Poultry — Hero" },
    { key: "heading", value: "Buying fresh chicken in Oman is easy now." },
    { key: "subheading", value: "Delivered Fresh Within 1 Hour" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Poultry — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Poultry — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "Poultry — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "Poultry — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Poultry — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Poultry");

  const promoId = await upsertEntry("mls_section_promo_banner", `${P}-promo`, [
    { key: "name", value: "Poultry — Source of Protein Promo" },
    { key: "heading", value: "Have a look at your source of protein" },
    { key: "button_text", value: "Watch How We Pack It" },
    { key: "button_url", value: "#products" },
  ]);

  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "Poultry — Fresh Poultry Collection" },
    { key: "heading", value: "Fresh poultry collection" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "48" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "Poultry — Feast 1" },
    { h: `${P}-media-2`, name: "Poultry — Feast 2" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "Poultry — Feast Your Eyes" },
    { key: "heading", value: "Feast your eyes with fresh protein" },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  const sectionIds = [heroId, iconsId, reviewsId, promoId, gridId, showcaseId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Fresh Poultry / Chicken (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Buying Fresh Chicken in Oman — MLS Oman" },
    { key: "seo_description", value: "Buying fresh chicken in Oman is easy now. Fresh, hormone-free poultry delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 13: Mishkak Collection ───────────────────────────────────────────────
async function seedMishkak() {
  const P = "mishkak";
  const PAGE = "mls-mishkak";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "MLS Mishkak");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Mishkak — Hero" },
    { key: "heading", value: "Make the Most Perfect Mishkak at Home" },
    { key: "subheading", value: "Choose your fresh mishkak: cubes or skewered, seasoned or unseasoned, your decision!" },
    { key: "button_text", value: "Shop Mishkak" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Mishkak — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Mishkak — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-halal`, name: "Mishkak — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Mishkak — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Mishkak — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Feature panel (plain) — Whichever mishkak you want
  const pointIds: string[] = [];
  for (const pt of [
    { h: `${P}-pt-1`, body: "Fresh, ready, raw, or seasoned, in skewers or without skewers." },
    { h: `${P}-pt-2`, body: "Beef, Mutton, Lamb, Camel, and Chicken Mishkak." },
    { h: `${P}-pt-3`, body: "Save yourself from being stuck in long queues." },
    { h: `${P}-pt-4`, body: "We deliver within the same-day across Oman." },
  ]) {
    const id = await upsertEntry("mls_panel_point", pt.h, [{ key: "name", value: `Mishkak — Point ${pt.h}` }, { key: "body", value: pt.body }]);
    if (id) pointIds.push(id);
  }
  const panelId = await upsertEntry("mls_section_feature_panel", `${P}-mishkak-panel`, [
    { key: "name", value: "Mishkak — Whichever Mishkak You Want" },
    { key: "heading", value: "Whichever mishkak you want, we have them all." },
    { key: "variant", value: "plain" },
    { key: "points", value: JSON.stringify(pointIds) },
  ]);

  const reviewsId = await seedReviewsSection(P, "Mishkak");

  // Two product carousels
  const carouselIds: string[] = [];
  for (const c of [
    { h: `${P}-carousel-1`, heading: "Explore our one-in-all MLS Mishkak Collection", coll: "mishkak-and-fondue" },
    { h: `${P}-carousel-2`, heading: "Mishkak Barbecue Cubes", coll: "fondue-mishkak" },
  ]) {
    const gid = await collGid(c.coll);
    const fields: { key: string; value: string }[] = [
      { key: "name", value: `Mishkak — Carousel: ${c.heading}` },
      { key: "heading", value: c.heading },
      { key: "layout", value: "carousel" },
      { key: "max_products", value: "12" },
      { key: "show_view_all", value: "true" },
    ];
    if (gid) fields.push({ key: "collection", value: gid });
    const id = await upsertEntry("mls_section_product_carousel", c.h, fields);
    if (id) carouselIds.push(id);
  }

  const sectionIds = [heroId, iconsId, messageId, panelId, reviewsId, ...carouselIds].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Mishkak Collection (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Make the Most Perfect Mishkak at Home — MLS Oman" },
    { key: "seo_description", value: "Fresh mishkak — cubes or skewered, seasoned or unseasoned. Beef, mutton, lamb, camel & chicken mishkak, delivered fresh in Oman." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 12: Whole Lamb / Carcass Collection ──────────────────────────────────
async function seedWholeCarcass() {
  const P = "whole-carcass";
  const PAGE = "whole-carcass";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Whole Carcass");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Whole Carcass — Hero" },
    { key: "heading", value: "Fresh, Fast & Convenient" },
    { key: "subheading", value: "Your Whole Lamb shopping upgraded" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "Absolutely FREE - 500gm packet of Mince from fresh grass-fed New Zealand beef!" },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Whole Carcass — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Whole Carcass — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "Whole Carcass — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "Whole Carcass — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Whole Carcass — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Whole Carcass — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  const reviewsId = await seedReviewsSection(P, "Whole Carcass");

  const reelsId = await upsertEntry("mls_section_reels", `${P}-reels`, [
    { key: "name", value: "Whole Carcass — Reels" },
    { key: "heading", value: "Watch how we prepare your meat box" },
    { key: "eyebrow", value: "Watch & Shop" },
    { key: "reels", value: JSON.stringify([]) },
  ]);

  // Feature cards — Matchless Quality and Fine Cuts (4)
  const featIds: string[] = [];
  for (const f of [
    { h: `${P}-feat-1`, title: "Grass-Fed", body: "Goats and Lambs raised in Snofarholde." },
    { h: `${P}-feat-2`, title: "Locally Sourced", body: "Locally grass-fed in Oman." },
    { h: `${P}-feat-3`, title: "Complete Box", body: "The meat box will include liver and kidney (excluding head and trotters)." },
    { h: `${P}-feat-4`, title: "Generous Weight", body: "Somali whole carcass weighs 9-12kg, and Indian whole carcass weighs 9-12kg." },
  ]) {
    const id = await upsertEntry("mls_feature_item", f.h, [{ key: "name", value: `Whole Carcass — Feature: ${f.title}` }, { key: "heading", value: f.title }, { key: "body", value: f.body }]);
    if (id) featIds.push(id);
  }
  const featuresId = await upsertEntry("mls_section_feature_cards", `${P}-features`, [
    { key: "name", value: "Whole Carcass — Matchless Quality and Fine Cuts" },
    { key: "heading", value: "Matchless Quality and Fine Cuts" },
    { key: "items", value: JSON.stringify(featIds) },
  ]);

  // Available Cuts Options — crimson feature panel (banner) + a circle card grid of cut options
  const cutPanelId = await upsertEntry("mls_section_feature_panel", `${P}-cuts-panel`, [
    { key: "name", value: "Whole Carcass — Available Cuts Options (banner)" },
    { key: "heading", value: "Available Cuts Options" },
  ]);
  const cutCardIds = await seedCards(`${P}-cut-card`, [
    { label: "Whole Carcass", collection: "whole-carcass" },
    { label: "Half Carcass", collection: "whole-carcass" },
    { label: "6-way Cut", collection: "whole-carcass" },
    { label: "Bone-in Cubes", collection: "bone-in-cubes" },
  ]);
  const cutGridId = await upsertEntry("mls_section_card_grid", `${P}-cut-grid`, [
    { key: "name", value: "Whole Carcass — Cut Options Cards" },
    { key: "cards", value: JSON.stringify(cutCardIds) },
  ]);

  // Featured products — MLS Farm Fresh Collection (carcass products)
  const prodGids = await productGids([
    "ind-mutton-whole-carcass-9-kg",
    "somali-lamb-in-a-box-whole-carcass-11-kg",
    "somali-lamb-in-a-box-whole-carcass-9-kg",
    "somali-goat-in-a-box-whole-carcass-11kg",
    "australian-lamb-in-a-box-whole-carcass-18-kg",
  ]);
  const featuredId = await upsertEntry("mls_section_featured_products", `${P}-featured`, [
    { key: "name", value: "Whole Carcass — MLS Farm Fresh Collection" },
    { key: "heading", value: "MLS Farm Fresh Collection" },
    { key: "products", value: JSON.stringify(prodGids) },
  ]);

  // Money-back guarantee — plain feature panel (image + text + CTA)
  const guaranteeId = await upsertEntry("mls_section_feature_panel", `${P}-guarantee`, [
    { key: "name", value: "Whole Carcass — Money-back Guarantee" },
    { key: "variant", value: "plain" },
    { key: "heading", value: "100% Money-back Guarantee" },
    { key: "intro", value: "We understand the trust issues while buying fresh meat online, hence we promise free replacements and returns." },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
  ]);

  const sectionIds = [heroId, iconsId, messageId, reviewsId, reelsId, featuresId, cutPanelId, cutGridId, featuredId, guaranteeId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Whole Lamb / Carcass (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Whole Lamb & Carcass — Fresh, Fast & Convenient — MLS Oman" },
    { key: "seo_description", value: "Your whole lamb shopping upgraded. Fresh whole carcass — lamb, goat, mutton — delivered fresh in Oman with a 100% money-back guarantee." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// ── Page 11: Australian Lamb ──────────────────────────────────────────────────
async function seedAusLamb() {
  const P = "aus-lamb";
  const PAGE = "australian-lamb-lp";
  const COLL = "australian-grass-fed-lamb";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Australian Lamb LP");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "AUS Lamb — Hero" },
    { key: "heading", value: "Savor Australia's Finest Lamb at MLS" },
    { key: "subheading", value: "Fresh AUS Lamb Mince 250gm for as low as 1.60 OMR!" },
    { key: "button_text", value: "Shop Now" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "Winner of Oman's Most Trusted Meat Brand Award - 2023" },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "AUS Lamb — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "AUS Lamb — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-hormone`, name: "AUS Lamb — Icon: Hormones Free", heading: "HORMONES FREE" },
    { h: `${P}-icon-halal`, name: "AUS Lamb — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "AUS Lamb — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const reviewsId = await seedReviewsSection(P, "AUS Lamb");

  const promoId = await upsertEntry("mls_section_promo_banner", `${P}-promo`, [
    { key: "name", value: "AUS Lamb — Fresh Lamb Prepared Promo" },
    { key: "heading", value: "YOUR FRESH LAMB BEING PREPARED FOR YOU" },
    { key: "button_text", value: "Watch How We Pack It" },
    { key: "button_url", value: "#products" },
  ]);

  const gid = await collGid(COLL);
  const gridFields: { key: string; value: string }[] = [
    { key: "name", value: "AUS Lamb — Explore Fresh Australian Lamb" },
    { key: "heading", value: "Explore Fresh Australian Lamb in Best Prices" },
    { key: "layout", value: "grid" },
    { key: "max_products", value: "60" },
    { key: "show_view_all", value: "true" },
  ];
  if (gid) gridFields.push({ key: "collection", value: gid });
  const gridId = await upsertEntry("mls_section_product_carousel", `${P}-grid`, gridFields);

  const mediaIds: string[] = [];
  for (const m of [
    { h: `${P}-media-1`, name: "AUS Lamb — Flavors 1" },
    { h: `${P}-media-2`, name: "AUS Lamb — Flavors 2" },
    { h: `${P}-media-3`, name: "AUS Lamb — Flavors 3" },
  ]) {
    const id = await upsertEntry("mls_media_item", m.h, [{ key: "name", value: m.name }]);
    if (id) mediaIds.push(id);
  }
  const showcaseId = await upsertEntry("mls_section_media_showcase", `${P}-showcase`, [
    { key: "name", value: "AUS Lamb — Savor the Flavors" },
    { key: "heading", value: "Savor the Flavors - Presenting MLS Australian Lamb" },
    { key: "subheading", value: "From farm to your table, discover the journey of our premium Lamb collection." },
    { key: "items", value: JSON.stringify(mediaIds) },
  ]);

  const sectionIds = [heroId, iconsId, reviewsId, promoId, gridId, showcaseId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Australian Lamb (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "Savor Australia's Finest Lamb — MLS Oman" },
    { key: "seo_description", value: "Australia's finest lamb at MLS. Fresh AUS lamb mince from 1.60 OMR, delivered fresh in Oman. Winner of Oman's Most Trusted Meat Brand 2023." },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// Helper: resolve product handles → GIDs (product_reference list needs GIDs).
async function productGids(handles: string[]): Promise<string[]> {
  const q = handles.map((h) => `handle:${h}`).join(" OR ");
  const r = await gql<any>(`{ products(first:${handles.length}, query:${JSON.stringify(q)}){ nodes{ id handle } } }`);
  const byHandle = new Map((r?.products?.nodes ?? []).map((n: any) => [n.handle, n.id]));
  return handles.map((h) => byHandle.get(h)).filter(Boolean) as string[];
}

// ── Page 9: Beef Brisket ──────────────────────────────────────────────────────
async function seedBrisket() {
  const P = "brisket";
  const PAGE = "brisket";
  console.log(`\n=== Seeding page: ${PAGE} ===`);
  await ensurePage(PAGE, "Brisket");

  const heroId = await upsertEntry("mls_section_hero", `${P}-hero`, [
    { key: "name", value: "Brisket — Hero" },
    { key: "heading", value: "The art of beef brisket in Oman" },
    { key: "subheading", value: "Your search for that perfect brisket cut ends here. Happy smoking!" },
    { key: "button_text", value: "Shop Brisket" },
    { key: "button_url", value: "#products" },
    { key: "strip_text", value: "We offer 100% free replacements and free returns." },
  ]);

  const iconIds: string[] = [];
  for (const it of [
    { h: `${P}-icon-delivery`, name: "Brisket — Icon: Fresh Delivery", heading: "1HR FRESH DELIVERY" },
    { h: `${P}-icon-box`, name: "Brisket — Icon: Delivered in Fresh Box", heading: "DELIVERED IN FRESH BOX" },
    { h: `${P}-icon-halal`, name: "Brisket — Icon: Fresh & Halal", heading: "FRESH & HALAL" },
  ]) {
    const id = await upsertEntry("mls_icon_item", it.h, [{ key: "name", value: it.name }, { key: "heading", value: it.heading }]);
    if (id) iconIds.push(id);
  }
  const iconsId = await upsertEntry("mls_section_icons", `${P}-icons`, [
    { key: "name", value: "Brisket — MLS Experience Icons" },
    { key: "heading", value: "THE MLS EXPERIENCE" },
    { key: "items", value: JSON.stringify(iconIds) },
  ]);

  const messageId = await upsertEntry("mls_section_message", `${P}-message`, [
    { key: "name", value: "Brisket — Custom Requests Strip" },
    { key: "message", value: "For special requests or any customization in your meat, please mention in the notes in the cart." },
  ]);

  // Feature panel (plain variant) — Whichever mishkak you want
  const pointIds: string[] = [];
  for (const pt of [
    { h: `${P}-pt-1`, body: "When slow-cooked, brisket is incredibly tender and juicy." },
    { h: `${P}-pt-2`, body: "Either roast, grill, or smoke, brisket is a versatile cut for a variety of dishes." },
    { h: `${P}-pt-3`, body: "A good source of protein, which is important for building and repairing muscle." },
    { h: `${P}-pt-4`, body: "Brisket contains a high amount of monounsaturated fats, which improve heart health." },
    { h: `${P}-pt-5`, body: "Brisket is low in carbohydrates, making it a good choice for those following a low-carbohydrate diet." },
  ]) {
    const id = await upsertEntry("mls_panel_point", pt.h, [{ key: "name", value: `Brisket — Point ${pt.h}` }, { key: "body", value: pt.body }]);
    if (id) pointIds.push(id);
  }
  const panelId = await upsertEntry("mls_section_feature_panel", `${P}-mishkak`, [
    { key: "name", value: "Brisket — Whichever Mishkak You Want" },
    { key: "heading", value: "Whichever mishkak you want, we have them all." },
    { key: "variant", value: "plain" },
    { key: "points", value: JSON.stringify(pointIds) },
  ]);

  // Featured products — the 2 briskets from the screenshot
  const prodGids = await productGids(["australian-grain-fed-black-angus-brisket", "us-angus-beef-brisket"]);
  const featuredId = await upsertEntry("mls_section_featured_products", `${P}-featured`, [
    { key: "name", value: "Brisket — Featured Briskets" },
    { key: "products", value: JSON.stringify(prodGids) },
  ]);

  // Reviews — Testimonials
  const reviewsId = await seedReviewsSection(P, "Brisket");

  const sectionIds = [heroId, iconsId, messageId, panelId, featuredId, reviewsId].filter(Boolean) as string[];

  const pageId = await upsertEntry("mls_landing_page", `${P}-page`, [
    { key: "name", value: "Beef Brisket (Landing Page)" },
    { key: "handle_label", value: PAGE },
    { key: "seo_title", value: "The Art of Beef Brisket in Oman — MLS Oman" },
    { key: "seo_description", value: "Your search for the perfect brisket cut ends here. Premium AUS & US Angus brisket, delivered fresh in Oman. Happy smoking!" },
    { key: "sections", value: JSON.stringify(sectionIds) },
  ]);

  return { pageId, pageHandle: PAGE };
}

// Ensure a Shopify page with this handle exists (create it if missing).
async function ensurePage(handle: string, title: string) {
  const p = await gql<any>(`{ pages(first:1, query:"handle:${handle}"){ nodes{ id handle } } }`);
  if (p?.pages?.nodes?.[0]) return;
  console.log(`📄  Creating Shopify page: ${handle}`);
  const res = await gql<any>(
    `mutation($page: PageCreateInput!) { pageCreate(page: $page) { page { id handle } userErrors { field message } } }`,
    { page: { title, handle, isPublished: true, body: "" } }
  ).catch(() => null);
  const errs = res?.pageCreate?.userErrors ?? [];
  if (errs.length) console.warn("⚠️   pageCreate:", errs.map((e: any) => e.message).join("; "));
  else console.log(`✅  Created page ${handle}`);
}

// Set a Shopify page's custom.landing_page metafield to a landing metaobject.
async function linkPage(pageHandle: string, landingId: string) {
  const p = await gql<any>(`{ pages(first:1, query:"handle:${pageHandle}"){ nodes{ id handle } } }`);
  const page = p?.pages?.nodes?.[0];
  if (!page) { console.warn(`⚠️   No page "${pageHandle}" — assign the metafield manually to ${landingId}`); return; }
  const res = await gql<any>(
    `mutation($mf:[MetafieldsSetInput!]!){ metafieldsSet(metafields:$mf){ userErrors{ field message } } }`,
    { mf: [{ ownerId: page.id, namespace: "custom", key: "landing_page", type: "metaobject_reference", value: landingId }] }
  );
  const errs = res?.metafieldsSet?.userErrors ?? [];
  if (errs.length) console.warn("⚠️   link:", errs.map((e: any) => e.message).join("; "));
  else console.log(`✅  Linked page "${pageHandle}" → ${landingId}`);
}

// ── 5. Ensure the PAGE metafield definition exists (so it shows in admin for you to assign) ──
async function ensurePageMetafieldDefinition() {
  console.log(`\n=== Page metafield definition (custom.landing_page) ===`);
  const landingDefId = await getDefId("mls_landing_page");
  const res = await gql<any>(
    `mutation($def: MetafieldDefinitionInput!) {
       metafieldDefinitionCreate(definition: $def) { createdDefinition { id } userErrors { code message } }
     }`,
    {
      def: {
        name: "Landing Page",
        namespace: "custom",
        key: "landing_page",
        description: "Assign an MLS Landing Page design to render on this page.",
        type: "metaobject_reference",
        ownerType: "PAGE",
        access: { storefront: "PUBLIC_READ" },
        // A single metaobject_reference requires exactly one allowed definition id.
        validations: landingDefId ? [{ name: "metaobject_definition_id", value: landingDefId }] : [],
      },
    }
  ).catch(() => null);
  const err = res?.metafieldDefinitionCreate?.userErrors?.[0];
  if (err && !/taken|exist/i.test(err.message)) {
    console.warn(`⚠️   metafield definition: ${err.message}`);
  } else {
    console.log(`✅  custom.landing_page (Page metafield) ready to assign in admin.`);
  }
}

// Fix a field that was created as `url` → `single_line_text_field` (so relative paths / #anchors work).
// Shopify can't change type in place, and delete+create in one mutation collides, so do two mutations.
async function fixUrlFieldToText(type: string, key: string, name: string) {
  const defId = await getDefId(type);
  if (!defId) return;
  const def = await gql<any>(
    `{ metaobjectDefinitionByType(type: "${type}") { fieldDefinitions { key type { name } } } }`
  );
  const f = def?.metaobjectDefinitionByType?.fieldDefinitions?.find((x: any) => x.key === key);
  if (!f || f.type?.name === "single_line_text_field") return; // already correct
  console.log(`\n=== Fixing ${type}.${key} (url → text) ===`);
  const upd = (fieldDefs: string) =>
    gql<any>(
      `mutation($id: ID!) {
         metaobjectDefinitionUpdate(id: $id, definition: { fieldDefinitions: [${fieldDefs}] }) {
           metaobjectDefinition { id } userErrors { field message }
         }
       }`,
      { id: defId }
    );
  const del = await upd(`{ delete: { key: "${key}" } }`);
  const delErr = del?.metaobjectDefinitionUpdate?.userErrors ?? [];
  if (delErr.length) { console.warn("⚠️   delete:", delErr.map((e: any) => e.message).join("; ")); return; }
  const cre = await upd(`{ create: { key: "${key}", name: "${name}", type: "single_line_text_field" } }`);
  const creErr = cre?.metaobjectDefinitionUpdate?.userErrors ?? [];
  if (creErr.length) console.warn("⚠️   create:", creErr.map((e: any) => e.message).join("; "));
  else console.log(`✅  ${type}.${key} is now text.`);
}

// One-off: update the mls_section_hero `button_url` field from url → text if it was created as url.
async function fixHeroButtonUrlField() {
  const defId = await getDefId("mls_section_hero");
  if (!defId) return;
  const def = await gql<any>(
    `{ metaobjectDefinitionByType(type: "mls_section_hero") { fieldDefinitions { key type { name } } } }`
  );
  const f = def?.metaobjectDefinitionByType?.fieldDefinitions?.find((x: any) => x.key === "button_url");
  if (!f || f.type?.name === "single_line_text_field") return; // already correct
  console.log(`\n=== Fixing mls_section_hero.button_url (url → text) ===`);
  // Shopify can't change a field's type in place, and delete+create in ONE mutation collides
  // ("duplicates other inputs"). So do it in two separate mutations: delete, then re-create as text.
  const upd = (fieldDefs: string) =>
    gql<any>(
      `mutation($id: ID!) {
         metaobjectDefinitionUpdate(id: $id, definition: { fieldDefinitions: [${fieldDefs}] }) {
           metaobjectDefinition { id } userErrors { field message }
         }
       }`,
      { id: defId }
    );
  const del = await upd(`{ delete: { key: "button_url" } }`);
  const delErr = del?.metaobjectDefinitionUpdate?.userErrors ?? [];
  if (delErr.length) { console.warn("⚠️   delete:", delErr.map((e: any) => e.message).join("; ")); return; }
  const cre = await upd(`{ create: { key: "button_url", name: "Button URL or #anchor", type: "single_line_text_field" } }`);
  const creErr = cre?.metaobjectDefinitionUpdate?.userErrors ?? [];
  if (creErr.length) console.warn("⚠️   create:", creErr.map((e: any) => e.message).join("; "));
  else console.log("✅  button_url is now text (accepts #anchors / relative paths).");
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  await createDefinitions();
  await fixHeroButtonUrlField();
  await fixUrlFieldToText("mls_card_item", "link", "Manual Link or /path (optional, overrides Collection)");
  await fixUrlFieldToText("mls_media_item", "link", "Link or /path (optional)");
  // Add fields introduced after the product-carousel definition first shipped (page 1).
  await ensureFields("mls_section_product_carousel", [
    { key: "layout", name: "Layout: carousel or grid", typeName: "single_line_text_field" },
    { key: "subheading", name: "Subheading (optional)", typeName: "multi_line_text_field" },
  ]);
  // Card grid overlay variant (page 5 Wagyu MB cards).
  await ensureFields("mls_section_card_grid", [
    { key: "style", name: "Card Style: circle or overlay", typeName: "single_line_text_field" },
  ]);
  await ensureFields("mls_card_item", [
    { key: "button_text", name: "Button Text (overlay style, e.g. 'View Collection')", typeName: "single_line_text_field" },
  ]);
  // Page-level dark theme (page 8 dry-aged).
  await ensureFields("mls_landing_page", [
    { key: "theme", name: "Theme: light or dark", typeName: "single_line_text_field" },
  ]);
  // Feature panel: optional light/plain background (page 9 "Whichever mishkak" block).
  await ensureFields("mls_section_feature_panel", [
    { key: "variant", name: "Variant: panel (crimson) or plain (light image+text)", typeName: "single_line_text_field" },
  ]);
  await ensurePageMetafieldDefinition();
  if (DEFS_ONLY) {
    console.log("\n✨  Definitions ensured (--defs-only). Done.");
    return;
  }
  if (args.includes("--shared-icons")) {
    await migrateSharedIcons();
    return;
  }

  // --page beef-collection | sa-beef | all  (default: all)
  const which = PAGE_HANDLE === "beef-collection" && !process.argv.includes("--page") ? "all" : PAGE_HANDLE;

  if (which === "all" || which === "beef-collection") {
    const beefId = await seedBeefCollection();
    console.log(`\n➡️   beef-collection: assign page metafield "Landing Page" → ${beefId} (or it may already be set).`);
  }
  if (which === "all" || which === "sa-beef" || which === "south-african-grass-fed-beef") {
    const { pageId, pageHandle } = await seedSouthAfricanBeef();
    if (pageId) await linkPage(pageHandle, pageId); // auto-link since the page handle is known
  }
  if (which === "all" || which === "nz-beef" || which === "nz-grass-fed-beef") {
    const { pageId, pageHandle } = await seedNzBeef();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "aus-beef" || which === "australian-grass-fed-beef") {
    const { pageId, pageHandle } = await seedAusBeef();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "wagyu" || which === "australian-wagyu-beef") {
    const { pageId, pageHandle } = await seedWagyu();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "angus" || which === "australian-black-angus-beef") {
    const { pageId, pageHandle } = await seedAngus();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "us-angus" || which === "us-angus-beef") {
    const { pageId, pageHandle } = await seedUsAngus();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "dry-aged") {
    const { pageId, pageHandle } = await seedDryAged();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "brisket") {
    const { pageId, pageHandle } = await seedBrisket();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "lamb-collection" || which === "lamb-sub-collection") {
    const { pageId, pageHandle } = await seedLambCollection();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "aus-lamb" || which === "australian-lamb-lp") {
    const { pageId, pageHandle } = await seedAusLamb();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "whole-carcass") {
    const { pageId, pageHandle } = await seedWholeCarcass();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "mishkak" || which === "mls-mishkak") {
    const { pageId, pageHandle } = await seedMishkak();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "poultry" || which === "fresh-poultry") {
    const { pageId, pageHandle } = await seedPoultry();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "nomu") {
    const { pageId, pageHandle } = await seedNomu();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "prime-box") {
    const { pageId, pageHandle } = await seedPrimeBox();
    if (pageId) await linkPage(pageHandle, pageId);
  }
  if (which === "all" || which === "signature-box") {
    const { pageId, pageHandle } = await seedSignatureBox();
    if (pageId) await linkPage(pageHandle, pageId);
  }

  console.log("\n✨  Done. In Shopify admin: assign each section's images / collections / reels.");
  console.log("   (SA-beef product grid needs its Collection set to 'south-african-grass-fed-beef'.)");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

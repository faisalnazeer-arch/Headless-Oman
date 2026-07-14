import { lazy, Suspense } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, Await, useRouteError, isRouteErrorResponse } from "react-router";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";
import { useT } from "../i18n/strings";
import { HeroBanner } from "../components/home/HeroBanner";
import { TrustBadges } from "../components/home/TrustBadges";
import { FeaturedCollections } from "../components/home/FeaturedCollections";
import type { FeaturedCollectionCard } from "../components/home/FeaturedCollections";
import { parsePriceRangeSection, parsePriceTiles } from "../components/home/PriceRangeShop";
import { FirstOrderGift, parseFirstOrderGift } from "../components/home/FirstOrderGift";
import { PromoSideBySide, parsePromoSideBySide } from "../components/home/PromoSideBySide";
import { CategorySection } from "../components/home/CategorySection";
import { ShopByCategory, type CategorySectionData } from "../components/home/ShopByCategory";
import { ShopByCuts } from "../components/home/ShopByCuts";
import { ShopByOrigin, type OriginSectionData } from "../components/home/ShopByOrigin";
import { ValueBoxesBanner, type ValueBannerData } from "../components/home/ValueBoxesBanner";
import { RecentlyViewed } from "../components/home/RecentlyViewed";
const ReelsCarousel = lazy(() => import("../components/home/ReelsCarousel").then((m) => ({ default: m.ReelsCarousel })));
import { HomeBlogSection, type BlogArticle } from "../components/home/HomeBlogSection";
import { HomeReviews } from "../components/home/HomeReviews";
import { fetchJudgemeStoreReviews, fetchJudgemeShopStats } from "~/lib/judgeme";
import type { JudgemeReview } from "~/lib/judgeme";

// Single Storefront API query for all home page metaobjects.
// Uses @inContext so Translate & Adapt translations are served for Arabic.
const HOME_METAOBJECTS_QUERY = `#graphql
  query HomeMetaobjects($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    hero: metaobjects(type: "hero_banner", first: 10) {
      nodes { id fields { key value reference { ... on MediaImage { image { url altText width height } } } } }
    }
    badges: metaobjects(type: "icon_with_text", first: 10) {
      nodes { id handle fields { key value reference { ... on MediaImage { image { url altText } } } } }
    }
    priceRangeSection: metaobjects(type: "price_range_section", first: 1) {
      nodes { id fields { key value } }
    }
    priceTiles: metaobjects(type: "price_range_tile", first: 20) {
      nodes { id fields { key value reference { ... on MediaImage { image { url altText } } ... on Collection { id handle title } } } }
    }
    reelsSection: metaobjects(type: "reels_section", first: 1) {
      nodes { id fields { key value } }
    }
    reelItems: metaobjects(type: "reel_item", first: 20) {
      nodes { id fields { key value reference { ... on Product { id handle title featuredImage { url } } ... on Video { sources { url mimeType } previewImage { url } } } } }
    }
    promo: metaobjects(type: "promo_side_by_side", first: 1) {
      nodes { id fields { key value reference { ... on MediaImage { image { url altText } } } } }
    }
    valueBanner: metaobjects(type: "mls_value_banner", first: 1) {
      nodes { id fields { key value reference { ... on MediaImage { image { url altText } } } } }
    }
    collectionSection: metaobjects(type: "mls_collection_section", first: 1) {
      nodes { id fields { key value } }
    }
    origin: metaobjects(type: "mls_origin_section", first: 1) {
      nodes { id fields { key value references(first: 50) { nodes { ... on Metaobject { id handle fields { key value reference { ... on MediaImage { image { url altText } } } } } } } } }
    }
    category: metaobjects(type: "mls_category_section", first: 1) {
      nodes { id fields { key value references(first: 20) { nodes { ... on Metaobject { id fields { key value reference { ... on MediaImage { image { url altText } } } } } } } } }
    }
    cuts: metaobjects(type: "mls_cuts_section", first: 1) {
      nodes { id fields { key value references(first: 12) { nodes { ... on Metaobject { id fields { key value reference { ... on MediaImage { image { url altText } } } } } } } } }
    }
    featuredCollections: metaobjects(type: "featured_collection", first: 10) {
      nodes { id fields { key value reference { ... on Collection { handle title } } references(first: 10) { nodes { ... on Metaobject { id fields { key value reference { ... on Collection { handle title } } } } } } } }
    }
    featuredCollectionList: metaobjects(type: "featured_collection_list", first: 20) {
      nodes { id fields { key value reference { ... on MediaImage { image { url altText } } } } }
    }
    gift: metaobjects(type: "mls_first_order_gift", first: 1) {
      nodes { id fields { key value } }
    }
    saleSection: metaobjects(type: "mls_sale_section", first: 1) {
      nodes { id fields { key value reference { ... on Collection { handle title } } } }
    }
  }
` as const;

// Admin API queries — fallback for metaobject types that don't yet have Storefront API access.
// When a type has Storefront API access enabled, the HOME_METAOBJECTS_QUERY above takes over
// and serves translated content. Otherwise these ensure the sections always render.
const _imgF = `key value reference { ... on MediaImage { image { url altText } } }`;
const Q_HERO       = `{ nodes: metaobjects(type: "hero_banner", first: 10) { nodes { id fields { key value reference { ... on MediaImage { image { url altText width height } } } } } } }`;
const Q_BADGES     = `{ nodes: metaobjects(type: "icon_with_text", first: 10) { nodes { id handle fields { ${_imgF} } } } }`;
const Q_PRICE_SEC  = `{ nodes: metaobjects(type: "price_range_section", first: 1) { nodes { id fields { key value } } } }`;
const Q_PRICE_TILE = `{ nodes: metaobjects(type: "price_range_tile", first: 20) { nodes { id fields { key value reference { ... on MediaImage { image { url altText } } ... on Collection { id handle title } } } } } }`;
const Q_REELS_SEC  = `{ nodes: metaobjects(type: "reels_section", first: 1) { nodes { id fields { key value } } } }`;
const Q_REEL_ITEMS = `{ nodes: metaobjects(type: "reel_item", first: 20) { nodes { id fields { key value reference { ... on Product { id handle title featuredImage { url } } ... on Video { sources { url mimeType } preview { image { url } } } } } } } }`;
const Q_PROMO      = `{ nodes: metaobjects(type: "promo_side_by_side", first: 1) { nodes { id fields { ${_imgF} } } } }`;
const Q_VALUE      = `{ nodes: metaobjects(type: "mls_value_banner", first: 1) { nodes { id fields { ${_imgF} } } } }`;
const Q_COL_CFG    = `{ nodes: metaobjects(type: "mls_collection_section", first: 1) { nodes { id fields { key value } } } }`;
const Q_ORIGIN     = `{ nodes: metaobjects(type: "mls_origin_section", first: 1) { nodes { id fields { key value references(first: 50) { nodes { ... on Metaobject { id handle fields { ${_imgF} } } } } } } } }`;
const Q_CATEGORY   = `{ nodes: metaobjects(type: "mls_category_section", first: 1) { nodes { id fields { key value references(first: 20) { nodes { ... on Metaobject { id fields { ${_imgF} } } } } } } } }`;
const Q_CUTS       = `{ nodes: metaobjects(type: "mls_cuts_section", first: 1) { nodes { id fields { key value references(first: 12) { nodes { ... on Metaobject { id fields { key value reference { ... on MediaImage { image { url altText } } } } } } } } } } }`;
const Q_FEATURED   = `{ nodes: metaobjects(type: "featured_collection", first: 10) { nodes { id fields { key value reference { ... on Collection { handle title } } references(first: 10) { nodes { ... on Metaobject { id fields { key value reference { ... on Collection { handle title } } } } } } } } } }`;
const Q_COL_LIST   = `{ nodes: metaobjects(type: "featured_collection_list", first: 20) { nodes { id fields { ${_imgF} } } } }`;
const Q_GIFT       = `{ nodes: metaobjects(type: "mls_first_order_gift", first: 1) { nodes { id fields { key value } } } }`;
const Q_SALE_SEC   = `{ nodes: metaobjects(type: "mls_sale_section", first: 1) { nodes { id fields { key value reference { ... on Collection { handle title } } } } } }`;
// Home layout: one mls_home_layout metaobject with a `section_order` multi-line text field
// (one section key per line, in display order; omit a line or prefix with # to hide it).
const Q_HOME_LAYOUT = `{ nodes: metaobjects(type: "mls_home_layout", first: 1) { nodes { id fields { key value } } } }`;
// Storefront version — the layout drives which sections show/hide, so it MUST work on
// production regardless of the admin token. mls_home_layout has Storefront access, so we
// fetch it via the Storefront API (always available) instead of adminFetch (which returns
// empty and falls back to the default all-sections order when the admin token is missing).
const Q_HOME_LAYOUT_SF = `#graphql
  query HomeLayout {
    metaobjects(type: "mls_home_layout", first: 1) {
      nodes { id fields { key value } }
    }
  }
`;

// Storefront API query to batch-fetch correct presentment prices by product GID.
const REEL_PRODUCT_PRICES_QUERY = `#graphql
  query ReelProductPrices($ids: [ID!]!, $country: CountryCode)
  @inContext(country: $country) {
    nodes(ids: $ids) {
      ... on Product {
        id
        priceRange { minVariantPrice { amount currencyCode } }
      }
    }
  }
` as const;
const Q_BLOG_ARTICLES = `
  query HomeBlogArticles {
    blogs(first: 5) {
      nodes {
        handle
        articles(first: 6, sortKey: PUBLISHED_AT, reverse: true) {
          nodes {
            id handle title publishedAt excerpt
            image { url altText }
          }
        }
      }
    }
  }
`;

// ── Types ──────────────────────────────────────────────────────────────────

import type { ShopifyProduct, ReelProduct } from "../lib/shopify";
import { REELS_QUERY, COLLECTION_PRODUCTS_QUERY } from "../lib/shopify";

interface ReelsSectionConfig {
  subHeading: string;
  heading: string;
}

function parseReelsSectionConfig(nodes: any[]): ReelsSectionConfig {
  const node = nodes[0];
  if (!node) return { subHeading: "Watch & Shop", heading: "MLS Reels" };
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  return {
    subHeading: f["sub_heading"]?.value ?? f["label"]?.value ?? "Watch & Shop",
    heading: f["heading"]?.value ?? "MLS Reels",
  };
}

function parseReelItems(
  nodes: any[],
  priceMap: Record<string, { amount: string; currencyCode: string }> = {}
): ReelProduct[] {
  const reels: ReelProduct[] = [];
  for (const node of nodes) {
    const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
    const product = f["product"]?.reference;
    const video = f["video"]?.reference;
    // Allow video-only reels (no product). Skip only when there's nothing to show.
    if (!product && !video) continue;

    let videoUrl: string | null = null;
    let poster: string | null = product?.featuredImage?.url ?? null;

    if (video?.sources) {
      const mp4 = video.sources.find((s: any) => s.mimeType === "video/mp4") ?? video.sources[0];
      videoUrl = mp4?.url ?? null;
      // Storefront API uses previewImage.url; Admin API uses preview.image.url
      poster = video.previewImage?.url ?? video.preview?.image?.url ?? poster;
    }

    const price = (product && priceMap[product.id]) ?? { amount: "0", currencyCode: "OMR" };

    reels.push({
      id: node.id,
      title: product?.title ?? "",
      handle: product?.handle ?? "",
      price,
      poster,
      videoUrl,
      embedUrl: null,
      productImage: product?.featuredImage?.url ?? null,
    });
  }
  return reels;
}

interface CollectionTab {
  label: string;
  handle: string;
  title: string;
  position: number;
  products: ShopifyProduct[];
}

interface FeaturedCollectionEntry {
  id: string;
  handle: string;
  title: string;
  subTitle: string | undefined;
  products: ShopifyProduct[];
  tabs?: CollectionTab[];
}

interface FeaturedSection {
  title: string;
  subTitle: string | undefined;
  tabs: Array<{ label: string; handle: string; products: ShopifyProduct[] }>;
}

function parseFeaturedCollections(nodes: any[]): FeaturedCollectionEntry[] {
  return nodes
    .map((node) => {
      const fieldMap = Object.fromEntries(
        node.fields.map((f: any) => [f.key, f]),
      );
      const metaTitle = fieldMap["title"]?.value ?? null;
      const isHandleLike = metaTitle ? /^[a-z0-9-]+$/.test(metaTitle) : true;
      const subTitle = (fieldMap["sub_title"]?.value ?? undefined) as string | undefined;

      const tabNodes: any[] = fieldMap["tabs"]?.references?.nodes ?? [];
      if (tabNodes.length > 0) {
        const tabs: CollectionTab[] = tabNodes
          .map((tabNode: any) => {
            const tf = Object.fromEntries(tabNode.fields.map((f: any) => [f.key, f]));
            const col = tf["collection"]?.reference;
            if (!col?.handle) return null;
            return {
              label: (tf["label"]?.value ?? col.title ?? "Tab") as string,
              handle: col.handle as string,
              title: col.title as string,
              position: parseInt(tf["position"]?.value ?? "0", 10),
              products: [] as ShopifyProduct[],
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.position - b.position) as CollectionTab[];

        if (tabs.length > 0) {
          const primaryCol = fieldMap["collection"]?.reference;
          const primaryHandle = (primaryCol?.handle ?? tabs[0].handle) as string;
          const title = (!isHandleLike && metaTitle) ? metaTitle : (primaryCol?.title ?? tabs[0].title ?? "");
          return { id: node.id as string, handle: primaryHandle, title, subTitle, products: [] as ShopifyProduct[], tabs };
        }
      }

      const collection = fieldMap["collection"]?.reference;
      if (!collection?.handle) return null;
      const title = (!isHandleLike && metaTitle) ? metaTitle : (collection.title ?? "");
      return { id: node.id as string, handle: collection.handle as string, title, subTitle, products: [] as ShopifyProduct[] };
    })
    .filter((e): e is FeaturedCollectionEntry => e !== null);
}

function buildFeaturedSection(entries: FeaturedCollectionEntry[]): FeaturedSection | null {
  if (entries.length === 0) return null;
  // Section heading: use the first entry that has an explicit (non-handle-like) title
  const headingEntry = entries.find(e => e.title && !/^[a-z0-9-]+$/.test(e.title)) ?? entries[0];
  // Flatten all entries' tabs (or the entry itself) into one ordered tab list
  const tabs = entries.flatMap((entry) => {
    if (entry.tabs && entry.tabs.length > 0) {
      return entry.tabs.map((t) => ({ label: t.label, handle: t.handle, products: t.products }));
    }
    return [{ label: entry.title, handle: entry.handle, products: entry.products }];
  });
  return { title: headingEntry.title, subTitle: headingEntry.subTitle, tabs };
}

function parseFeaturedCollectionList(nodes: any[]): FeaturedCollectionCard[] {
  return nodes
    .map((node) => {
      const fieldMap = Object.fromEntries(node.fields.map((f: any) => [f.key, f]));
      const heading = (fieldMap["heading"]?.value ?? "") as string;
      if (!heading) return null;
      const card: FeaturedCollectionCard = {
        id: node.id as string,
        heading,
        subHeading: (fieldMap["sub_heading"]?.value ?? "") as string,
        url: (fieldMap["url"]?.value ?? "#") as string,
        imageUrl: (fieldMap["image"]?.reference?.image?.url ?? null) as string | null,
        imageAlt: (fieldMap["image"]?.reference?.image?.altText ?? "") as string,
      };
      return card;
    })
    .filter(Boolean) as FeaturedCollectionCard[];
}

function parseCategorySection(nodes: any[]): CategorySectionData | null {
  const node = nodes[0];
  if (!node) return null;
  const fm = Object.fromEntries(node.fields.map((f: any) => [f.key, f]));
  const items = (fm.items?.references?.nodes ?? []).map((item: any) => {
    const f = Object.fromEntries(item.fields.map((x: any) => [x.key, x]));
    return {
      id: item.id as string,
      heading: (f.heading?.value ?? "") as string,
      link: (f.link?.value ?? "/") as string,
      imageUrl: (f.image?.reference?.image?.url ?? null) as string | null,
      imageAlt: (f.image?.reference?.image?.altText ?? "") as string,
    };
  });
  return {
    eyebrow: (fm.eyebrow?.value ?? "Browse the Butcher") as string,
    heading: (fm.heading?.value ?? "Shop by Category") as string,
    items,
  };
}

function parseValueBanner(nodes: any[]): ValueBannerData | null {
  const node = nodes[0];
  if (!node) return null;
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  return {
    eyebrow:   (f.eyebrow?.value   ?? "") as string,
    heading:   (f.heading?.value   ?? "") as string,
    body:      (f.body?.value      ?? "") as string,
    btn1Label: (f.btn1_label?.value ?? "") as string,
    btn1Link:  (f.btn1_link?.value  ?? "") as string,
    btn2Label: (f.btn2_label?.value ?? "") as string,
    btn2Link:  (f.btn2_link?.value  ?? "") as string,
    imageUrl:  (f.image?.reference?.image?.url ?? null) as string | null,
    imageAlt:  (f.image?.reference?.image?.altText ?? "") as string,
  };
}

function parseOriginSection(nodes: any[]): OriginSectionData | null {
  const node = nodes[0];
  if (!node) return null;
  const fm = Object.fromEntries(node.fields.map((f: any) => [f.key, f]));
  const items = (fm.items?.references?.nodes ?? []).map((item: any) => {
    const f = Object.fromEntries(item.fields.map((x: any) => [x.key, x]));
    return {
      id: item.id as string,
      heading: (f.heading?.value ?? "") as string,
      link: (f.link?.value ?? "/") as string,
      imageUrl: (f.image?.reference?.image?.url ?? null) as string | null,
      imageAlt: (f.image?.reference?.image?.altText ?? "") as string,
      category: (f.category?.value ?? "") as string,
      countryCode: (f.country_code?.value ?? "") as string,
    };
  });
  return {
    eyebrow: (fm.eyebrow?.value ?? "From the World's Best Farms") as string,
    heading: (fm.heading?.value ?? "Shop by Origin") as string,
    items,
  };
}

export interface CutItem {
  id: string;
  label: string;
  emoji: string;
  url: string;
  imageUrl: string | null;
}

export interface CutsSectionData {
  eyebrow: string;
  heading: string;
  items: CutItem[];
}

const FALLBACK_CUTS: CutItem[] = [
  { id: "cut-steaks",   label: "Steaks",                 emoji: "🥩", url: "/collections/steaks",                 imageUrl: null },
  { id: "cut-mince",    label: "Mince",                  emoji: "🍖", url: "/collections/mince",                  imageUrl: null },
  { id: "cut-bicubes",  label: "Bone in Cubes",          emoji: "🦴", url: "/collections/bone-in-cubes",          imageUrl: null },
  { id: "cut-mishkak",  label: "Mishkak Barbecue Cubes", emoji: "🔥", url: "/collections/mishkak-barbecue-cubes", imageUrl: null },
  { id: "cut-blcubes",  label: "Boneless Cubes",         emoji: "🥩", url: "/collections/boneless-cubes",         imageUrl: null },
  { id: "cut-chops",    label: "Lamb Chops",             emoji: "🍖", url: "/collections/lamb-chops",             imageUrl: null },
  { id: "cut-ribs",     label: "Ribs",                   emoji: "🦴", url: "/collections/ribs",                   imageUrl: null },
  { id: "cut-burgers",  label: "Burgers",                emoji: "🍔", url: "/collections/burgers",                imageUrl: null },
  { id: "cut-roast",    label: "Beef Roast",             emoji: "🥩", url: "/collections/beef-roast",             imageUrl: null },
  { id: "cut-shanks",   label: "Shanks",                 emoji: "🦴", url: "/collections/shanks",                 imageUrl: null },
  { id: "cut-carcass",  label: "Whole Carcass",          emoji: "🐄", url: "/collections/whole-carcass",          imageUrl: null },
];

function parseCutsSection(nodes: any[]): CutsSectionData | null {
  const node = nodes[0];
  const fm = node ? Object.fromEntries(node.fields.map((f: any) => [f.key, f])) : null;

  const metaItems: CutItem[] = fm
    ? (fm.items?.references?.nodes ?? []).map((item: any) => {
        const f = Object.fromEntries(item.fields.map((x: any) => [x.key, x]));
        return {
          id: item.id as string,
          label: (f.label?.value ?? "") as string,
          emoji: (f.emoji?.value ?? "🥩") as string,
          url: (f.url?.value ?? "/") as string,
          imageUrl: (f.image?.reference?.image?.url ?? null) as string | null,
        };
      }).filter((c: CutItem) => c.label)
    : [];

  const items = metaItems.length > 0 ? metaItems : FALLBACK_CUTS;

  return {
    eyebrow: (fm?.eyebrow?.value ?? "Butcher's Picks") as string,
    heading: (fm?.heading?.value ?? "Shop by Cuts") as string,
    items,
  };
}

interface SaleSectionConfig {
  heading: string;
  subHeading: string;
  collectionHandle: string;
}

function parseSaleSection(nodes: any[]): SaleSectionConfig | null {
  const node = nodes[0];
  if (!node) return null;
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  const handle = f.collection?.reference?.handle as string | undefined;
  if (!handle) return null;
  return {
    heading:          (f.heading?.value     ?? "Sale") as string,
    subHeading:       (f.sub_heading?.value ?? "") as string,
    collectionHandle: handle,
  };
}

function parseCollectionSectionConfig(nodes: any[]): { heading: string; subHeading: string } | null {
  const node = nodes[0];
  if (!node) return null;
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  const heading = (f.heading?.value ?? "") as string;
  if (!heading) return null;
  return { heading, subHeading: (f.sub_heading?.value ?? "") as string };
}

const HOME_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MLS Oman",
  url: "https://mls.om",
  logo: "https://mls.om/cdn/shop/files/logo_97c8d848-b3ec-4a82-a68e-dcedc161529c.png?v=1711022728",
  description: "Premium halal meats — Wagyu, Angus, lamb and more — delivered within 1–2 hours across Muscat.",
  address: {
    "@type": "PostalAddress",
    streetAddress: "SHS Tower, Suite 81, Ghala",
    addressLocality: "Muscat",
    addressCountry: "OM",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+96824026400",
    contactType: "customer service",
    availableLanguage: ["English", "Arabic"],
  },
  sameAs: [
    "https://www.instagram.com/mls.om",
    "https://www.facebook.com/muscatlivestock",
    "https://www.linkedin.com/company/muscatlivestock/",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.9",
    reviewCount: "7000",
    bestRating: "5",
  },
};

const LOCAL_BUSINESS_JSON_LD = {
  "@context": "https://schema.org",
  "@type": ["FoodEstablishment", "LocalBusiness"],
  "@id": "https://mls.om/#localbusiness",
  name: "MLS Oman — Fresh Meat Delivery",
  url: "https://mls.om",
  image: "https://mls.om/cdn/shop/files/logo_97c8d848-b3ec-4a82-a68e-dcedc161529c.png?v=1711022728",
  telephone: "+96824026400",
  priceRange: "OMR 2 - OMR 100",
  servesCuisine: "Halal Meat",
  areaServed: [{ "@type": "City", name: "Muscat" }],
  address: {
    "@type": "PostalAddress",
    streetAddress: "SHS Tower, Suite 81, Ghala",
    addressLocality: "Muscat",
    addressCountry: "OM",
  },
  geo: { "@type": "GeoCoordinates", latitude: 23.5859, longitude: 58.4059 },
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
    opens: "09:00",
    closes: "22:00",
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Fresh Halal Meat",
    itemListElement: [
      { "@type": "OfferCatalog", name: "Beef" },
      { "@type": "OfferCatalog", name: "Lamb & Mutton" },
      { "@type": "OfferCatalog", name: "Wagyu Beef" },
      { "@type": "OfferCatalog", name: "Poultry" },
      { "@type": "OfferCatalog", name: "Veal" },
    ],
  },
};

const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "MLS Oman",
  url: "https://mls.om",
  potentialAction: {
    "@type": "SearchAction",
    target: "https://mls.om/search?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export const meta: MetaFunction = ({ location }) => {
  const isAr = (location?.pathname ?? "/").startsWith("/ar");
  const enUrl = "https://mls.om/";
  const arUrl = "https://mls.om/ar";
  const canonical = isAr ? arUrl : enUrl;
  const title = isAr
    ? "لحوم طازجة توصل خلال ساعة عبر مسقط، عُمان | MLS"
    : "Fresh Meat Delivered in 1 Hour Across Muscat — MLS Oman";
  const description = isAr
    ? "اطلب لحوم حلال طازجة — بقري، ضأن، دجاج والمزيد — مع توصيل سريع خلال ساعة عبر مسقط، عُمان."
    : "Fresh premium meat delivered within 1 hour across Muscat. Order halal beef, lamb, chicken & more with fast, hygienic doorstep delivery.";
  const ogImage = "https://mls.om/cdn/shop/files/logo_97c8d848-b3ec-4a82-a68e-dcedc161529c.png?v=1711022728";
  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:image", content: ogImage },
    { property: "og:image:width", content: "1080" },
    { property: "og:image:height", content: "1080" },
    { tagName: "link", rel: "canonical", href: canonical },
    { "script:ld+json": HOME_JSON_LD },
    { "script:ld+json": WEBSITE_JSON_LD },
    { "script:ld+json": LOCAL_BUSINESS_JSON_LD },
  ];
};


function pickReels(edges: any[]): ReelProduct[] {
  const reels: ReelProduct[] = [];
  for (const e of edges) {
    const n = e.node;
    const videoNode = n.media?.edges?.find(
      (m: any) => m.node.mediaContentType === "VIDEO" || m.node.mediaContentType === "EXTERNAL_VIDEO"
    );
    if (!videoNode) continue;
    const isExternal = videoNode.node.mediaContentType === "EXTERNAL_VIDEO";
    const mp4 = videoNode.node.sources?.find((s: any) => s.mimeType === "video/mp4")
      ?? videoNode.node.sources?.[0];
    reels.push({
      id: n.id,
      title: n.title,
      handle: n.handle,
      price: n.priceRange.minVariantPrice,
      poster: videoNode.node.previewImage?.url ?? n.featuredImage?.url ?? null,
      videoUrl: !isExternal ? (mp4?.url ?? null) : null,
      embedUrl: isExternal ? (videoNode.node.embedUrl ?? null) : null,
      productImage: n.featuredImage?.url ?? null,
    });
  }
  return reels;
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const af = (q: string) => context.adminFetch(q).then((d: any) => d?.nodes ?? {});
  const language = detectLanguage(request);
  const country = "OM" as const;

  // Run Admin API (structure, always available) and Storefront API (translations, requires
  // Storefront API access per metaobject type) in parallel. For each section we prefer the
  // Storefront result when it has nodes — that means the type has access enabled and
  // translations are served. Otherwise we fall back to Admin API so nothing disappears.
  const [
    heroRes, badgesRes, priceSecRes, priceTileRes, reelSecRes,
    promoRes, valueRes, colCfgRes, originRes, categoryRes,
    cutsRes, featuredRes, colListRes, reelTagged, reelItemsRes, giftRes, saleSecRes,
    sfMetaRes, blogData, homeLayoutRes,
  ] = await Promise.all([
    af(Q_HERO), af(Q_BADGES), af(Q_PRICE_SEC), af(Q_PRICE_TILE), af(Q_REELS_SEC),
    af(Q_PROMO), af(Q_VALUE), af(Q_COL_CFG), af(Q_ORIGIN), af(Q_CATEGORY),
    af(Q_CUTS), af(Q_FEATURED), af(Q_COL_LIST),
    context.storefront.query(REELS_QUERY, { variables: { first: 20, query: "tag:reel" }, cache: context.storefront.CacheShort() }).catch(() => ({ products: { edges: [] } })),
    af(Q_REEL_ITEMS), af(Q_GIFT), af(Q_SALE_SEC),
    // CacheShort (not the default CacheLong) so home-section metaobject edits reflect on
    // production within ~seconds instead of up to an hour (matching local dev freshness).
    context.storefront.query(HOME_METAOBJECTS_QUERY, { variables: { language, country }, cache: context.storefront.CacheShort() }).catch(() => ({} as any)),
    context.storefront.query(Q_BLOG_ARTICLES, { cache: context.storefront.CacheShort() }).catch(() => null),
    fetchJudgemeStoreReviews(context.env.PUBLIC_STORE_DOMAIN, context.env.JUDGEME_API_TOKEN, 1, 12, "5").catch(() => ({ reviews: [] as JudgemeReview[], current_page: 1, per_page: 12 })),
    fetchJudgemeShopStats(context.env.PUBLIC_STORE_DOMAIN, context.env.JUDGEME_API_TOKEN).catch(() => ({ average: 0, count: 0 })),
    // Home section layout (order + visibility) — via Storefront API so it works on production
    // without depending on the admin token. CacheShort so edits reflect within seconds.
    context.storefront.query(Q_HOME_LAYOUT_SF, { cache: context.storefront.CacheShort() })
      .then((d: any) => d?.metaobjects ?? {})
      .catch(() => ({})),
  ]);

  // Defer Judge.me outside the blocking Promise.all so it never delays TTFB
  const reviewsPromise = fetchJudgemeStoreReviews(context.env.PUBLIC_STORE_DOMAIN, context.env.JUDGEME_API_TOKEN, 1, 9).catch(() => ({ reviews: [] as JudgemeReview[], current_page: 1, per_page: 9 }));
  const shopStatsPromise = fetchJudgemeShopStats(context.env.PUBLIC_STORE_DOMAIN, context.env.JUDGEME_API_TOKEN).catch(() => ({ average: 0, count: 0 }));
  const NEGATIVE_MARKER = /unfortunately|however|\bshould\s+b(?:e)?\b|downside|does ?n.?t match|not consistent|silver skin|short expiry|better quality|only good for/i;
  const reviewsDeferred = Promise.all([reviewsPromise, shopStatsPromise]).then(([reviewsData, shopStats]) => {
    const allStoreReviews = (reviewsData?.reviews ?? []);
    const curatedReviews = allStoreReviews
      .filter((r) => r.rating >= 5 && (r.body ?? "").trim().length >= 20)
      .sort((a, b) => {
        const neg = (r: typeof a) => (NEGATIVE_MARKER.test(r.body ?? "") ? 1 : 0);
        return neg(a) - neg(b) || (b.body ?? "").length - (a.body ?? "").length;
      });
    const storeReviews = (curatedReviews.length >= 3
      ? curatedReviews
      : [...curatedReviews, ...allStoreReviews.filter((r) => r.rating >= 4 && !curatedReviews.includes(r))]
    ).slice(0, 6);
    return { storeReviews, reviewTotalCount: (reviewsData as any)?.total_count ?? 0, reviewAverage: (shopStats as any)?.average ?? 0 };
  });

  // Prefer Storefront API section when it returned nodes (translated content available);
  // otherwise use Admin API section (untranslated but always complete).
  const sf = (sfSection: any, adminSection: any) =>
    sfSection?.nodes?.length > 0 ? sfSection : adminSection;

  const data = {
    heroBanners:             sf(sfMetaRes?.hero,                 heroRes),
    trustBadges:             sf(sfMetaRes?.badges,               badgesRes),
    priceRangeSection:       sf(sfMetaRes?.priceRangeSection,    priceSecRes),
    priceTiles:              sf(sfMetaRes?.priceTiles,           priceTileRes),
    reelsSection:            sf(sfMetaRes?.reelsSection,         reelSecRes),
    promoSideBySide:         sf(sfMetaRes?.promo,                promoRes),
    valueBanner:             sf(sfMetaRes?.valueBanner,          valueRes),
    collectionSectionConfig: sf(sfMetaRes?.collectionSection,    colCfgRes),
    originSection:           sf(sfMetaRes?.origin,    originRes),
    categorySection:         sf(sfMetaRes?.category,  categoryRes),
    cutsSection:             sf(sfMetaRes?.cuts,       cutsRes),
    featuredCollections:     sf(sfMetaRes?.featuredCollections, featuredRes),
    featuredCollectionList:  sf(sfMetaRes?.featuredCollectionList, colListRes),
    firstOrderGift:          sf(sfMetaRes?.gift,                 giftRes),
  };

  // In Arabic, swap any image field for its `*_ar` counterpart where set (all metaobjects).
  if (language === "AR") applyArImages(data);

  const parsed = parseFeaturedCollections(data?.featuredCollections?.nodes ?? []);

  // Fetch products for each unique collection handle via Storefront API (Admin API prices are incompatible)
  const allHandles = [...new Set(
    parsed.flatMap(e => [e.handle, ...(e.tabs?.map(t => t.handle) ?? [])]).filter(Boolean)
  )];
  const productsByHandle = new Map<string, ShopifyProduct[]>();
  if (allHandles.length > 0) {
    await Promise.all(allHandles.map(async (handle) => {
      try {
        const res = await context.storefront.query(COLLECTION_PRODUCTS_QUERY, { variables: { handle, first: 20, language, country } });
        productsByHandle.set(handle, (res?.collection?.products?.edges ?? [])
          .filter((e: any) => parseFloat(e.node?.priceRange?.minVariantPrice?.amount ?? "0") > 0));
      } catch { /* ignore missing collection */ }
    }));
  }
  const parsedWithProducts = parsed.map(e => ({
    ...e,
    products: productsByHandle.get(e.handle) ?? [],
    tabs: e.tabs?.map(t => ({ ...t, products: productsByHandle.get(t.handle) ?? [] })),
  }));

  const collectionSectionConfig = parseCollectionSectionConfig(data?.collectionSectionConfig?.nodes ?? []);
  const rawSection = buildFeaturedSection(parsedWithProducts);
  const mergedSection = rawSection && collectionSectionConfig
    ? { ...rawSection, title: collectionSectionConfig.heading, subTitle: collectionSectionConfig.subHeading || undefined }
    : rawSection;

  // Deduplicate products across tabs so the same item won't appear in both Lamb and Mutton (or any overlapping collections)
  const seenTabIds = new Set<string>();
  const featuredSection = mergedSection
    ? {
        ...mergedSection,
        tabs: mergedSection.tabs.map(tab => ({
          ...tab,
          products: tab.products.filter((p: any) => {
            const id = p.node?.id;
            if (!id || seenTabIds.has(id)) return false;
            seenTabIds.add(id);
            return true;
          }),
        })),
      }
    : mergedSection;
  const collectionCards = parseFeaturedCollectionList(data?.featuredCollectionList?.nodes ?? []);
  const firstOrderGift = parseFirstOrderGift(data?.firstOrderGift?.nodes ?? []);
  const priceSection = parsePriceRangeSection(data?.priceRangeSection?.nodes ?? []);
  const priceTiles = parsePriceTiles(data?.priceTiles?.nodes ?? []);
  const promo = parsePromoSideBySide(data?.promoSideBySide?.nodes ?? []);
  const categorySection = parseCategorySection(data?.categorySection?.nodes ?? []);
  const originSection = parseOriginSection(data?.originSection?.nodes ?? []);
  const valueBanner = parseValueBanner(data?.valueBanner?.nodes ?? []);
  const cutsSection = parseCutsSection(data?.cutsSection?.nodes ?? []);
  const reelsConfig = parseReelsSectionConfig(data?.reelsSection?.nodes ?? []);
  const saleSection = parseSaleSection(saleSecRes?.nodes ?? []);

  let saleProducts: ShopifyProduct[] = [];
  if (saleSection) {
    try {
      const res = await context.storefront.query(COLLECTION_PRODUCTS_QUERY, {
        variables: { handle: saleSection.collectionHandle, first: 20, language, country },
      });
      saleProducts = (res?.collection?.products?.edges ?? [])
        .filter((e: any) => parseFloat(e.node?.priceRange?.minVariantPrice?.amount ?? "0") > 0);
    } catch { /* ignore missing collection */ }
  }

  const reelItemNodes: any[] = sf(sfMetaRes?.reelItems, reelItemsRes)?.nodes ?? [];
  const reelProductIds: string[] = reelItemNodes
    .map((n: any) => n.fields?.find((f: any) => f.key === "product")?.reference?.id)
    .filter(Boolean);
  const reelPriceMap: Record<string, { amount: string; currencyCode: string }> = {};
  if (reelProductIds.length > 0) {
    try {
      const priceData = await context.storefront.query(REEL_PRODUCT_PRICES_QUERY, {
        variables: { ids: reelProductIds, country: "OM" as const },
      });
      for (const n of priceData?.nodes ?? []) {
        if (n?.id && n.priceRange?.minVariantPrice) {
          reelPriceMap[n.id] = n.priceRange.minVariantPrice;
        }
      }
    } catch { /* ignore price fetch errors, cards still show without price */ }
  }

  // Use reel_item entries from metaobject; fall back to tag:reel product query when none exist
  let reels: ReelProduct[] = parseReelItems(reelItemNodes, reelPriceMap);
  if (reels.length === 0) {
    let taggedEdges = reelTagged?.products?.edges ?? [];
    if (taggedEdges.length === 0) {
      const reelAll = await context.storefront.query(REELS_QUERY, {
        variables: { first: 30, query: undefined },
      });
      taggedEdges = reelAll?.products?.edges ?? [];
    }
    reels = pickReels(taggedEdges);
  }

  const blogArticles: BlogArticle[] = ((blogData as any)?.blogs?.nodes ?? [])
    .flatMap((blog: any) =>
      (blog.articles?.nodes ?? []).map((n: any) => ({
        id: n.id as string,
        handle: n.handle as string,
        title: n.title as string,
        publishedAt: n.publishedAt as string,
        excerpt: (n.excerpt ?? null) as string | null,
        imageUrl: (n.image?.url ?? null) as string | null,
        imageAlt: (n.image?.altText ?? n.title ?? "") as string,
        blogHandle: blog.handle as string,
      }))
    )
    .sort((a: BlogArticle, b: BlogArticle) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )
    .slice(0, 6);

  const heroSlides: any[] = data?.heroBanners?.nodes ?? [];

  // Parse the home section layout: one key per line, in display order; lines that are
  // empty or start with # are skipped (hidden). Empty/missing → component uses its default order.
  const sectionOrderRaw = ((homeLayoutRes?.nodes?.[0]?.fields ?? []) as any[])
    .find((f) => f.key === "section_order")?.value ?? "";
  const sectionOrder: string[] = sectionOrderRaw
    .split("\n")
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0 && !s.startsWith("#"));

  return {
    sectionOrder,
    heroSlides,
    trustBadges: data?.trustBadges?.nodes ?? [],
    featuredSection,
    collectionCards,
    priceSection,
    priceTiles,
    promo,
    reelsLabel: reelsConfig.subHeading,
    reelsHeading: reelsConfig.heading,
    reels,
    categorySection,
    originSection,
    valueBanner,
    cutsSection,
    firstOrderGift,
    saleSection,
    saleProducts,
    blogArticles,
    reviewsDeferred,
  };
}

// Default home section order + the full set of valid section keys. The mls_home_layout
// metaobject can reorder these or omit any to hide it; anything not listed below is ignored.
const HOME_SECTION_ORDER = [
  "hero", "trust_badges", "featured_collections", "first_order_gift", "sale",
  "featured_products", "shop_by_category", "shop_by_cuts", "shop_by_origin",
  "reels", "promo", "value_boxes", "recently_viewed", "reviews", "blog",
] as const;

export default function Home() {
  const { sectionOrder, heroSlides, trustBadges, featuredSection, collectionCards, promo, reelsLabel, reelsHeading, reels, categorySection, originSection, valueBanner, cutsSection, firstOrderGift, saleSection, saleProducts, blogArticles, reviewsDeferred } = useLoaderData<typeof loader>();
  const t = useT();

  // Each section keyed so the layout metaobject can reorder / hide them. Conditional
  // sections resolve to null (and are simply skipped) when their data is absent.
  const sections: Record<string, React.ReactNode> = {
    hero: <HeroBanner key="hero" slides={heroSlides} />,
    trust_badges: <TrustBadges key="trust_badges" badges={trustBadges} />,
    featured_collections: (
      <FeaturedCollections key="featured_collections" cards={collectionCards} title={t("home.featured")} subtitle={t("home.featured_sub")} />
    ),
    first_order_gift: <FirstOrderGift key="first_order_gift" data={firstOrderGift} />,
    sale: saleSection ? (
      <CategorySection key="sale" handle={saleSection.collectionHandle} title={saleSection.heading} subtitle={saleSection.subHeading} products={saleProducts} />
    ) : null,
    featured_products: featuredSection ? (
      <CategorySection key="featured_products" handle={featuredSection.tabs[0]?.handle ?? ""} title={featuredSection.title} subtitle={featuredSection.subTitle} products={featuredSection.tabs[0]?.products ?? []} tabs={featuredSection.tabs} />
    ) : null,
    shop_by_category: <ShopByCategory key="shop_by_category" section={categorySection} />,
    shop_by_cuts: <ShopByCuts key="shop_by_cuts" section={cutsSection} />,
    shop_by_origin: <ShopByOrigin key="shop_by_origin" section={originSection} />,
    reels: <Suspense fallback={null}><ReelsCarousel key="reels" reels={reels} label={reelsLabel} heading={reelsHeading} /></Suspense>,
    promo: <PromoSideBySide key="promo" promo={promo} />,
    value_boxes: <ValueBoxesBanner key="value_boxes" banner={valueBanner} />,
    blog: <HomeBlogSection key="blog" articles={blogArticles} />,
    recently_viewed: <RecentlyViewed key="recently_viewed" />,
    reviews: <Suspense key="reviews" fallback={null}><Await resolve={reviewsDeferred}>{(r) => <HomeReviews reviews={r.storeReviews} totalCount={r.reviewTotalCount} averageRating={r.reviewAverage} />}</Await></Suspense>,
  };

  // Use the metaobject-defined order when it provides at least one known key; otherwise the default.
  const requested = (sectionOrder ?? []).filter((k) => k in sections);
  const order = requested.length > 0 ? requested : [...HOME_SECTION_ORDER];

  return (
    <>
      <h1 className="sr-only">Premium Fresh Meat Delivery in Muscat, Oman</h1>
      {order.map((k) => sections[k])}
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const is5xx = isRouteErrorResponse(error) && error.status >= 500;
  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-5xl font-black text-crimson">{is5xx ? "500" : "!"}</p>
      <h1 className="mt-3 text-xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">We hit an unexpected error. Please try refreshing the page.</p>
      <button type="button" onClick={() => window.location.reload()}
        className="mt-6 inline-block rounded-lg bg-crimson px-6 py-3 text-sm font-bold text-white hover:bg-rich-red">
        Refresh
      </button>
    </div>
  );
}

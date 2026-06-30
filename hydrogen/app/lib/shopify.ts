// Shopify Storefront API client for MLS.
// Token + domain are public (storefront-scoped) and bundled into the client.

export const SHOPIFY_API_VERSION = "2025-07";
export const SHOPIFY_STORE_PERMANENT_DOMAIN = "muscat-livestock.myshopify.com";
export const SHOPIFY_STOREFRONT_TOKEN = "f400e415d38fee8b926f72b54b5fed9d";
export const SHOPIFY_STOREFRONT_URL = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

export async function storefrontApiRequest<T = any>(
  query: string,
  variables: Record<string, any> = {}
): Promise<{ data: T } | undefined> {
  const isAr = variables.language === "AR";
  const response = await fetch(SHOPIFY_STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": SHOPIFY_STOREFRONT_TOKEN,
      ...(isAr ? { "Accept-Language": "ar" } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (response.status === 402) {
    console.error("Shopify: Payment required. API access requires an active billing plan.");
    return;
  }

  if (!response.ok) {
    throw new Error(`Shopify HTTP ${response.status}`);
  }

  const json = await response.json() as any;
  if (json.errors) {
    throw new Error(`Shopify error: ${json.errors.map((e: any) => e.message).join(", ")}`);
  }
  return json as { data: T };
}

// ---------- Shared types ----------

export interface MoneyV2 {
  amount: string;
  currencyCode: string;
}

export interface ShopifyImage {
  url: string;
  altText: string | null;
  width?: number;
  height?: number;
}

export interface ShopifyVariant {
  id: string;
  title: string;
  price: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  selectedOptions: Array<{ name: string; value: string }>;
}

export interface ShopifyMetafield {
  key: string;
  value: string;
}

export interface ShopifyProductNode {
  id: string;
  title: string;
  description: string;
  descriptionHtml?: string;
  handle: string;
  tags: string[];
  vendor?: string;
  productType?: string;
  availableForSale: boolean;
  priceRange: { minVariantPrice: MoneyV2; maxVariantPrice: MoneyV2 };
  compareAtPriceRange?: { minVariantPrice: MoneyV2 };
  images: { edges: Array<{ node: ShopifyImage }> };
  variants: { edges: Array<{ node: ShopifyVariant }> };
  options: Array<{ name: string; values: string[] }>;
  metafields?: Array<ShopifyMetafield | null>;
}

export interface ShopifyProduct {
  node: ShopifyProductNode;
}

// ---------- Queries ----------

export const PRODUCT_FRAGMENT = `
  fragment ProductCard on Product {
    id
    title
    description
    handle
    tags
    vendor
    productType
    availableForSale
    priceRange {
      minVariantPrice { amount currencyCode }
      maxVariantPrice { amount currencyCode }
    }
    compareAtPriceRange { minVariantPrice { amount currencyCode } }
    images(first: 4) { edges { node { url altText width height } } }
    variants(first: 100) {
      edges {
        node {
          id
          title
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          availableForSale
          selectedOptions { name value }
        }
      }
    }
    options { name values }
    metafields(identifiers: [
      {namespace: "reviews", key: "rating"}
      {namespace: "reviews", key: "rating_count"}
    ]) { key value }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query CollectionProducts($handle: String!, $first: Int!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    collection(handle: $handle) {
      id
      title
      description
      image { url altText }
      products(first: $first) {
        edges { node { ...ProductCard } }
      }
    }
  }
`;

export const PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query Products($first: Int!, $query: String, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    products(first: $first, query: $query) {
      edges { node { ...ProductCard } }
    }
  }
`;

export const PRODUCT_BY_HANDLE_QUERY = `
  ${PRODUCT_FRAGMENT}
  query ProductByHandle($handle: String!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    product(handle: $handle) {
      ...ProductCard
      descriptionHtml
      seo { title description }
    }
  }
`;

export const SEARCH_PRODUCTS_QUERY = `
  ${PRODUCT_FRAGMENT}
  query SearchProducts($query: String!, $first: Int!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    products(first: $first, query: $query) {
      edges { node { ...ProductCard } }
    }
  }
`;

// Reels: query products that have video media (tagged "reel" preferred,
// otherwise we filter client-side for products with at least one Video).
export const REELS_QUERY = `
  query Reels($first: Int!, $query: String) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          priceRange { minVariantPrice { amount currencyCode } }
          featuredImage { url altText }
          media(first: 5) {
            edges {
              node {
                mediaContentType
                ... on Video {
                  id
                  previewImage { url altText }
                  sources { url mimeType format width height }
                }
                ... on ExternalVideo {
                  id
                  embedUrl
                  previewImage { url altText }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export interface ReelProduct {
  id: string;
  title: string;
  handle: string;
  price: MoneyV2;
  poster: string | null;
  videoUrl: string | null;
  embedUrl: string | null;
  productImage: string | null;
}


/** Parse JudgMe rating + count from Shopify product metafields. */
export function parseRatingMetafields(
  metafields?: Array<{ key: string; value: string } | null>
): { average: number; count: number } {
  const ratingMeta = metafields?.find((m) => m?.key === "rating");
  const countMeta = metafields?.find((m) => m?.key === "rating_count");
  let average = 0;
  if (ratingMeta?.value) {
    try {
      const parsed = JSON.parse(ratingMeta.value);
      average = parseFloat(parsed.value ?? parsed) || 0;
    } catch {
      average = parseFloat(ratingMeta.value) || 0;
    }
  }
  const count = countMeta ? parseInt(countMeta.value, 10) || 0 : 0;
  return { average, count };
}

const ORIGIN_MAP: Record<string, string> = {
  aus: "AUS", australia: "AUS", australian: "AUS",
  nz: "NZ", "new-zealand": "NZ", "new zealand": "NZ",
  arg: "ARG", argentina: "ARG", argentinian: "ARG",
  brz: "BRZ", brazil: "BRZ", brazilian: "BRZ",
  rsa: "ZA", za: "ZA", "south-africa": "ZA", "south-african": "ZA", "south africa": "ZA", "south african": "ZA",
  pak: "PAK", pakistan: "PAK", pakistani: "PAK",
  ind: "IND", india: "IND", indian: "IND",
  som: "SOM", somalia: "SOM", somali: "SOM",
  jp: "JP", japan: "JP", japanese: "JP",
  us: "USA", usa: "USA", "united-states": "USA", "united states": "USA", american: "USA",
  nl: "NL", netherlands: "NL", dutch: "NL",
  lbn: "LBN", lebanon: "LBN", lebanese: "LBN",
  uae: "UAE", emirati: "UAE", "united arab emirates": "UAE",
  uk: "UK", gb: "UK", british: "UK", scottish: "UK", "united kingdom": "UK",
  fr: "FR", france: "FR", french: "FR",
  "grass-fed": "GRASS-FED", grassfed: "GRASS-FED",
};

export const ORIGIN_LABELS: Record<string, { label: string; flag: string }> = {
  AUS: { label: "Australia",       flag: "🇦🇺" },
  NZ:  { label: "New Zealand",     flag: "🇳🇿" },
  ARG: { label: "Argentina",       flag: "🇦🇷" },
  BRZ: { label: "Brazil",          flag: "🇧🇷" },
  ZA:  { label: "South Africa",    flag: "🇿🇦" },
  PAK: { label: "Pakistan",        flag: "🇵🇰" },
  IND: { label: "India",           flag: "🇮🇳" },
  SOM: { label: "Somalia",         flag: "🇸🇴" },
  JP:  { label: "Japan",           flag: "🇯🇵" },
  USA: { label: "United States",   flag: "🇺🇸" },
  NL:  { label: "Netherlands",     flag: "🇳🇱" },
  LBN: { label: "Lebanon",         flag: "🇱🇧" },
  UAE: { label: "UAE",             flag: "🇦🇪" },
  UK:  { label: "United Kingdom",  flag: "🇬🇧" },
  FR:  { label: "France",          flag: "🇫🇷" },
  "GRASS-FED": { label: "Grass-Fed", flag: "🌱" },
};

function matchOrigin(text: string): string | null {
  const k = text.toLowerCase().trim().replace(/\s+/g, "-");
  if (ORIGIN_MAP[k]) return ORIGIN_MAP[k];
  for (const word of k.split(/[\s-]+/)) {
    if (ORIGIN_MAP[word]) return ORIGIN_MAP[word];
  }
  return null;
}

export function getOriginFromTags(tags: string[] = []): string | null {
  for (const t of tags) {
    const hit = matchOrigin(t);
    if (hit) return hit;
  }
  return null;
}

/** Tries tags first, then falls back to scanning the product title. */
export function getOriginFromProduct(tags: string[] = [], title = ""): string | null {
  const fromTags = getOriginFromTags(tags);
  if (fromTags) return fromTags;
  // Scan each word in the title (handles "IND Mutton...", "Fresh Indian Mutton", etc.)
  for (const word of title.split(/[\s-]+/)) {
    const hit = matchOrigin(word);
    if (hit) return hit;
  }
  return null;
}

// OMR (and KWD/BHD) are 3-decimal currencies; most others are 2.
const THREE_DECIMAL_CURRENCIES = new Set(["OMR", "KWD", "BHD"]);
export function formatPrice(amount: string | number, currency = "OMR"): string {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  const decimals = THREE_DECIMAL_CURRENCIES.has(currency) ? 3 : 2;
  if (Number.isNaN(n)) return `${currency} ${(0).toFixed(decimals)}`;
  return `${currency} ${n.toFixed(decimals)}`;
}

export function shopifyImageUrl(url: string, width: number): string {
  if (!url) return url;
  try {
    const u = new URL(url);
    u.searchParams.set("width", String(width));
    return u.toString();
  } catch {
    return url;
  }
}

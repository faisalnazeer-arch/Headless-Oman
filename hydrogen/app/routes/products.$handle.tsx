import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { detectLanguage } from "~/lib/locale";
import { redirect } from "@shopify/remix-oxygen";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { useLoaderData, Await, useRouteError, isRouteErrorResponse } from "react-router";
import { Suspense } from "react";
import { type ShopifyProduct } from "~/lib/shopify";
import { fetchJudgemeReviews, fetchJudgemeRating, buildRatingSummary } from "~/lib/judgeme";
import { extractGloboOptionsFromHtml, type GloboOptionSet } from "~/lib/globo";
import { sanitizeHtml } from "~/lib/sanitize";
import { DefaultTemplate } from "~/components/product-templates/DefaultTemplate";
import { BeefRubsTemplate } from "~/components/product-templates/BeefRubsTemplate";
import { ChickenRubsTemplate } from "~/components/product-templates/ChickenRubsTemplate";
import { LambRubsTemplate } from "~/components/product-templates/LambRubsTemplate";
import { WholeCutsTemplate } from "~/components/product-templates/WholeCutsTemplate";
import { BoxCollectionsTemplate } from "~/components/product-templates/BoxCollectionsTemplate";
import { SeasonedMarinadesTemplate } from "~/components/product-templates/SeasonedMarinadesTemplate";
import { PicanhaCutTemplate } from "~/components/product-templates/PicanhaCutTemplate";
import { WholeCarcassTemplate } from "~/components/product-templates/WholeCarcassTemplate";
import { KebabTemplate } from "~/components/product-templates/KebabTemplate";

const PAGE_SETTINGS_QUERY = `
  query {
    metaobjects(type: "product_page_settings", first: 1) {
      nodes {
        fields {
          key value
          references(first: 10) {
            nodes {
              ... on Metaobject {
                fields {
                  key value
                  references(first: 25) {
                    nodes { ... on Metaobject { fields { key value } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

// templateSuffix is not exposed by the Storefront API — fetch it via Admin API instead.
// We also fetch mls.* metafields here because they may not have Storefront API access
// enabled; Admin API always has full metafield access.
// Queried by product GID (from Storefront product.id) so it works for any handle language.
// Admin API always returns the original English handle regardless of Translate & Adapt.
const ADMIN_PRODUCT_BY_GID_QUERY = (gid: string) => `
  query {
    product(id: "${gid}") {
      handle
      templateSuffix
      metafields(namespace: "custom", first: 50) {
        edges { node { namespace key value } }
      }
    }
  }
`;

// One metaobject per template suffix (type: "product_template_settings").
// Each instance must have a "template_suffix" field to identify which template it configures.
// Optional fields: "section_title", "highlight_text".
// Create/edit instances in Shopify Admin › Content › Metaobjects.
const TEMPLATE_SETTINGS_QUERY = `
  query {
    metaobjects(type: "product_template_settings", first: 20) {
      nodes { fields { key value } }
    }
  }
`;

const RECOMMENDATIONS_QUERY = `#graphql
  query ProductRecommendations($productId: ID!, $country: CountryCode, $language: LanguageCode)
  @inContext(country: $country, language: $language) {
    productRecommendations(productId: $productId) {
      id title handle vendor
      availableForSale
      tags
      productType
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      compareAtPriceRange { minVariantPrice { amount currencyCode } }
      images(first: 4) { edges { node { url altText width height } } }
      variants(first: 100) {
        edges {
          node {
            id title availableForSale
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
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
  }
` as const;

const PRODUCT_QUERY = `#graphql
  query Product($handle: String!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    product(handle: $handle) {
      id title handle descriptionHtml vendor
      seo { title description }
      tags
      images(first: 10) { nodes { url altText } }
      media(first: 12) {
        nodes {
          mediaContentType
          ... on MediaImage { image { url altText } }
          ... on Video {
            id
            sources { url mimeType }
            previewImage { url altText }
          }
          ... on ExternalVideo {
            id
            embedUrl
            previewImage { url altText }
          }
        }
      }
      options { name values }
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }
      sellingPlanGroups(first: 10) {
        nodes {
          name
          sellingPlans(first: 10) {
            nodes { id name recurringDeliveries }
          }
        }
      }
      variants(first: 250) {
        nodes {
          id title availableForSale quantityAvailable
          price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          selectedOptions { name value }
          image { url altText }
          storeAvailability(first: 10) {
            nodes {
              available
              pickUpTime
              location {
                name
                address {
                  address1
                  address2
                  city
                  province
                  country
                  phone
                }
              }
            }
          }
          unitPrice { amount currencyCode }
          unitPriceMeasurement {
            measuredType
            quantityUnit
            quantityValue
            referenceUnit
            referenceValue
          }
          metafields(identifiers: [
            {namespace: "custom", key: "per_kg_price"}
            {namespace: "custom", key: "price_per_kg"}
            {namespace: "custom", key: "portion_text"}
            {namespace: "nutrition", key: "total_energy"}
            {namespace: "nutrition", key: "total_fat"}
            {namespace: "nutrition", key: "total_fat_dv"}
            {namespace: "nutrition", key: "saturated_fat"}
            {namespace: "nutrition", key: "saturated_fat_dv"}
            {namespace: "nutrition", key: "trans_fat"}
            {namespace: "nutrition", key: "total_cholesterol"}
            {namespace: "nutrition", key: "cholesterol_dv"}
            {namespace: "nutrition", key: "total_carbohydrates"}
            {namespace: "nutrition", key: "total_carbs_dv"}
            {namespace: "nutrition", key: "dietary_fibers"}
            {namespace: "nutrition", key: "dietary_fiber_dv"}
            {namespace: "nutrition", key: "sugar"}
            {namespace: "nutrition", key: "protein"}
            {namespace: "nutrition", key: "sodium"}
            {namespace: "nutrition", key: "sodium_dv"}
            {namespace: "nutrition", key: "iron"}
            {namespace: "nutrition", key: "iron_dv"}
          ]) { key namespace value }
          sellingPlanAllocations(first: 10) {
            nodes {
              sellingPlan { id }
              priceAdjustments {
                price { amount currencyCode }
                compareAtPrice { amount currencyCode }
              }
            }
          }
        }
      }
      metafields(identifiers: [
        {namespace: "reviews", key: "rating"}
        {namespace: "reviews", key: "rating_count"}
        {namespace: "custom", key: "beef_rubs"}
        {namespace: "custom", key: "mls_rub"}
        {namespace: "custom", key: "usage_guide"}
        {namespace: "custom", key: "ingredients"}
        {namespace: "custom", key: "flavor_profile"}
        {namespace: "custom", key: "pairing_suggestions"}
        {namespace: "custom", key: "understanding_rubs"}
        {namespace: "custom", key: "marinade_recipe"}
        {namespace: "custom", key: "mls_origin_flag_emoji"}
        {namespace: "custom", key: "mls_origin_country"}
        {namespace: "custom", key: "mls_feed_type"}
        {namespace: "custom", key: "mls_halal_certified"}
        {namespace: "custom", key: "mls_export_certified"}
        {namespace: "custom", key: "mls_farm_story"}
        {namespace: "custom", key: "mls_flavour"}
        {namespace: "custom", key: "mls_flavour_score"}
        {namespace: "custom", key: "mls_marbling"}
        {namespace: "custom", key: "mls_marbling_score"}
        {namespace: "custom", key: "mls_tenderness_score2"}
        {namespace: "custom", key: "mls_doneness_tags"}
        {namespace: "custom", key: "mls_cook_method"}
        {namespace: "custom", key: "mls_cook_time"}
        {namespace: "custom", key: "mls_cook_temperature"}
        {namespace: "custom", key: "mls_cook_steps"}
        {namespace: "custom", key: "mls_suitable_for_tags"}
        {namespace: "custom", key: "mls_storage_tip"}
        {namespace: "custom", key: "mls_fridge_life"}
      ]) { key namespace value }
      collections(first: 30) { nodes { id title handle } }
    }
  }
` as const;

// Converts Globo REST API option objects → GloboOption[] shape expected by GloboProductOptions
function flattenGloboApiOptions(opts: any[]): import("~/lib/globo").GloboOption[] {
  return opts
    .filter((o: any) => o?.name || o?.label)
    .map((o: any) => ({
      elementId: String(o.id ?? o._id ?? Math.random()),
      name: o.name ?? o.label ?? "",
      type: (() => {
        const t = (o.type ?? o.option_type ?? "text").toLowerCase();
        if (t.includes("textarea")) return "textarea" as const;
        if (t.includes("swatch") && t.includes("image")) return "image_swatch" as const;
        if (t.includes("swatch") || t.includes("color")) return "swatch" as const;
        if (t.includes("dropdown") || t.includes("select")) return "dropdown" as const;
        if (t.includes("radio")) return "radio" as const;
        if (t.includes("checkbox")) return "checkbox" as const;
        if (t.includes("date")) return "date" as const;
        if (t.includes("number")) return "number" as const;
        if (t.includes("file")) return "file" as const;
        return "text" as const;
      })(),
      required: o.required ?? false,
      placeholder: o.placeholder ?? "",
      values: (o.values ?? o.option_values ?? []).map((v: any) => ({
        label: typeof v === "string" ? v : (v.label ?? v.name ?? v.value ?? ""),
        value: typeof v === "string" ? v : (v.value ?? v.label ?? ""),
        color: v.color ?? v.color_code ?? undefined,
        image: v.image ?? v.image_url ?? undefined,
      })),
      min_value: o.min_value,
      max_value: o.max_value,
      position: o.position ?? 0,
    }));
}

// Skip re-fetching when navigating back to the same product URL.
export function shouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  return currentUrl.pathname !== nextUrl.pathname;
}

// Reviews are fetched in the critical (awaited) path — never affected by the lazy timeout.
// EMPTY_LAZY only covers the genuinely slow data: recommendations, settings, Globo.
const EMPTY_LAZY = {
  recommendations: [] as any[],
  globoOptionSets: [] as any[],
  templateSettings: {} as Record<string, { sectionTitle: string | null; highlightText: string | null; accordions: Array<{heading: string; content: string}> }>,
  pageSettings: {
    deliveryTitle: "Delivery Info",
    deliveryContent: null as string | null,
    supportTitle: "Customer Support",
    supportContent: null as string | null,
    dubaiDeliveryInfo: null as any,
    abudhabiDeliveryInfo: null as any,
    sharjahDeliveryInfo: null as any,
    badgeImage: null as string | null,
  },
};

export async function loader({ params, context, request }: LoaderFunctionArgs) {
  // Support both /products/:handle and /collections/:collectionHandle/products/:productHandle
  const handle = params.handle ?? params.productHandle;
  if (!handle) throw new Response("Missing handle", { status: 400 });

  const { env } = context;
  const shopDomain = env.PUBLIC_STORE_DOMAIN;
  // Use the live store custom domain for HTML scraping — the myshopify subdomain
  // may redirect to a password page or serve a stripped theme without Globo scripts.
  const liveDomain = (env as any).PUBLIC_LIVE_STORE_DOMAIN ?? shopDomain;
  const judgemeToken = env.JUDGEME_API_TOKEN;

  const language = detectLanguage(request);

  // Phase 1 — Storefront product + icon badges in parallel.
  // Admin query runs in Phase 2 (needs product GID from Storefront response).
  const [data, iconBadgesRaw] = await Promise.all([
    context.storefront.query(PRODUCT_QUERY, {
      variables: { handle, language, country: "AE" as const },
      cache: context.storefront.CacheShort(),
    }),
    context.adminFetch(`{ nodes: metaobjects(type: "icon_with_text", first: 10) { nodes { id handle fields { key value reference { ... on MediaImage { image { url altText } } } } } } }`).catch(() => null),
  ]);
  if (!data.product) throw new Response("Not found", { status: 404 });
  // Zero-price products are internal free-gift items — redirect to home instead of 404
  if (parseFloat(data.product.priceRange?.minVariantPrice?.amount ?? "1") === 0)
    throw redirect("/");

  const externalId = data.product.id.split("/").pop() ?? undefined;

  // Numeric collection IDs — used to filter Globo automate rules (collection-based targeting)
  const collectionIds: number[] = (data.product.collections?.nodes ?? [])
    .map((c: any) => Number(c.id.split("/").pop()))
    .filter(Boolean);

  // Strategy 1: scrape Globo config from Shopify theme HTML (proven approach).
  // Strategy 2: try the Globo app-proxy JSON endpoint as fallback.
  // Both run for every product so all templates get Globo options.
  // Fetch Globo options by scraping the LIVE store's product page HTML.
  // We try the custom domain first (mls.om) because that's where the Shopify
  // theme with Globo is actually running. The myshopify subdomain may serve a
  // password page or a Globo-less version of the HTML.
  // Globo HTML scrape — capped at 1 200 ms total so it never blocks SSR.
  // If it misses, the client-side /api/globo-options/:id fetch takes over automatically.
  const globoPromise: Promise<GloboOptionSet[]> = externalId
    ? Promise.race([
        (async () => {
          const numId = Number(externalId);
          const htmlHeaders = { Accept: "text/html", "User-Agent": "Mozilla/5.0" };
          const htmlUrls = [...new Set([liveDomain, shopDomain])].map(
            (d) => `https://${d}/products/${handle}`,
          );
          const htmlResults = await Promise.allSettled(
            htmlUrls.map((url) =>
              fetch(url, { headers: htmlHeaders, redirect: "follow", signal: AbortSignal.timeout(1200) }),
            ),
          );
          for (const res of htmlResults) {
            if (res.status !== "fulfilled" || !res.value.ok) continue;
            try {
              const html = await res.value.text();
              const fromHtml = extractGloboOptionsFromHtml(html, numId, collectionIds);
              if (fromHtml.length > 0) return fromHtml;
            } catch { /* try next */ }
          }
          return [];
        })(),
        new Promise<GloboOptionSet[]>((resolve) => setTimeout(() => resolve([]), 1200)),
      ])
    : Promise.resolve([]);

  // Compute discount map synchronously from already-fetched product data
  const discountMap: Record<string, number> = {};
  for (const v of data.product.variants?.nodes ?? []) {
    const variantPrice = parseFloat((v as any).price?.amount ?? "0");
    for (const alloc of (v as any).sellingPlanAllocations?.nodes ?? []) {
      const planId = alloc.sellingPlan?.id;
      const adj = alloc.priceAdjustments?.[0];
      if (!planId || !adj || discountMap[planId] !== undefined) continue;
      const subPrice = parseFloat(adj.price?.amount ?? "0");
      const baseline = parseFloat(adj.compareAtPrice?.amount ?? "0") || variantPrice;
      if (baseline > 0 && subPrice < baseline) {
        discountMap[planId] = Math.round(((baseline - subPrice) / baseline) * 100);
      }
    }
  }
  for (const group of data.product.sellingPlanGroups?.nodes ?? []) {
    for (const plan of (group as any).sellingPlans?.nodes ?? []) {
      if (plan.id && discountMap[plan.id] === undefined) {
        discountMap[plan.id] = 10;
      }
    }
  }

  // ── Phase 2 — Admin (by GID) + Reviews in parallel ──────────────────────────────────────
  // Admin API queried by GID so it works for any handle language (EN or translated).
  // Admin always returns the original English canonical handle — used for language switching.
  const emptyReviews = { reviews: [] as any[], total_count: 0, current_page: 1, per_page: 10 };
  const emptyRating  = { average: 0, count: 0, histogram: [0, 0, 0, 0, 0] as [number,number,number,number,number] };
  const [adminProductData, reviewsFetchResult, ratingFetchResult] = await Promise.all([
    context.adminFetch(ADMIN_PRODUCT_BY_GID_QUERY(data.product.id)).catch((e: unknown) => { console.error("[products loader] admin product fetch:", e); return null; }),
    Promise.race([
      fetchJudgemeReviews(handle, shopDomain, judgemeToken, 1, 10, externalId).catch(() => emptyReviews),
      new Promise<typeof emptyReviews>((r) => setTimeout(() => r(emptyReviews), 2500)),
    ]),
    Promise.race([
      fetchJudgemeRating(data.product.id, shopDomain, judgemeToken).catch(() => emptyRating),
      new Promise<typeof emptyRating>((r) => setTimeout(() => r(emptyRating), 2500)),
    ]),
  ]);
  const reviewsSummary = buildRatingSummary(reviewsFetchResult as any);
  const initialRating = (ratingFetchResult as any).average > 0 ? ratingFetchResult : reviewsSummary;

  // Admin node is available now — extract canonical handle and templateSuffix.
  const adminNode = (adminProductData as any)?.product ?? null;
  const adminSuffix = adminNode?.templateSuffix ?? null;

  const adminMlsMeta: Array<{ namespace: string; key: string; value: string }> =
    (adminNode?.metafields?.edges ?? [])
      .map((e: any) => e.node)
      .filter((m: any) => m?.namespace === "custom" && m?.key?.startsWith("mls_") && m?.value != null);
  if (adminMlsMeta.length > 0) {
    const existingMlsKeys = new Set(adminMlsMeta.map((m) => `${m.namespace}.${m.key}`));
    const existing = (data.product.metafields ?? []).filter(
      (m: any) => m != null && !existingMlsKeys.has(`${m.namespace}.${m.key}`)
    );
    (data.product as any).metafields = [...existing, ...adminMlsMeta];
  }
  const tagOverride = data.product.tags?.find((t: string) => t.toLowerCase().startsWith("template:"));
  const templateSuffix: string | null =
    (tagOverride ? tagOverride.replace(/^template:/i, "").trim() : null)
    ?? adminSuffix
    ?? null;

  // ── Slow data — deferred, streams in after initial render ────────────────────────────────
  const lazyData = Promise.race([
    Promise.all([
      context.storefront.query(RECOMMENDATIONS_QUERY, {
        variables: { productId: data.product.id, language, country: "AE" as const },
      }).catch(() => null),
      context.adminFetch(PAGE_SETTINGS_QUERY).catch(() => null),
      context.adminFetch(TEMPLATE_SETTINGS_QUERY).catch(() => null),
      globoPromise,
    ]).then(([recsData, settingsData, templateSettingsData, globoOptionSets]) => {
    const recommendations: ShopifyProduct[] = (recsData?.productRecommendations ?? [])
      .filter((node: any) => parseFloat(node.priceRange?.minVariantPrice?.amount ?? "0") > 0)
      .slice(0, 8)
      .map((node: any) => ({ node }));

    const pageFields: any[] =
      (settingsData as any)?.metaobjects?.nodes?.[0]?.fields ?? [];
    const getPageMeta = (key: string) => pageFields.find((f: any) => f.key === key)?.value ?? null;

    // Delivery tabs — metaobject-driven: product_page_settings.delivery_cities → delivery_city
    // (name = tab label) → rows → delivery_row (label + body). Editable in Shopify admin.
    const deliveryCities = (() => {
      const cityNodes = pageFields.find((f: any) => f.key === "delivery_cities")?.references?.nodes ?? [];
      const cities = cityNodes.map((city: any) => {
        const cf: any[] = city.fields ?? [];
        const name = cf.find((f: any) => f.key === "name")?.value ?? "";
        const rowNodes = cf.find((f: any) => f.key === "rows")?.references?.nodes ?? [];
        const rows = rowNodes
          .map((r: any) => {
            const rf: any[] = r.fields ?? [];
            return { label: rf.find((f: any) => f.key === "label")?.value ?? "", body: rf.find((f: any) => f.key === "body")?.value ?? "" };
          })
          .filter((r: any) => r.label || r.body);
        return { name, rows };
      }).filter((c: any) => c.name && c.rows.length);
      return cities.length ? cities : null;
    })();

    type TemplateAccordion = { heading: string; content: string };
    type TemplateSetting = {
      sectionTitle: string | null;
      highlightText: string | null;
      accordions: TemplateAccordion[];
    };
    const templateSettings: Record<string, TemplateSetting> = {};
    for (const node of (templateSettingsData as any)?.metaobjects?.nodes ?? []) {
      const fields: Array<{ key: string; value: string }> = node.fields ?? [];
      const getField = (k: string) => fields.find((f) => f.key === k)?.value ?? null;
      const suffix = getField("template_suffix");
      if (!suffix) continue;
      let accordions: TemplateAccordion[] = [];
      try {
        const raw = getField("accordions");
        if (raw) accordions = JSON.parse(raw);
      } catch { /* malformed JSON */ }
      templateSettings[suffix] = {
        sectionTitle: getField("section_title"),
        highlightText: getField("highlight_text"),
        accordions,
      };
    }

    return {
      recommendations,
      globoOptionSets,
      templateSettings,
      pageSettings: {
        deliveryTitle: getPageMeta("delivery_title") ?? "Delivery Info",
        deliveryContent: getPageMeta("delivery_content"),
        supportTitle: getPageMeta("support_title") ?? "Customer Support",
        supportContent: getPageMeta("support_content"),
        dubaiDeliveryInfo:    (() => { try { const v = getPageMeta("dubai_delivery_info");    return v ? JSON.parse(v) : null; } catch { return null; } })(),
        abudhabiDeliveryInfo: (() => { try { const v = getPageMeta("abudhabi_delivery_info"); return v ? JSON.parse(v) : null; } catch { return null; } })(),
        sharjahDeliveryInfo:  (() => { try { const v = getPageMeta("sharjah_delivery_info");  return v ? JSON.parse(v) : null; } catch { return null; } })(),
        deliveryCities,
        freeReturnsTitle: getPageMeta("free_returns_title") ?? undefined,
        freeReturns: (() => { try { const v = getPageMeta("free_returns"); return v ? JSON.parse(v) : null; } catch { return null; } })(),
        badgeImage: getPageMeta("badge_image"),
      },
    };
    }),
    new Promise<typeof EMPTY_LAZY>((resolve) =>
      setTimeout(() => resolve({ ...EMPTY_LAZY }), 4000)
    ),
  ]);

  // Sanitize server-side so the client never receives dangerous HTML payloads
  if (data.product?.descriptionHtml) {
    data.product.descriptionHtml = sanitizeHtml(data.product.descriptionHtml);
  }

  const iconBadges: any[] = (iconBadgesRaw as any)?.nodes?.nodes ?? [];

  // Admin API always returns the original English handle regardless of Translate & Adapt.
  // Used by the locale switcher to navigate to the EN product URL without 404.
  const canonicalHandle: string = adminNode?.handle ?? handle;

  return {
    product: data.product,
    canonicalHandle,
    templateSuffix,
    sellingPlanGroupsRaw: data.product.sellingPlanGroups?.nodes ?? [],
    discountMap,
    externalId: externalId ?? null,
    reviews: ((reviewsFetchResult as any).reviews ?? []).filter((r: any) => r.rating >= 4),
    reviewsTotalCount: (reviewsFetchResult as any).total_count ?? 0,
    rating: initialRating,
    iconBadges,
    lazyData,
  };
}

function renderTemplate(suffix: string | null | undefined, props: any) {
  // Suffixes verified against live Shopify store (807 products, scanned 2026-06-11)
  switch (suffix) {
    // ── Existing templates ───────────────────────────────────────────────────
    case "beef-rubs":           return <BeefRubsTemplate {...props} />;
    case "chicken-rub":         return <ChickenRubsTemplate {...props} />;
    case "lamb-rub":            return <LambRubsTemplate {...props} />;
    case "whole-cuts":
    case "abu-dhabi-10kg-aus":  return <WholeCutsTemplate {...props} />;
    case "box-collections":
    case "prime-signature-box":
    case "nadeem-s-box":
    case "prime-steak-box":
    case "recharge-bundle":
    case "bundle-builder":      return <BoxCollectionsTemplate {...props} />;
    // ── New templates ────────────────────────────────────────────────────────
    case "seasoned-marinades":  return <SeasonedMarinadesTemplate {...props} />;
    case "picanha":
    case "picanha_":            return <PicanhaCutTemplate {...props} />;
    case "whole-carcass":       return <WholeCarcassTemplate {...props} />;
    case "kebab-1-9kg-marinaded":
    case "kebab-2-9kg":
    case "nadeem_bbq":          return <KebabTemplate {...props} />;
    // ── Default ──────────────────────────────────────────────────────────────
    default:                    return <DefaultTemplate {...props} />;
  }
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  const product = data?.product;
  // Use Shopify SEO fields first (set in Admin → product → Search engine listing)
  const title = product?.seo?.title?.trim()
    || (product?.title ? `Buy ${product.title} Online in Dubai & Abu Dhabi - MLS Oman` : "MLS Oman — Fresh Meat Delivery in Dubai & Abu Dhabi");
  const description = (product?.seo?.description?.trim()
    || product?.description
    || "Premium halal meat delivered across UAE.").slice(0, 160);
  const image = product?.images?.edges?.[0]?.node?.url ?? product?.images?.nodes?.[0]?.url;
  const canonical = `https://mls.om${location.pathname}`;

  const variants = product?.variants?.nodes ?? product?.variants?.edges?.map((e: any) => e.node) ?? [];
  const firstVariant = variants[0];
  const price = firstVariant?.price?.amount ?? product?.priceRange?.minVariantPrice?.amount ?? "0";
  const currency = firstVariant?.price?.currencyCode ?? product?.priceRange?.minVariantPrice?.currencyCode ?? "OMR";
  const inStock = product?.availableForSale !== false;

  const jsonLd = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: product?.title ?? "",
    description,
    url: canonical,
    ...(image ? { image: [image] } : {}),
    brand: { "@type": "Brand", name: "MLS Oman" },
    offers: variants.length
      ? variants.map((v: any) => ({
          "@type": "Offer",
          priceCurrency: v.price?.currencyCode ?? currency,
          price: v.price?.amount ?? price,
          availability: v.availableForSale
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          url: canonical,
          itemCondition: "https://schema.org/NewCondition",
        }))
      : {
          "@type": "Offer",
          priceCurrency: currency,
          price,
          availability: inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          url: canonical,
          itemCondition: "https://schema.org/NewCondition",
        },
  };

  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "product" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { property: "og:url", content: canonical },
    { tagName: "link", rel: "canonical", href: canonical },
    { "script:ld+json": jsonLd },
  ];
};

export function ErrorBoundary() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-5xl font-black text-crimson">{is404 ? "404" : "!"}</p>
      <h1 className="mt-3 text-xl font-bold">{is404 ? "Product not found" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {is404 ? "This product doesn't exist or has been removed." : "We hit an unexpected error. Please try again."}
      </p>
      <a href="/" className="mt-6 inline-block rounded-lg bg-crimson px-6 py-3 text-sm font-bold text-white hover:bg-rich-red">
        Back to Home
      </a>
    </div>
  );
}

export default function Product() {
  const { templateSuffix, lazyData, reviews, reviewsTotalCount, rating, ...criticalProps } = useLoaderData<typeof loader>();

  return (
    <Suspense fallback={renderTemplate(templateSuffix, { ...criticalProps, reviews, reviewsTotalCount, rating, ...EMPTY_LAZY })}>
      <Await resolve={lazyData}>
        {(lazy) => renderTemplate(templateSuffix, { ...criticalProps, reviews, reviewsTotalCount, rating, ...lazy })}
      </Await>
    </Suspense>
  );
}

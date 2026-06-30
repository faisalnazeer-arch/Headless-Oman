import { useState, useMemo, useRef, useEffect } from "react";
import { detectLanguage } from "~/lib/locale";
import { useT, type TKey } from "~/i18n/strings";
import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import type { ShouldRevalidateFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useNavigation, useFetcher, useRouteError, isRouteErrorResponse } from "react-router";
import { SlidersHorizontal, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { ShopifyProduct } from "~/lib/shopify";
import { ProductCard } from "~/components/product/ProductCard";

// ── Native Shopify facets (Search & Discovery app — the same filters the theme used) ──
//   filter.p.m.custom.origin              → "Shop By Origin"  (product metafield custom.origin)
//   filter.p.m.custom.cut_style           → "Shop By Cuts"    (product metafield custom.cut_style)
//   filter.p.m.custom.mls_marbling_score2 → "Marbling Score"  (MB 4/5, 6/7, 8/9) — only appears
//     once the metafield is enabled as a filter in the Search & Discovery app; otherwise hidden.
// Listed here in display order; price is handled separately as a client-side slider.
const FACET_ORDER = ["filter.p.m.custom.origin", "filter.p.m.custom.cut_style", "filter.p.m.custom.mls_marbling_score2"];
// Map a facet group id → a translation key for its heading (falls back to the Shopify label).
const FACET_TITLE_KEY: Record<string, TKey> = {
  "filter.p.m.custom.origin": "collection.shop_origin",
  "filter.p.m.custom.cut_style": "collection.shop_cuts",
};
// Plain-label overrides for facets that have no translation key (e.g. a metafield filter
// enabled later in Search & Discovery, whose raw label would otherwise show).
const FACET_LABEL: Record<string, string> = {
  "filter.p.m.custom.mls_marbling_score2": "Marbling Score",
};

type FilterValue = { id: string; label: string; count: number; input: string };
type FilterGroup = { id: string; label: string; type: string; values: FilterValue[] };

// Map a native facet value → its Shopify filter URL param (key/value), e.g.
// { key: "filter.p.m.custom.origin", value: "United States" } — identical to the theme's URLs.
function facetParam(groupId: string, valueInput: string): { key: string; value: string } | null {
  try {
    const input = JSON.parse(valueInput);
    if (input.productMetafield)      return { key: groupId, value: String(input.productMetafield.value) };
    if (input.tag != null)           return { key: "filter.p.tag", value: String(input.tag) };
    if (input.productType != null)   return { key: "filter.p.product_type", value: String(input.productType) };
    if (input.productVendor != null) return { key: "filter.p.vendor", value: String(input.productVendor) };
    if (input.available != null)     return { key: "filter.v.availability", value: input.available ? "1" : "0" };
  } catch { /* ignore malformed input */ }
  return null;
}

// Merge duplicate / inconsistent metafield spellings under one clean label. Selecting a merged
// label filters by ALL its variant values at once (Shopify ORs same-key filter values).
const VALUE_MERGE: Record<string, Record<string, string[]>> = {
  "filter.p.m.custom.origin": {
    "Australia": ["Australia", "Australian", "Australia (Grass Fed)"],
    "India":     ["India", "Indian"],
    "Pakistan":  ["Pakistan", "Pakistani"],
    "Somalia":   ["Somali", "Somalian"],
    "Japan":     ["Japan", "Japanese"],
  },
  "filter.p.m.custom.cut_style": {
    "Shanks": ["Shank", "Shanks"],
  },
  "filter.p.m.custom.mls_marbling_score2": {
    "MB 8/9": ["MB 8/9", "8"], // fold the stray "8" value into the MB 8/9 band
  },
};

type DisplayRow = { label: string; count: number; key: string; values: string[] };

// Collapse a facet group's raw values into display rows (merging duplicate spellings),
// summing counts and tracking every underlying metafield value for filtering.
function buildRows(group: FilterGroup): DisplayRow[] {
  const merge = VALUE_MERGE[group.id] ?? {};
  const variantToCanon: Record<string, string> = {};
  for (const [canon, variants] of Object.entries(merge)) for (const v of variants) variantToCanon[v.toLowerCase()] = canon;
  const rows: Record<string, DisplayRow> = {};
  for (const v of group.values) {
    if (v.count <= 0) continue;
    const param = facetParam(group.id, v.input);
    if (!param) continue;
    const canon  = variantToCanon[param.value.toLowerCase()];
    const rowKey = canon ?? param.value;
    if (!rows[rowKey]) rows[rowKey] = { label: canon ?? v.label, count: 0, key: param.key, values: [] };
    rows[rowKey].count += v.count;
    if (!rows[rowKey].values.includes(param.value)) rows[rowKey].values.push(param.value);
  }
  // Marbling reads naturally low→high (MB 4/5, 6/7, 8/9); other facets sort by popularity.
  const byLabel = group.id === "filter.p.m.custom.mls_marbling_score2";
  return Object.values(rows).sort((a, b) => (byLabel ? a.label.localeCompare(b.label) : b.count - a.count));
}

const COLLECTION_QUERY = `#graphql
  query Collection(
    $handle: String!
    $first: Int!
    $after: String
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
    $filters: [ProductFilter!]
    $language: LanguageCode
    $country: CountryCode
  ) @inContext(language: $language, country: $country) {
    collection(handle: $handle) {
      id title handle description descriptionHtml
      seo { title description }
      products(first: $first, after: $after, sortKey: $sortKey, reverse: $reverse, filters: $filters) {
        pageInfo {
          hasNextPage
          endCursor
        }
        filters {
          id
          label
          type
          values { id label count input }
        }
        edges {
          node {
            id title handle tags availableForSale
            vendor description productType
            priceRange {
              minVariantPrice { amount currencyCode }
              maxVariantPrice { amount currencyCode }
            }
            compareAtPriceRange { minVariantPrice { amount currencyCode } }
            images(first: 2) { edges { node { url altText width height } } }
            options { name values }
            variants(first: 100) {
              edges {
                node {
                  id title availableForSale quantityAvailable
                  price { amount currencyCode }
                  compareAtPrice { amount currencyCode }
                  selectedOptions { name value }
                }
              }
            }
            metafields(identifiers: [
              {namespace: "reviews", key: "rating"}
              {namespace: "reviews", key: "rating_count"}
            ]) { key value }
          }
        }
      }
    }
  }
` as const;

const SORT_OPTIONS = [
  { label: "Featured",           key: "COLLECTION_DEFAULT", reverse: false },
  { label: "Price: Low to High", key: "PRICE",              reverse: false },
  { label: "Price: High to Low", key: "PRICE",              reverse: true  },
  { label: "Newest",             key: "CREATED",            reverse: true  },
  { label: "Best Selling",       key: "BEST_SELLING",       reverse: false },
];

const PAGE_SIZE = 24;

// Re-fetch when the collection handle, sort, or selected facets change. Pagination
// (?after) uses useFetcher directly so it bypasses shouldRevalidate entirely.
export function shouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  const filterSig = (u: URL) => [...u.searchParams.entries()].filter(([k]) => k.startsWith("filter.")).map(([k, v]) => `${k}=${v}`).sort().join("§");
  const sameHandle  = currentUrl.pathname === nextUrl.pathname;
  const sameSort    = currentUrl.searchParams.get("sort") === nextUrl.searchParams.get("sort");
  const sameFilters = filterSig(currentUrl) === filterSig(nextUrl);
  // Re-run the loader on ANY handle/sort/filter change; skip only when nothing relevant changed
  // (e.g. ?after pagination, which goes through useFetcher and bypasses this anyway).
  return !(sameHandle && sameSort && sameFilters);
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  const { handle } = params;
  if (!handle) throw new Response("Missing handle", { status: 400 });

  const url    = new URL(request.url);
  const sortIdx = Math.min(parseInt(url.searchParams.get("sort") ?? "0"), SORT_OPTIONS.length - 1);
  const after   = url.searchParams.get("after") ?? undefined;
  const { key: sortKey, reverse } = SORT_OPTIONS[sortIdx];

  // Selected facets use Shopify's native filter URL params — the same scheme as the theme:
  //   ?filter.p.m.custom.origin=United States&filter.p.m.custom.cut_style=Mince
  const appliedFilters: string[] = [];
  const productFilters: any[] = [];
  let priceMin: number | undefined;
  let priceMax: number | undefined;
  for (const [key, value] of url.searchParams.entries()) {
    if (!key.startsWith("filter.")) continue;
    appliedFilters.push(`${key}=${value}`);
    if (key.startsWith("filter.p.m.")) {
      const rest = key.slice("filter.p.m.".length);      // e.g. "custom.origin"
      const dot  = rest.indexOf(".");
      if (dot > 0) productFilters.push({ productMetafield: { namespace: rest.slice(0, dot), key: rest.slice(dot + 1), value } });
    } else if (key === "filter.p.tag")        productFilters.push({ tag: value });
    else if (key === "filter.p.product_type") productFilters.push({ productType: value });
    else if (key === "filter.p.vendor")       productFilters.push({ productVendor: value });
    else if (key === "filter.v.availability") productFilters.push({ available: value === "1" || value === "true" });
    else if (key === "filter.v.price.gte")    priceMin = parseFloat(value);
    else if (key === "filter.v.price.lte")    priceMax = parseFloat(value);
  }
  if (priceMin !== undefined || priceMax !== undefined) {
    productFilters.push({ price: { ...(priceMin !== undefined ? { min: priceMin } : {}), ...(priceMax !== undefined ? { max: priceMax } : {}) } });
  }

  const data = await context.storefront.query(COLLECTION_QUERY, {
    variables: {
      handle,
      first: PAGE_SIZE,
      after,
      sortKey,
      reverse,
      filters: productFilters,
      language,
      country: "AE" as const,
    },
    cache: context.storefront.CacheShort(),
  });
  if (!data.collection) throw new Response("Not found", { status: 404 });

  return {
    collection: data.collection,
    sortIdx,
    appliedFilters,
    availableFilters: (data.collection.products.filters ?? []) as FilterGroup[],
    pageInfo: data.collection.products.pageInfo as { hasNextPage: boolean; endCursor: string | null },
  };
}

/* ─── Description ─────────────────────────────────────────────────────────── */
function CollectionDescription({ html }: { html: string }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [isLong, setIsLong] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setIsLong(el.scrollHeight > el.clientHeight + 4);
  }, [html]);

  return (
    <div className="mx-auto mt-3 max-w-2xl text-left">
      <div
        ref={ref}
        className={`prose prose-sm prose-neutral dark:prose-invert max-w-none text-muted-foreground transition-all [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_li]:mb-1 ${!expanded ? "max-h-20 overflow-hidden" : ""}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs font-semibold text-crimson hover:underline"
        >
          {expanded ? t("collection.read_less") : t("collection.read_more")}
        </button>
      )}
    </div>
  );
}

export const meta: MetaFunction<typeof loader> = ({ data, location }) => {
  const seo = (data?.collection as any)?.seo;
  // Prefer the Shopify SEO fields (Search engine listing), fall back to the collection's own title/description.
  const title = seo?.title?.trim() || `${data?.collection?.title ?? "Collection"} — MLS Oman`;
  const description = seo?.description?.trim() || data?.collection?.description || "";
  const image = (data?.collection as any)?.image?.url as string | undefined;
  const canonical = `https://mls.om${location.pathname}`;

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://mls.om/" },
      { "@type": "ListItem", position: 2, name: "Collections", item: "https://mls.om/collections" },
      { "@type": "ListItem", position: 3, name: data?.collection?.title ?? "Collection", item: canonical },
    ],
  };

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: data?.collection?.title ?? "Collection",
    description,
    url: canonical,
    ...(image ? { image } : {}),
    provider: { "@type": "Organization", name: "MLS Oman", url: "https://mls.om" },
  };

  return [
    { title },
    { name: "description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { property: "og:url", content: canonical },
    { tagName: "link", rel: "canonical", href: canonical },
    { "script:ld+json": breadcrumbLd },
    { "script:ld+json": collectionLd },
  ];
};

/* ─── Main route component ────────────────────────────────────────────────── */
export default function Collection() {
  const { collection, sortIdx, appliedFilters, availableFilters, pageInfo } = useLoaderData<typeof loader>();
  const t = useT();

  const navigate    = useNavigate();
  const navigation  = useNavigation();
  const isLoading   = navigation.state === "loading";
  const fetcher     = useFetcher<typeof loader>();

  // Page 1 always comes straight from the loader (so it's fresh the instant filters/sort change);
  // Load More appends extra pages into `extraEdges`, which we clear when the loader result changes.
  const loaderKey = `${collection.id}|${sortIdx}|${appliedFilters.join("§")}`;
  const [extraEdges, setExtraEdges]   = useState<ShopifyProduct[]>([]);
  const [cursor, setCursor]           = useState<string | null>(pageInfo.endCursor ?? null);
  const [hasMore, setHasMore]         = useState(pageInfo.hasNextPage);
  const [maxPrice, setMaxPrice]       = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Reset pagination + price whenever the loader returns a new result set (collection/sort/filter change).
  useEffect(() => {
    setExtraEdges([]);
    setCursor(pageInfo.endCursor ?? null);
    setHasMore(pageInfo.hasNextPage);
    setMaxPrice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderKey]);

  // Derived list = the loader's current page 1 (never stale) + any extra pages from Load More.
  const allProducts = useMemo(
    () => [...collection.products.edges, ...extraEdges],
    [collection.products.edges, extraEdges],
  );

  // Append products when the Load More fetcher returns the next page.
  useEffect(() => {
    const fd = fetcher.data as ReturnType<typeof useLoaderData<typeof loader>> | undefined;
    if (!fd?.collection?.products?.edges) return;
    setExtraEdges((prev) => [...prev, ...fd.collection.products.edges]);
    setCursor(fd.pageInfo.endCursor ?? null);
    setHasMore(fd.pageInfo.hasNextPage);
  }, [fetcher.data]);

  const handleLoadMore = () => {
    if (!cursor || fetcher.state !== "idle") return;
    const url = new URL(window.location.href);
    url.searchParams.set("after", cursor);
    fetcher.load(url.pathname + url.search);
  };

  // ── Facet selection (server-side via URL) ──────────────────────────────────
  const facetGroups = useMemo(
    () => FACET_ORDER.map((id) => availableFilters.find((f) => f.id === id)).filter(Boolean) as FilterGroup[],
    [availableFilters]
  );

  // Reflect the in-flight navigation immediately so a ticked box feels instant — the grid
  // stays on screen and updates in place when Shopify responds; the page never reloads.
  const effectiveApplied = useMemo(() => {
    if (navigation.state === "loading" && navigation.location) {
      const sp = new URLSearchParams(navigation.location.search);
      return [...sp.entries()].filter(([k]) => k.startsWith("filter.")).map(([k, v]) => `${k}=${v}`);
    }
    return appliedFilters;
  }, [navigation.state, navigation.location, appliedFilters]);

  const toggleFacet = (key: string, values: string[], checked: boolean) => {
    const url = new URL(window.location.href);
    const existing = url.searchParams.getAll(key);
    url.searchParams.delete(key);
    const next = checked ? [...existing, ...values] : existing.filter((v) => !values.includes(v));
    [...new Set(next)].forEach((v) => url.searchParams.append(key, v));
    url.searchParams.delete("after");
    navigate(url.pathname + url.search, { preventScrollReset: true });
  };

  // ── Price (client-side slider over the loaded, server-filtered products) ────
  const allPrices = allProducts.map((p) => parseFloat(p.node.priceRange.minVariantPrice.amount));
  const globalMax = Math.ceil(Math.max(...allPrices, 0));
  const priceMax  = maxPrice ?? globalMax;

  const filtered = useMemo(() => {
    return allProducts.filter((p) => {
      const price = parseFloat(p.node.priceRange.minVariantPrice.amount);
      if (price === 0) return false;
      return price <= priceMax;
    });
  }, [allProducts, priceMax]);

  const clearAll = () => {
    setMaxPrice(null);
    const url = new URL(window.location.href);
    [...url.searchParams.keys()].filter((k) => k.startsWith("filter.")).forEach((k) => url.searchParams.delete(k));
    url.searchParams.delete("after");
    navigate(url.pathname + url.search, { preventScrollReset: true });
  };
  const activeFacetCount = useMemo(
    () => facetGroups.reduce(
      (n, g) => n + buildRows(g).filter((r) => r.values.some((v) => effectiveApplied.includes(`${r.key}=${v}`))).length,
      0,
    ),
    [facetGroups, effectiveApplied],
  );

  const isLoadingMore = fetcher.state !== "idle";

  return (
    <div className="bg-background min-h-screen">
      <div className="border-b border-border bg-card px-4 py-8 md:py-10">
        <div className="container mx-auto text-center">
          <h1 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">{collection.title}</h1>
          {(collection as any).descriptionHtml && <CollectionDescription html={(collection as any).descriptionHtml} />}
        </div>
      </div>

      <div className="container mx-auto flex gap-6 px-4 py-6">
        {/* Sidebar desktop */}
        <aside className="hidden w-64 flex-shrink-0 lg:block">
          <FilterPanel
            groups={facetGroups} appliedFilters={effectiveApplied} onToggleFacet={toggleFacet}
            globalMax={globalMax} priceMax={priceMax} setMaxPrice={setMaxPrice}
            activeFacetCount={activeFacetCount} onClearAll={clearAll}
          />
        </aside>

        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="mb-4">
            <div className="flex items-center justify-between gap-3">
              {/* Left: Filters button (mobile) */}
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium lg:hidden"
              >
                <SlidersHorizontal className="h-4 w-4" /> {t("collection.filters")}
                {activeFacetCount > 0 && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-crimson text-[10px] font-bold text-white">
                    {activeFacetCount}
                  </span>
                )}
              </button>
              {/* Count — desktop only inline */}
              <span className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
                {filtered.length} {t("collection.products_of")} {allProducts.length} {t("collection.products_label")}{hasMore ? "+" : ""}
                {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-crimson" />}
              </span>
              {/* Right: Sort */}
              <div className="relative ml-auto">
                <select
                  value={sortIdx}
                  onChange={(e) => {
                    const url = new URL(window.location.href);
                    url.searchParams.set("sort", e.target.value);
                    url.searchParams.delete("after");
                    navigate(url.pathname + url.search, { replace: true, preventScrollReset: true });
                  }}
                  className="appearance-none rounded-lg border border-border bg-card py-2 pl-3 pr-8 text-sm font-medium"
                >
                  {[
                    t("collection.sort_featured"),
                    t("collection.sort_price_low"),
                    t("collection.sort_price_high"),
                    t("collection.sort_newest"),
                    t("collection.sort_best_selling"),
                  ].map((label, i) => (
                    <option key={i} value={i}>{label}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            {/* Count — mobile only, below the row */}
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground lg:hidden">
              {filtered.length} {t("collection.products_of")} {allProducts.length} {t("collection.products_label")}{hasMore ? "+" : ""}
              {isLoading && <Loader2 className="h-3 w-3 animate-spin text-crimson" />}
            </p>
          </div>

          {/* Mobile filter drawer */}
          {filtersOpen && (
            <div className="fixed inset-0 z-50 flex lg:hidden">
              <div className="absolute inset-0 bg-black/40" onClick={() => setFiltersOpen(false)} />
              <div className="relative ml-auto h-full w-72 overflow-y-auto bg-card p-5 shadow-xl">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-semibold">{t("collection.filters")}</span>
                  <button type="button" onClick={() => setFiltersOpen(false)}><X className="h-5 w-5" /></button>
                </div>
                <FilterPanel
                  groups={facetGroups} appliedFilters={effectiveApplied} onToggleFacet={toggleFacet}
                  globalMax={globalMax} priceMax={priceMax} setMaxPrice={setMaxPrice}
                  activeFacetCount={activeFacetCount} onClearAll={clearAll}
                />
              </div>
            </div>
          )}

          {/* Product grid */}
          {isLoading && allProducts.length === 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : !isLoading && filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
              <p className="text-lg font-medium">{t("collection.no_products")}</p>
              <button type="button" onClick={clearAll} className="mt-3 text-sm text-crimson underline">
                {t("collection.clear_filters")}
              </button>
            </div>
          ) : (
            <>
              {/* Products stay on screen during a filter/sort change — they update in place
                  when Shopify responds (the loading cue is the small spinner by the count). */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => (
                  <ProductCard key={p.node.id} product={p} collectionHandle={collection.handle} />
                ))}
              </div>

              {/* Load-more skeleton rows while fetching */}
              {isLoadingMore && (
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {Array.from({ length: PAGE_SIZE }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              )}

              {/* Load More button */}
              {hasMore && !isLoadingMore && (
                <div className="mt-10 flex justify-center">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="inline-flex items-center gap-2 rounded-lg border border-crimson px-8 py-3 text-sm font-semibold text-crimson transition-colors hover:bg-crimson hover:text-white"
                  >
                    {t("collection.load_more")}
                  </button>
                </div>
              )}

              {/* Spinner during load */}
              {isLoadingMore && (
                <div className="mt-6 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-crimson" />
                </div>
              )}

              {/* End of results */}
              {!hasMore && allProducts.length > PAGE_SIZE && (
                <p className="mt-10 text-center text-sm text-muted-foreground">
                  {allProducts.length} {t("collection.all_loaded")}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Filter Panel ─────────────────────────────────────────────────────────── */
interface FilterPanelProps {
  groups: FilterGroup[];
  appliedFilters: string[];
  onToggleFacet: (key: string, values: string[], checked: boolean) => void;
  globalMax: number;
  priceMax: number;
  setMaxPrice: (v: number | null) => void;
  activeFacetCount: number;
  onClearAll: () => void;
}

function FilterSection({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border pb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-2 text-xs font-bold uppercase tracking-widest hover:text-crimson"
      >
        {title}
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

function FilterPanel({ groups, appliedFilters, onToggleFacet, globalMax, priceMax, setMaxPrice, activeFacetCount, onClearAll }: FilterPanelProps) {
  const t = useT();
  const activeCount = activeFacetCount + (priceMax < globalMax ? 1 : 0);

  return (
    <div className="flex flex-col gap-0">
      <div className="mb-4 flex items-center justify-between">
        <p className="font-bold">
          {t("collection.filters")}{" "}
          {activeCount > 0 && (
            <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-crimson text-[10px] text-white">
              {activeCount}
            </span>
          )}
        </p>
        {activeCount > 0 && (
          <button type="button" onClick={onClearAll} className="text-xs text-crimson hover:underline">
            {t("collection.clear_all")}
          </button>
        )}
      </div>

      <FilterSection title={t("collection.price_range")}>
        <input
          type="range" min={0} max={globalMax} value={priceMax}
          onChange={(e) => setMaxPrice(parseInt(e.target.value) === globalMax ? null : parseInt(e.target.value))}
          className="w-full accent-crimson"
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>OMR 0</span>
          <span className="font-medium text-foreground">OMR {priceMax}</span>
        </div>
      </FilterSection>

      {groups.map((group) => {
        const rows = buildRows(group);
        if (rows.length === 0) return null;
        const titleKey = FACET_TITLE_KEY[group.id];
        const title = titleKey ? t(titleKey) : (FACET_LABEL[group.id] ?? group.label);
        return (
          <FilterSection key={group.id} title={title}>
            <div className="flex flex-col gap-1">
              {rows.map((r) => {
                const checked = r.values.some((v) => appliedFilters.includes(`${r.key}=${v}`));
                return (
                  <label key={r.label} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted ${checked ? "bg-crimson/5 font-medium text-crimson" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => onToggleFacet(r.key, r.values, !checked)} className="h-4 w-4 accent-crimson flex-shrink-0" />
                    <span className="flex-1">{r.label}</span>
                    <span className="text-xs text-muted-foreground">({r.count})</span>
                  </label>
                );
              })}
            </div>
          </FilterSection>
        );
      })}
    </div>
  );
}

/* ─── Skeleton Card ────────────────────────────────────────────────────────── */
export function ErrorBoundary() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-5xl font-black text-crimson">{is404 ? "404" : "!"}</p>
      <h1 className="mt-3 text-xl font-bold">{is404 ? "Collection not found" : "Something went wrong"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {is404 ? "This collection doesn't exist or has been removed." : "We hit an unexpected error. Please try again."}
      </p>
      <a href="/" className="mt-6 inline-block rounded-lg bg-crimson px-6 py-3 text-sm font-bold text-white hover:bg-rich-red">
        Back to Home
      </a>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <div className="aspect-square w-full animate-pulse bg-muted" />
      <div className="flex flex-col gap-2 p-3">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-20 animate-pulse rounded bg-muted" />
        <div className="mt-1 h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}

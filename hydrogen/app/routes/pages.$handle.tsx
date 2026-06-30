import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, Link } from "react-router";
import { applyArImages } from "~/lib/arImages";
import { LpHeroSlide } from "~/components/landing-pages/LpHeroSlide";
import { LpProductGridSection } from "~/components/landing-pages/LpProductGridSection";
import { LpReelsSection } from "~/components/landing-pages/LpReelsSection";
import { LpValueBannerSection } from "~/components/landing-pages/LpValueBannerSection";
import { LpIconsSection } from "~/components/landing-pages/LpIconsSection";
import { LpMessageBanner } from "~/components/landing-pages/LpMessageBanner";
import { LpReviewsCarousel } from "~/components/landing-pages/LpReviewsCarousel";
import { YoutubeReelsSection } from "~/components/landing-pages/YoutubeReelsSection";
import { LpCertificationsSection } from "~/components/landing-pages/LpCertificationsSection";
import { LpProductCarousel } from "~/components/landing-pages/LpProductCarousel";
import type { ShopifyProduct } from "@/lib/shopify";

// ── Product fragment ──────────────────────────────────────────────────────────

const PRODUCT_FRAGMENT = `
  fragment ProductCard on Product {
    id title description handle tags vendor productType availableForSale
    priceRange {
      minVariantPrice { amount currencyCode }
      maxVariantPrice { amount currencyCode }
    }
    compareAtPriceRange { minVariantPrice { amount currencyCode } }
    images(first: 4) { edges { node { url altText width height } } }
    variants(first: 100) {
      edges {
        node {
          id title price { amount currencyCode }
          compareAtPrice { amount currencyCode }
          availableForSale
          selectedOptions { name value }
          quantityAvailable
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

// ── PAGE_QUERY ────────────────────────────────────────────────────────────────
// Structure mirrors faraz-dev exactly.
// Level-0 references.nodes = lp_page wrapper OR direct lp_types node
//   lp_page path:  Level-0 → lp_page.fields.sections.references.nodes → Level-1 (lp_types)
//                  Level-1 → lp_types.fields → reference (slide, value_banner, product_grid, certifications)
//                                             → references.nodes (icon, slider, message_banner, reviews, reels_yt)
//   direct path:   Level-0 = lp_types itself
//                  Level-0.fields.reference = single-ref sections (slide, value_banner, product_grid, certifications, sub_banner)
//                  Level-0.fields.references.nodes = list-ref sections (icon, slider, message_banner, reviews, reels_yt)

const PAGE_QUERY = `#graphql
  query LandingPage($handle: String!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    page(handle: $handle) {
      title
      body
      seo { title description }
      metafields(identifiers: [
        { namespace: "custom", key: "sections" }
        { namespace: "custom", key: "template" }
      ]) {
        key
        value
        references(first: 20) {
          nodes {
            ... on Metaobject {
              type
              handle
              fields {
                key value type
                # ── Level-0 single-ref fields ─────────────────────────────────
                # Used when Level-0 node IS a direct lp_types (not wrapped in lp_page).
                # Fetches: slide, value_banner, product_grid, certifications, sub_banner
                reference {
                  ... on MediaImage { image { url altText } }
                  ... on Metaobject {
                    type handle
                    fields {
                      key value type
                      reference {
                        ... on MediaImage { image { url altText } }
                        ... on Collection { handle title }
                      }
                      references(first: 20) {
                        nodes {
                          ... on Collection { handle title }
                          ... on Metaobject {
                            type handle
                            fields {
                              key value
                              reference { ... on MediaImage { image { url altText } } }
                            }
                          }
                        }
                      }
                    }
                  }
                  ... on Collection { handle title }
                }
                # ── Level-0 list-ref fields ──────────────────────────────────
                # Two purposes:
                #   1. lp_page.sections → lp_types nodes (when Level-0 is lp_page)
                #   2. Direct lp_types list-ref sections: icon, slider, message_banner, reviews, reels_yt
                references(first: 20) {
                  nodes {
                    ... on Metaobject {
                      type handle
                      fields {
                        key value type
                        # lp_types single-ref fields (when Level-0 is lp_page):
                        #   slide, value_banner, product_grid, certifications, sub_banner
                        reference {
                          ... on MediaImage { image { url altText } }
                          ... on Metaobject {
                            type handle
                            fields {
                              key value type
                              reference {
                                ... on MediaImage { image { url altText } }
                                ... on Collection { handle title }
                              }
                              references(first: 20) {
                                nodes {
                                  ... on Collection { handle title }
                                  ... on Metaobject {
                                    type handle
                                    fields {
                                      key value
                                      reference { ... on MediaImage { image { url altText } } }
                                    }
                                  }
                                }
                              }
                            }
                          }
                          ... on Collection { handle title }
                        }
                        # lp_types list-ref fields (icon, slider, reviews, reels_yt, message_banner)
                        references(first: 20) {
                          nodes {
                            ... on Metaobject {
                              id type handle
                              fields {
                                key value
                                reference {
                                  ... on MediaImage { image { url altText } }
                                  ... on Metaobject {
                                    type handle
                                    fields { key value }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
` as const;

const REEL_ITEMS_QUERY = `#graphql
  query LpReelItems($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "reel_item", first: 20) {
      nodes {
        id
        fields {
          key
          value
          reference {
            ... on Video {
              sources { url mimeType }
              previewImage { url }
            }
            ... on Product {
              id title handle
              featuredImage { url altText }
              priceRange { minVariantPrice { amount currencyCode } }
            }
          }
        }
      }
    }
  }
` as const;

const COLLECTION_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_FRAGMENT}
  query LpCollectionProducts($handle: String!, $language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    collection(handle: $handle) {
      products(first: 12) { nodes { ...ProductCard } }
    }
  }
` as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFieldRef(fields: any[], key: string): any | null {
  return fields?.find((f: any) => f.key === key)?.reference ?? null;
}

// Try every field-key variant an lp_product_grid might use for its collection
function resolveCollectionHandle(pf: any[]): string | null {
  return (
    pf.find((x: any) => x.key === "grid_collection_2")?.reference?.handle ??
    pf.find((x: any) => x.key === "grid_collection")?.reference?.handle ??
    pf.find((x: any) => x.key === "collection")?.reference?.handle ??
    pf.find((x: any) => x.key === "collection_ref")?.reference?.handle ??
    pf.find((x: any) => x.key === "collection_handle")?.value ??
    pf.find((x: any) => x.reference?.handle)?.reference?.handle ??
    null
  );
}

function toShopifyProduct(node: any): ShopifyProduct {
  return {
    node: {
      ...node,
      images: node.images ?? { edges: [] },
      variants: node.variants ?? { edges: [] },
      options: node.options ?? [],
      metafields: node.metafields ?? [],
    },
  };
}

// ── Loader ────────────────────────────────────────────────────────────────────


export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const { handle } = params;
  if (!handle) throw new Response("Missing handle", { status: 400 });

  const lang = request.headers.get("Cookie")?.match(/(?:^|;\s*)lang=([a-z]{2})/)?.[1];
  const path = new URL(request.url).pathname;
  const userLanguage = (path.startsWith("/ar/") || path === "/ar" || lang === "ar" ? "AR" : "EN") as "AR" | "EN";

  // Fetch page in the user's language so Translate & Adapt translations are served.
  // If the AR query returns no section references (type not yet set up for AR in T&A),
  // fall back to EN so the page at least renders.
  let data = await context.storefront.query(PAGE_QUERY, {
    variables: { handle, language: userLanguage, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });

  if (!data.page) throw new Response("Page not found", { status: 404 });

  let metafields = (data.page.metafields ?? []).filter(Boolean);
  let sectionsMeta = metafields.find((m: any) => m?.key === "sections");
  let lpPageNodes: any[] = sectionsMeta?.references?.nodes ?? [];

  // Fall back to EN ONLY for landing pages whose sections aren't set up in AR.
  // Important: prose pages (no sections) are often reached via their translated Arabic
  // handle (e.g. /ar/pages/سياسة-الخصوصية). Re-querying that Arabic handle in EN context
  // returns null, so we must only adopt the EN result when it actually yields sections —
  // otherwise we'd blank a perfectly good AR prose page.
  if (lpPageNodes.length === 0 && userLanguage !== "EN") {
    const enData = await context.storefront.query(PAGE_QUERY, {
      variables: { handle, language: "EN" as const, country: "AE" as const },
      cache: context.storefront.CacheNone(),
    });
    const enMetafields = (enData.page?.metafields ?? []).filter(Boolean);
    const enSections = enMetafields.find((m: any) => m?.key === "sections");
    const enNodes = enSections?.references?.nodes ?? [];
    if (enNodes.length > 0) {
      data = enData;
      metafields = enMetafields;
      sectionsMeta = enSections;
      lpPageNodes = enNodes;
    }
  }

  // In Arabic, swap any landing-page image for its `*_ar` counterpart where set.
  if (userLanguage === "AR") applyArImages(lpPageNodes);

  // ── Page Template override (custom.template metafield, picked from admin) ──────────
  // "Text page" forces the simple title+body layout even if sections exist.
  // Unset (every existing page) = current auto behavior, so nothing on the frontend changes.
  const pageTemplate = (metafields.find((m: any) => m?.key === "template")?.value ?? "").toLowerCase();
  if (pageTemplate.includes("text")) lpPageNodes = [];

  // Regular prose page
  if (lpPageNodes.length === 0) {
    return {
      isLandingPage: false as const,
      page: { title: data.page?.title ?? "", body: data.page?.body ?? "", seo: data.page?.seo ?? null },
      lpPageNodes: [],
      productsByCollection: {},
      reelItems: [],
    };
  }

  // Collect every collection handle needed for product grids.
  // Handles both lp_page→lp_types nesting AND direct lp_types nodes.
  const collectionHandles = new Set<string>();

  function scanProductGrid(pf: any[]) {
    // Primary collection reference (grid_collection_2, grid_collection, etc.)
    const h = resolveCollectionHandle(pf);
    if (h) collectionHandles.add(h);
    // Carousel: lp_product_carousel is a list.collection_reference field
    const carouselNodes: any[] = pf.find((x: any) => x.key === "lp_product_carousel")?.references?.nodes ?? [];
    for (const cn of carouselNodes) {
      if (cn?.handle) collectionHandles.add(cn.handle);
    }
  }

  function scanNode(node: any) {
    const tf: any[] = node.fields ?? [];

    // Direct single ref: lp_types.fields.product_grid → lp_product_grid
    const pgRef = getFieldRef(tf, "product_grid");
    if (pgRef?.type === "lp_product_grid") {
      scanProductGrid(pgRef.fields ?? []);
    }

    // List refs: check each item for an lp_product_grid
    for (const field of tf) {
      const listNodes: any[] = field.references?.nodes ?? [];
      for (const item of listNodes) {
        if (item?.type === "lp_product_grid") {
          scanProductGrid(item.fields ?? []);
        }
      }
    }
  }

  for (const lpNode of lpPageNodes) {
    const f: any[] = lpNode.fields ?? [];
    // lp_page → lp_types nesting: sections field holds list of lp_types
    const innerNodes: any[] = f.find((x: any) => x.key === "sections")?.references?.nodes ?? [];
    if (innerNodes.length > 0) {
      innerNodes.forEach(scanNode);
    } else {
      // Direct lp_types
      scanNode(lpNode);
    }
  }

  const productsByCollection: Record<string, any[]> = {};
  const tasks: Promise<unknown>[] = Array.from(collectionHandles).map(async (collHandle) => {
    const r = await context.storefront.query(COLLECTION_PRODUCTS_QUERY, {
      variables: { handle: collHandle, language: userLanguage, country: "AE" as const },
      cache: context.storefront.CacheNone(),
    });
    productsByCollection[collHandle] = r.collection?.products?.nodes ?? [];
  });

  // Always fetch reel items — some pages use video reels
  const reelData = await context.storefront.query(REEL_ITEMS_QUERY, {
    variables: { language: userLanguage, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  const reelItems: any[] = reelData.metaobjects?.nodes ?? [];

  await Promise.all(tasks);

  return {
    isLandingPage: true as const,
    page: { title: data.page.title, body: data.page.body, seo: data.page.seo },
    lpPageNodes,
    productsByCollection,
    reelItems,
  };
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  return [
    { title: data?.page?.seo?.title ?? data?.page?.title ?? "MLS Oman" },
    { name: "description", content: data?.page?.seo?.description ?? "" },
  ];
};

// ── Section renderer ──────────────────────────────────────────────────────────

function renderLpTypes(
  lpTypes: any,
  key: string,
  productsByCollection: Record<string, any[]>,
  reelItems: any[]
): React.ReactNode[] {
  const f: any[] = lpTypes.fields ?? [];

  const DEFAULT_SECTION_ORDER = ["slide", "slider", "message_banner", "icon", "certifications", "value_banner", "reviews", "reels_yt", "reel_section", "product_grid", "sub_banner"];
  const KNOWN_KEYS = new Set(DEFAULT_SECTION_ORDER);
  const orderField = f.find((x: any) => x.key === "order")?.value ?? "";
  const orderedKeys: string[] = (() => {
    if (!orderField) return DEFAULT_SECTION_ORDER;
    // Split on both English comma and Arabic comma (T Lab may translate this field)
    const parsed = orderField.split(/[,،]/).map((s: string) => s.trim()).filter(Boolean);
    // If none match known keys the field was translated — fall back to default
    return parsed.some((k) => KNOWN_KEYS.has(k)) ? parsed : DEFAULT_SECTION_ORDER;
  })();

  const sectionMap: Record<string, React.ReactNode | null> = {};

  // ── slide / slider ────────────────────────────────────────────────────────────
  const slideRef = getFieldRef(f, "slide");
  if (slideRef?.type === "lp_hero_slide") {
    const el = <LpHeroSlide key={`${key}-slide`} node={slideRef} />;
    sectionMap["slide"] = el;
    sectionMap["slider"] = el;
  }
  if (!sectionMap["slider"]) {
    const sliderNodes: any[] = f.find((x: any) => x.key === "slider")?.references?.nodes ?? [];
    if (sliderNodes.length > 0) {
      const el = (
        <>
          {sliderNodes.map((n: any, i: number) => (
            <LpHeroSlide key={`${key}-slide-${i}`} node={n} />
          ))}
        </>
      );
      sectionMap["slide"] = el;
      sectionMap["slider"] = el;
    }
  }

  // ── message_banner ────────────────────────────────────────────────────────────
  const messageBannerNodes: any[] = f.find((x: any) => x.key === "message_banner")?.references?.nodes ?? [];
  if (messageBannerNodes.length > 0) {
    sectionMap["message_banner"] = <LpMessageBanner key={`${key}-msg`} nodes={messageBannerNodes} />;
  }

  // ── icon (trust badges) ───────────────────────────────────────────────────────
  const iconNodes: any[] = f.find((x: any) => x.key === "icon")?.references?.nodes ?? [];
  if (iconNodes.length > 0) {
    sectionMap["icon"] = <LpIconsSection key={`${key}-icons`} nodes={iconNodes} />;
  }

  // ── certifications ────────────────────────────────────────────────────────────
  const certsRef = getFieldRef(f, "certifications");
  if (certsRef?.type === "lp_certifications_section") {
    sectionMap["certifications"] = <LpCertificationsSection key={`${key}-certs`} node={certsRef} />;
  }

  // ── value_banner ──────────────────────────────────────────────────────────────
  const valueBannerRef = getFieldRef(f, "value_banner");
  if (valueBannerRef) {
    sectionMap["value_banner"] = <LpValueBannerSection key={`${key}-value`} node={valueBannerRef} />;
  }

  // ── reviews ───────────────────────────────────────────────────────────────────
  const reviewNodes: any[] = f.find((x: any) => x.key === "reviews")?.references?.nodes ?? [];
  if (reviewNodes.length > 0) {
    sectionMap["reviews"] = <LpReviewsCarousel key={`${key}-reviews`} nodes={reviewNodes} />;
  }

  // ── reels_yt (YouTube embed carousel) ────────────────────────────────────────
  const reelsYtNodes: any[] = f.find((x: any) => x.key === "reels_yt")?.references?.nodes ?? [];
  if (reelsYtNodes.length > 0) {
    sectionMap["reels_yt"] = <YoutubeReelsSection key={`${key}-yt`} nodes={reelsYtNodes} />;
  }

  // ── reel_section (legacy product video reels) ─────────────────────────────────
  const reelSectionRef = getFieldRef(f, "reel_section");
  if (reelSectionRef && reelItems.length > 0) {
    const rf: any[] = reelSectionRef.fields ?? [];
    const heading = rf.find((x: any) => x.key === "heading")?.value ?? "MLS Reels";
    const label = rf.find((x: any) => x.key === "label")?.value ?? "Watch & Shop";
    const sectionId = rf.find((x: any) => x.key === "section_id")?.value ?? reelSectionRef.handle ?? "reels";
    sectionMap["reel_section"] = (
      <LpReelsSection key={`${key}-reels`} reelItems={reelItems} heading={heading} label={label} sectionId={sectionId} />
    );
  }

  // ── product_grid ──────────────────────────────────────────────────────────────
  const productGridRef = getFieldRef(f, "product_grid");
  if (productGridRef?.type === "lp_product_grid") {
    const pf: any[] = productGridRef.fields ?? [];
    // Primary collection → grid
    const collHandle = resolveCollectionHandle(pf);
    const gridProducts = collHandle ? (productsByCollection[collHandle] ?? []).map(toShopifyProduct) : [];
    // Carousel collections (lp_product_carousel — list.collection_reference) → separate carousels
    const carouselNodes: any[] = pf.find((x: any) => x.key === "lp_product_carousel")?.references?.nodes ?? [];
    const carousels = carouselNodes
      .filter((cn: any) => cn?.handle)
      .map((cn: any) => ({
        handle: cn.handle as string,
        title: (cn.title ?? cn.handle) as string,
        products: (productsByCollection[cn.handle] ?? []).map(toShopifyProduct),
      }));
    sectionMap["product_grid"] = (
      <div id="products" key={`${key}-grid`}>
        {gridProducts.length > 0 && (
          <LpProductGridSection fields={pf} products={gridProducts} collectionHandle={collHandle} />
        )}
        {carousels.map((col) => (
          <LpProductCarousel
            key={col.handle}
            heading={col.title}
            collectionHandle={col.handle}
            products={col.products}
          />
        ))}
      </div>
    );
  }

  // ── sub_banner (full-width image at bottom) ───────────────────────────────────
  const subBannerUrl = f.find((x: any) => x.key === "sub_banner")?.reference?.image?.url;
  if (subBannerUrl) {
    sectionMap["sub_banner"] = (
      <section key={`${key}-subbanner`} className="w-full">
        <img src={subBannerUrl} alt="" className="w-full" loading="lazy" />
      </section>
    );
  }

  // Deduplicate: "slide" and "slider" are aliases for the same hero banner
  const seen = new Set<string>();
  return orderedKeys
    .filter((k) => {
      const norm = k === "slider" ? "slide" : k;
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    })
    .map((k) => sectionMap[k])
    .filter(Boolean) as React.ReactNode[];
}

// ── Page component ────────────────────────────────────────────────────────────

export default function Page() {
  const { isLandingPage, page, lpPageNodes, productsByCollection, reelItems } =
    useLoaderData<typeof loader>();

  // ── Landing page ──────────────────────────────────────────────────────────────
  if (isLandingPage) {
    const allSections: React.ReactNode[] = [];

    lpPageNodes.forEach((lpNode: any, pi: number) => {
      const f: any[] = lpNode.fields ?? [];
      // Unwrap lp_page → lp_types nesting when present
      const innerNodes: any[] = f.find((x: any) => x.key === "sections")?.references?.nodes ?? [];
      const targets = innerNodes.length > 0 ? innerNodes : [lpNode];
      targets.forEach((lpTypes: any, ti: number) => {
        renderLpTypes(lpTypes, `${pi}-${ti}`, productsByCollection, reelItems)
          .forEach((s) => allSections.push(s));
      });
    });

    return <div className="min-h-screen">{allSections}</div>;
  }

  // ── Regular Shopify page ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-6 py-12 md:px-8 md:py-16">
        <nav className="mb-6 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
          <span>/</span>
          <span className="text-foreground">{page.title}</span>
        </nav>
        <h1 className="font-display mb-10 text-3xl font-extrabold text-foreground md:text-4xl">
          {page.title}
        </h1>
        <div
          className="prose prose-sm md:prose-base max-w-none
            prose-headings:font-display prose-headings:font-bold prose-headings:text-foreground
            prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-xl
            prose-h3:mt-7 prose-h3:mb-2 prose-h3:text-lg
            prose-p:text-neutral-600 prose-p:leading-relaxed
            prose-strong:text-foreground prose-strong:font-semibold
            prose-a:text-crimson prose-a:no-underline hover:prose-a:underline
            prose-li:text-neutral-600 prose-li:leading-relaxed
            prose-ul:my-4 prose-ol:my-4
            prose-hr:border-border"
          dangerouslySetInnerHTML={{ __html: page.body }}
        />
      </div>
    </div>
  );
}

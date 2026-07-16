import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import {
  useAnalytics,
  sendShopifyAnalytics,
  AnalyticsEventName,
  AnalyticsPageType,
  getClientBrowserParameters,
} from "@shopify/hydrogen";

/**
 * Direct-send replacements for <Analytics.ProductView/CollectionView/SearchView>.
 *
 * Why not the built-in components? They publish into Hydrogen's event pipeline, whose sender starts
 * with `if (!payload.hasUserConsent) return` — a SILENT no-op. Hydrogen derives hasUserConsent from
 * customerPrivacy.analyticsProcessingAllowed(), which is false on mls.om because Oman requires no
 * consent banner, so consent is never explicitly granted. Result: the built-in components fire
 * nothing, with no error. (Same gate that killed product_added_to_cart — see CartAddDirectAnalytics
 * in root.tsx.)
 *
 * These call sendShopifyAnalytics ourselves with hasUserConsent: true (lawful — Oman has no
 * cookie-consent requirement), so the events actually reach Monorail. Every send is guarded: an
 * analytics failure must never break a page.
 *
 * NOTE: there is deliberately no cart_viewed here — Shopify has no such Monorail schema
 * (AnalyticsEventName has no CART_VIEW) and Hydrogen's subscriber never listens for it.
 */

type Shop = { shopId?: string } | null;

function useShop(): Shop {
  const { shop } = useAnalytics();
  return shop as Shop;
}

function send(eventName: string, shop: Shop, extra: Record<string, unknown>) {
  try {
    void sendShopifyAnalytics({
      eventName: eventName as never,
      payload: {
        ...(shop as object),
        shopifySalesChannel: "hydrogen",
        hasUserConsent: true,
        ...getClientBrowserParameters(),
        ...extra,
      } as never,
    });
  } catch {
    /* analytics must never break the page */
  }
}

export function ShopifyProductView({
  productGid,
  title,
  vendor,
  productType,
  price,
  variantGid,
  variantTitle,
}: {
  productGid: string;
  title: string;
  vendor?: string;
  productType?: string;
  price: string;
  variantGid: string;
  variantTitle?: string;
}) {
  const shop = useShop();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!shop?.shopId || !productGid || sent.current === productGid) return;
    sent.current = productGid;
    send(AnalyticsEventName.PRODUCT_VIEW, shop, {
      pageType: AnalyticsPageType.product,
      resourceId: productGid,
      totalValue: parseFloat(price || "0"),
      products: [
        {
          productGid,
          variantGid: variantGid || productGid,
          name: title ?? "",
          variantName: variantTitle ?? "",
          brand: vendor ?? "",
          price: price ?? "0",
          quantity: 1,
          category: productType ?? "",
        },
      ],
    });
  }, [shop?.shopId, productGid]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function ShopifyCollectionView({
  collectionGid,
  handle,
}: {
  collectionGid: string;
  handle: string;
}) {
  const shop = useShop();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!shop?.shopId || !collectionGid || sent.current === collectionGid) return;
    sent.current = collectionGid;
    send(AnalyticsEventName.COLLECTION_VIEW, shop, {
      pageType: AnalyticsPageType.collection,
      resourceId: collectionGid,
      collectionHandle: handle,
      collectionId: collectionGid,
    });
  }, [shop?.shopId, collectionGid]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Map a pathname to a Shopify AnalyticsPageType (best-effort; the URL in the browser
// parameters is what actually identifies the page — pageType is a secondary label).
function pageTypeFor(pathname: string): string {
  const p = (pathname.replace(/^\/ar(?=\/|$)/, "") || "/");
  if (p === "/") return AnalyticsPageType.home;
  if (p.startsWith("/products/")) return AnalyticsPageType.product;
  if (p === "/collections") return AnalyticsPageType.listCollections;
  if (p.startsWith("/collections/")) return AnalyticsPageType.collection;
  if (p.startsWith("/search")) return AnalyticsPageType.search;
  if (/^\/blogs\/[^/]+\/[^/]+/.test(p)) return AnalyticsPageType.article;
  if (p.startsWith("/blogs")) return AnalyticsPageType.blog;
  if (p === "/cart") return AnalyticsPageType.cart;
  if (p.startsWith("/policies/")) return AnalyticsPageType.policy;
  if (p.startsWith("/account")) return AnalyticsPageType.customersAccount;
  return AnalyticsPageType.page;
}

/**
 * Fires Shopify `page_viewed` on EVERY route — homepage included — and on SPA navigations,
 * with hasUserConsent:true so it is NOT dropped by the consent gate. This is the event Shopify
 * counts for Sessions / page views, and therefore for Conversion Rate (orders ÷ sessions).
 *
 * Hydrogen's built-in <Analytics.PageView> can't send here (same hasUserConsent gate documented
 * at the top of this file), which is why the homepage recorded no page view and sessions
 * under-counted. Product/collection/search pages already emit their own view events; this adds
 * the base page view everywhere (standard storefront behaviour — page_viewed fires on every page,
 * additionally to product_viewed etc.). Render once inside <Analytics.Provider>.
 */
export function ShopifyPageView() {
  const shop = useShop();
  const location = useLocation();
  const sent = useRef<string | null>(null);
  const key = location.pathname + location.search;
  useEffect(() => {
    if (!shop?.shopId || sent.current === key) return;
    sent.current = key;
    send(AnalyticsEventName.PAGE_VIEW, shop, {
      pageType: pageTypeFor(location.pathname),
    });
  }, [shop?.shopId, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function ShopifySearchView({ searchTerm }: { searchTerm: string }) {
  const shop = useShop();
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!shop?.shopId || !searchTerm || sent.current === searchTerm) return;
    sent.current = searchTerm;
    send(AnalyticsEventName.SEARCH_VIEW, shop, {
      pageType: AnalyticsPageType.search,
      searchString: searchTerm,
    });
  }, [shop?.shopId, searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

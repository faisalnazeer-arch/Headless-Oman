import { useEffect, useRef } from "react";
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

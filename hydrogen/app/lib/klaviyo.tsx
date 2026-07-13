import { useEffect, useRef } from "react";

/**
 * Klaviyo onsite tracking for the headless (Hydrogen) storefront.
 *
 * In a Liquid theme, Klaviyo's onsite snippet auto-tracks "Viewed Product" and
 * "Added to Cart". In a headless storefront it does NOT — only "Active on Site"
 * fires automatically from the onsite JS (SC5Mtp). Per Klaviyo Support these two
 * events must be pushed manually. We mirror the Shopify direct-send pattern:
 * fire-and-forget, wrapped so tracking can NEVER break the page or slow the cart.
 *
 * window.klaviyo is either the loaded object (has .push) or the pre-load array
 * stub set up in root.tsx — both expose .push(), so this works before/after load.
 */

type KlaviyoPush = (args: unknown[]) => void;
type KlaviyoWindow = Window & { klaviyo?: { push?: KlaviyoPush } };

function push(args: unknown[]): void {
  if (typeof window === "undefined") return;
  try {
    const kl = (window as KlaviyoWindow).klaviyo;
    if (kl && typeof kl.push === "function") kl.push(args);
  } catch {
    /* Klaviyo tracking must never affect the storefront */
  }
}

export function klaviyoTrack(event: string, properties: Record<string, unknown>): void {
  push(["track", event, properties]);
}

/** Powers Klaviyo's "Recently Viewed Items" feed block. */
export function klaviyoTrackViewedItem(item: Record<string, unknown>): void {
  push(["trackViewedItem", item]);
}

/**
 * Fires Klaviyo "Viewed Product" (+ trackViewedItem) once per product page.
 * Enables Browse Abandonment flows. Render on the product route.
 */
export function KlaviyoProductView(props: {
  productGid: string;
  title: string;
  vendor?: string;
  productType?: string;
  price?: string;
  imageUrl?: string;
}) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    const { productGid, title } = props;
    if (!productGid || sent.current === productGid) return;
    sent.current = productGid;

    const url = typeof window !== "undefined" ? window.location.href : "";
    const price = parseFloat(props.price ?? "0") || 0;
    const categories = props.productType ? [props.productType] : [];
    const imageUrl = props.imageUrl ?? "";
    const brand = props.vendor ?? "";

    klaviyoTrack("Viewed Product", {
      ProductName: title,
      ProductID: productGid,
      Categories: categories,
      ImageURL: imageUrl,
      URL: url,
      Brand: brand,
      Price: price,
    });
    klaviyoTrackViewedItem({
      Title: title,
      ItemId: productGid,
      Categories: categories,
      ImageUrl: imageUrl,
      Url: url,
      Metadata: { Brand: brand, Price: price },
    });
  }, [props.productGid]);

  return null;
}

/**
 * Fires Klaviyo "Added to Cart". Enables Added-to-Cart / cart-reminder flows.
 * Called from the cart observer using the same add-detection as Shopify analytics.
 */
export function klaviyoAddedToCart(input: {
  addedName: string;
  addedProductId: string;
  addedPrice: number;
  addedQuantity: number;
  addedImageUrl?: string;
  addedUrl?: string;
  addedBrand?: string;
  addedCategory?: string;
  cartTotal: number;
  itemNames: string[];
  checkoutUrl?: string;
}): void {
  klaviyoTrack("Added to Cart", {
    $value: input.cartTotal,
    AddedItemProductName: input.addedName,
    AddedItemProductID: input.addedProductId,
    AddedItemPrice: input.addedPrice,
    AddedItemQuantity: input.addedQuantity,
    AddedItemImageURL: input.addedImageUrl ?? "",
    AddedItemURL: input.addedUrl ?? "",
    AddedItemBrand: input.addedBrand ?? "",
    AddedItemCategories: input.addedCategory ? [input.addedCategory] : [],
    ItemNames: input.itemNames,
    CheckoutURL: input.checkoutUrl ?? "",
  });
}

// Tiny, bulletproof GTM dataLayer helper. Pushes GA4-style ecommerce events that GTM can
// forward to GA4 / Meta / TikTok / Ads tags. Fully guarded: never throws, no-ops on the
// server, and creates window.dataLayer if GTM hasn't yet — so it can't disturb the app.
export function pushDataLayer(event: string, data: Record<string, any> = {}) {
  try {
    if (typeof window === "undefined") return;
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    // GA4 best practice: clear the previous ecommerce object before pushing a new one.
    if (data && "ecommerce" in data) w.dataLayer.push({ ecommerce: null });
    w.dataLayer.push({ event, ...data });
  } catch {
    /* analytics must never break the storefront */
  }
  // Mirror the same events to the ad pixels (Meta / TikTok / Snapchat) loaded in root.tsx.
  firePixels(event, data);
}

// Forward GA4-style ecommerce events to the Meta, TikTok and Snapchat pixels. These are loaded
// directly in Hydrogen (root.tsx) because Shopify's Web Pixels (Customer Events) don't run on a
// headless storefront. Fully guarded — a missing pixel or bad payload never throws.
function firePixels(event: string, data: Record<string, any>) {
  try {
    if (typeof window === "undefined") return;
    const w = window as any;
    const fbq = w.fbq, ttq = w.ttq, snaptr = w.snaptr;
    if (!fbq && !ttq && !snaptr) return;

    const ec = (data && data.ecommerce) || {};
    const items: any[] = Array.isArray(ec.items) ? ec.items : [];
    const ids = items.map((i) => i.item_id).filter(Boolean);
    const value = typeof ec.value === "number" ? ec.value : 0;
    const currency = ec.currency || "OMR";
    const fbContents = items.map((i) => ({ id: i.item_id, quantity: i.quantity || 1 }));
    const ttContents = items.map((i) => ({ content_id: i.item_id, content_type: "product", content_name: i.item_name, quantity: i.quantity || 1, price: i.price || 0 }));

    switch (event) {
      case "page_view":
        if (fbq) fbq("track", "PageView");
        if (ttq && ttq.page) ttq.page();
        if (snaptr) snaptr("track", "PAGE_VIEW");
        break;
      case "view_item":
        if (fbq) fbq("track", "ViewContent", { content_ids: ids, content_type: "product", contents: fbContents, value, currency });
        if (ttq && ttq.track) ttq.track("ViewContent", { contents: ttContents, value, currency });
        if (snaptr) snaptr("track", "VIEW_CONTENT", { item_ids: ids, price: value, currency });
        break;
      case "add_to_cart":
        if (fbq) fbq("track", "AddToCart", { content_ids: ids, content_type: "product", contents: fbContents, value, currency });
        if (ttq && ttq.track) ttq.track("AddToCart", { contents: ttContents, value, currency });
        if (snaptr) snaptr("track", "ADD_CART", { item_ids: ids, price: value, currency });
        break;
      // NOTE: InitiateCheckout + Purchase are intentionally NOT fired here — they fire on the
      // Shopify-hosted checkout via Customer Events, so firing from Hydrogen would double-count.
    }
  } catch {
    /* analytics must never break the storefront */
  }
}

// Build a GA4 ecommerce "items" entry from a product-ish shape.
export function gaItem(opts: {
  id?: string | null;
  name?: string | null;
  price?: string | number | null;
  quantity?: number;
  variant?: string | null;
}) {
  const item: Record<string, any> = {
    item_id: opts.id ?? "",
    item_name: opts.name ?? "",
    price: opts.price != null ? parseFloat(String(opts.price)) || 0 : 0,
    quantity: opts.quantity ?? 1,
  };
  if (opts.variant && opts.variant !== "Default Title") item.item_variant = opts.variant;
  return item;
}

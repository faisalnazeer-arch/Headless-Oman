import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { toast } from "sonner";
import { pushDataLayer, gaItem } from "@/lib/dataLayer";
import {
  storefrontApiRequest,
  type MoneyV2,
  type ShopifyProduct,
} from "@/lib/shopify";

export interface CartItem {
  lineId: string | null;
  product: ShopifyProduct;
  variantId: string;
  variantTitle: string;
  price: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
  quantity: number;
  selectedOptions: Array<{ name: string; value: string }>;
  sellingPlanId?: string | null;
  sellingPlanName?: string | null;
  attributes?: Array<{ key: string; value: string }>;
  isPending?: boolean;
}

export interface DiscountCodeInfo {
  code: string;
  applicable: boolean;
}

export interface AutomaticDiscount {
  title: string;
  discountedAmount: MoneyV2;
}

export interface AppliedGiftCard {
  id: string;
  lastCharacters: string;
  amountUsed: MoneyV2;
  balance: MoneyV2;
}

interface CartStore {
  items: CartItem[];
  cartId: string | null;
  checkoutUrl: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  isApplyingCode: boolean;
  isOpen: boolean;
  removingLineIds: string[];
  discountCodes: DiscountCodeInfo[];
  automaticDiscounts: AutomaticDiscount[];
  giftCardCodes: string[];
  appliedGiftCards: AppliedGiftCard[];
  subtotalAmount: MoneyV2 | null;
  totalAmount: MoneyV2 | null;
  orderNote: string;
  addItemError: string | null;
  setOpen: (open: boolean) => void;
  addItem: (item: Omit<CartItem, "lineId" | "isPending">) => Promise<void>;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clearCart: () => void;
  syncCart: () => Promise<void>;
  getCheckoutUrl: () => string | null;
  applyDiscountCode: (code: string) => Promise<{ success: boolean; error?: string }>;
  removeDiscountCode: (code: string) => Promise<void>;
  applyGiftCard: (code: string) => Promise<{ success: boolean; error?: string }>;
  removeGiftCard: (id: string) => Promise<void>;
  updateOrderNote: (note: string) => Promise<void>;
}

const COST_FIELDS = `cost { subtotalAmount { amount currencyCode } totalAmount { amount currencyCode } }`;
const DISCOUNT_ALLOC_FRAGMENT = `{
  __typename
  discountedAmount { amount currencyCode }
  ... on CartAutomaticDiscountAllocation { title }
  ... on CartCustomDiscountAllocation { title }
}`;
// Minimal lines — only needed to resolve the new lineId after create/add
const MINIMAL_LINES_FIELDS = `lines(first: 100) {
  edges { node { id merchandise { ... on ProductVariant { id } } } }
}`;

const CART_QUERY = `query cart($id: ID!) {
  cart(id: $id) {
    id
    note
    discountCodes { code applicable }
    discountAllocations ${DISCOUNT_ALLOC_FRAGMENT}
    lines(first: 100) {
      edges {
        node {
          discountAllocations ${DISCOUNT_ALLOC_FRAGMENT}
        }
      }
    }
    appliedGiftCards {
      id
      lastCharacters
      amountUsed { amount currencyCode }
      balance { amount currencyCode }
    }
    ${COST_FIELDS}
  }
}`;

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        ${COST_FIELDS}
        ${MINIMAL_LINES_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD_MUTATION = `
  mutation cartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { id ${COST_FIELDS} ${MINIMAL_LINES_FIELDS} }
      userErrors { field message }
    }
  }
`;

const CART_LINES_UPDATE_MUTATION = `
  mutation cartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { id ${COST_FIELDS} } userErrors { field message } }
  }
`;

const CART_LINES_REMOVE_MUTATION = `
  mutation cartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { id ${COST_FIELDS} } userErrors { field message } }
  }
`;

const CART_DISCOUNT_CODES_UPDATE = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        id
        discountCodes { code applicable }
        ${COST_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

const CART_NOTE_UPDATE = `
  mutation cartNoteUpdate($cartId: ID!, $note: String!) {
    cartNoteUpdate(cartId: $cartId, note: $note) {
      cart { id note }
      userErrors { field message }
    }
  }
`;

const VARIANT_LOOKUP = `
  query variantLookup($id: ID!) {
    node(id: $id) {
      ... on ProductVariant {
        title
        image { url altText }
        product {
          id title handle
          images(first: 1) { edges { node { url altText } } }
        }
      }
    }
  }
`;

const CART_GIFT_CARD_CODES_UPDATE = `
  mutation cartGiftCardCodesUpdate($cartId: ID!, $giftCardCodes: [String!]!) {
    cartGiftCardCodesUpdate(cartId: $cartId, giftCardCodes: $giftCardCodes) {
      cart {
        id
        appliedGiftCards {
          id
          lastCharacters
          amountUsed { amount currencyCode }
          balance { amount currencyCode }
        }
        ${COST_FIELDS}
      }
      userErrors { field message }
    }
  }
`;

function formatCheckoutUrl(checkoutUrl: string): string {
  try {
    const url = new URL(checkoutUrl);
    url.searchParams.set("channel", "online_store");
    return url.toString();
  } catch {
    return checkoutUrl;
  }
}

// Extracts named automatic/custom discounts from the cart-level discountAllocations array.
// This uses the cart-level field (Storefront API 2024-10+) which returns one entry per
// discount with the actual title — unlike line-level allocations which split the amount
// per line and may omit titles for order-level discounts.
function extractAutomaticDiscounts(cartDiscountAllocations: any[]): AutomaticDiscount[] {
  const map = new Map<string, { amount: number; currencyCode: string }>();
  for (const alloc of cartDiscountAllocations) {
    const isNamed =
      alloc.__typename === "CartAutomaticDiscountAllocation" ||
      alloc.__typename === "CartCustomDiscountAllocation" ||
      (alloc.title && !alloc.code);
    if (!isNamed || !alloc.title) continue;
    const prev = map.get(alloc.title) ?? { amount: 0, currencyCode: alloc.discountedAmount?.currencyCode ?? "OMR" };
    map.set(alloc.title, {
      amount: prev.amount + parseFloat(alloc.discountedAmount?.amount ?? "0"),
      currencyCode: prev.currencyCode,
    });
  }
  return Array.from(map.entries()).map(([title, { amount, currencyCode }]) => ({
    title,
    discountedAmount: { amount: amount.toFixed(2), currencyCode },
  }));
}

function isCartNotFoundError(
  userErrors: Array<{ field: string[] | null; message: string }>
): boolean {
  return userErrors.some(
    (e) =>
      e.message.toLowerCase().includes("cart not found") ||
      e.message.toLowerCase().includes("does not exist")
  );
}

// Tracks the last error from createShopifyCart so addItem can surface it
let _lastAddError: string | null = null;
// Cooldown so syncCart doesn't fire on every cart open within the same session
let _lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 120_000;
// Gift variant image/title never changes — cache after first fetch
const _giftVariantCache = new Map<string, Partial<CartItem>>();

// ── Mutation queue ─────────────────────────────────────────────────────────
// Shopify's Storefront API rejects concurrent mutations on the same cart.
// All remove/update API calls run through this queue so they are serialized.
// Optimistic UI updates still happen immediately (before enqueue).
let _cartMutationQueue: Promise<void> = Promise.resolve();
function enqueueCartMutation(fn: () => Promise<void>): void {
  _cartMutationQueue = _cartMutationQueue
    .then(fn)
    .catch(() => {}); // swallow so the queue never gets permanently blocked
}

async function createShopifyCart(item: CartItem) {
  _lastAddError = null;
  const line: Record<string, any> = { quantity: item.quantity, merchandiseId: item.variantId };
  if (item.sellingPlanId) line.sellingPlanId = item.sellingPlanId;
  if (item.attributes?.length) line.attributes = item.attributes;

  let data: any;
  try {
    data = await storefrontApiRequest<any>(CART_CREATE_MUTATION, { input: { lines: [line] } });
  } catch (err: any) {
    _lastAddError = err?.message ?? "Network error — could not reach Shopify";
    console.warn("[cart] cartCreate request failed:", err);
    return null;
  }
  if (!data) {
    _lastAddError = "Shopify returned no response (possibly payment issue)";
    console.warn("[cart] cartCreate: no data returned");
    return null;
  }
  const createErrors: Array<{ message: string }> = data?.data?.cartCreate?.userErrors ?? [];
  if (createErrors.length > 0) {
    _lastAddError = createErrors[0]?.message ?? "Could not create cart";
    console.warn("[cart] cartCreate userErrors:", JSON.stringify(createErrors));
    return null;
  }
  const cart = data?.data?.cartCreate?.cart;
  if (!cart?.id) {
    _lastAddError = "Shopify did not return a cart — please try again";
    console.warn("[cart] cartCreate: no cart in response");
    return null;
  }
  const lines: any[] = cart?.lines?.edges ?? [];
  const newLine = lines.find((l: any) => l.node.merchandise.id === item.variantId);
  const lineId = newLine?.node?.id as string | undefined;
  if (!lineId) {
    _lastAddError = "Item added but line ID not returned — please refresh";
    console.warn("[cart] cartCreate: no lineId in response lines");
    return null;
  }
  return {
    cartId: cart.id as string,
    checkoutUrl: cart.checkoutUrl ? formatCheckoutUrl(cart.checkoutUrl) : null,
    lineId,
    subtotalAmount: cart.cost?.subtotalAmount ?? null,
    totalAmount: cart.cost?.totalAmount ?? null,
  };
}

async function addLineToShopifyCart(cartId: string, item: CartItem) {
  const line: Record<string, any> = { quantity: item.quantity, merchandiseId: item.variantId };
  if (item.sellingPlanId) line.sellingPlanId = item.sellingPlanId;
  if (item.attributes?.length) line.attributes = item.attributes;
  const data = await storefrontApiRequest<any>(CART_LINES_ADD_MUTATION, {
    cartId,
    lines: [line],
  });
  const userErrors: Array<{ field: string[] | null; message: string }> = data?.data?.cartLinesAdd?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true as const };
  if (userErrors.length > 0) {
    console.warn("[cart] cartLinesAdd userErrors:", JSON.stringify(userErrors));
    return { success: false as const, message: userErrors[0]?.message ?? "Could not add to cart" };
  }
  const cartData = data?.data?.cartLinesAdd?.cart;
  const lines: any[] = cartData?.lines?.edges || [];
  const newLine = lines.find((l: any) => l.node.merchandise.id === item.variantId);
  return {
    success: true as const,
    lineId: newLine?.node?.id as string | undefined,
    subtotalAmount: cartData?.cost?.subtotalAmount ?? null,
    totalAmount: cartData?.cost?.totalAmount ?? null,
  };
}

async function updateShopifyCartLine(cartId: string, lineId: string, quantity: number) {
  const data = await storefrontApiRequest<any>(CART_LINES_UPDATE_MUTATION, {
    cartId,
    lines: [{ id: lineId, quantity }],
  });
  const userErrors = data?.data?.cartLinesUpdate?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true as const };
  if (userErrors.length > 0) return { success: false as const };
  const cartData = data?.data?.cartLinesUpdate?.cart;
  return {
    success: true as const,
    subtotalAmount: cartData?.cost?.subtotalAmount ?? null,
    totalAmount: cartData?.cost?.totalAmount ?? null,
  };
}

async function removeLineFromShopifyCart(cartId: string, lineId: string) {
  const data = await storefrontApiRequest<any>(CART_LINES_REMOVE_MUTATION, {
    cartId,
    lineIds: [lineId],
  });
  const userErrors = data?.data?.cartLinesRemove?.userErrors || [];
  if (isCartNotFoundError(userErrors)) return { success: false, cartNotFound: true as const };
  if (userErrors.length > 0) return { success: false as const };
  const cartData = data?.data?.cartLinesRemove?.cart;
  return {
    success: true as const,
    subtotalAmount: cartData?.cost?.subtotalAmount ?? null,
    totalAmount: cartData?.cost?.totalAmount ?? null,
  };
}

async function fetchGiftVariantData(variantId: string): Promise<Partial<CartItem>> {
  if (_giftVariantCache.has(variantId)) return _giftVariantCache.get(variantId)!;
  try {
    const data = await storefrontApiRequest<any>(VARIANT_LOOKUP, { id: variantId });
    const v = data?.data?.node;
    if (!v) return {};
    const imgUrl = v.image?.url ?? v.product?.images?.edges?.[0]?.node?.url ?? null;
    const imgAlt = v.image?.altText ?? null;
    const result: Partial<CartItem> = {
      variantTitle: v.title ?? "Free Gift",
      product: {
        node: {
          id: v.product?.id ?? "",
          title: v.product?.title ?? "Free Gift",
          handle: v.product?.handle ?? "",
          description: "",
          descriptionHtml: "",
          tags: [],
          vendor: "",
          productType: "",
          availableForSale: true,
          priceRange: {
            minVariantPrice: { amount: "0", currencyCode: "OMR" },
            maxVariantPrice: { amount: "0", currencyCode: "OMR" },
          },
          images: imgUrl
            ? { edges: [{ node: { url: imgUrl, altText: imgAlt } }] }
            : { edges: [] },
          variants: { edges: [] },
          options: [],
        },
      } as ShopifyProduct,
    };
    _giftVariantCache.set(variantId, result);
    return result;
  } catch {
    return {};
  }
}

const EMPTY: Pick<CartStore,
  "discountCodes" | "automaticDiscounts" | "giftCardCodes" | "appliedGiftCards" | "subtotalAmount" | "totalAmount" | "orderNote"
> = {
  discountCodes: [],
  automaticDiscounts: [],
  giftCardCodes: [],
  appliedGiftCards: [],
  subtotalAmount: null,
  totalAmount: null,
  orderNote: "",
};

// ── Free gift helpers ──────────────────────────────────────────────────────

// One rule per free gift, driven by the mls_free_gift_rule metaobjects.
export interface FreeGiftRule {
  variantId: string;       // free product variant to add
  matchTitles: string[];   // lowercase substrings; a line-item title must CONTAIN one (OR). Empty = any item
  minSubtotal: number;     // 0 = no minimum
  subtotalScope: "cart_total" | "matched_items" | "subscription_items";
  requireSubscription: boolean;
}

// Set by CartDrawer on mount from the mls_free_gift_rule metaobjects.
let _giftRules: FreeGiftRule[] = [];
export function initGiftRules(rules: FreeGiftRule[]) {
  _giftRules = rules.filter((r) => r.variantId);
}

// Pre-fetch gift variant images so they're cached before the first add.
export function warmGiftRuleCache(rules: FreeGiftRule[]) {
  for (const r of rules) if (r.variantId) void fetchGiftVariantData(r.variantId);
}

function makeGiftItem(variantId: string): CartItem {
  return {
    lineId: null,
    product: {
      node: {
        id: "", title: "Free Gift", handle: "", description: "",
        descriptionHtml: "", tags: [], vendor: "", productType: "",
        availableForSale: true,
        priceRange: {
          minVariantPrice: { amount: "0", currencyCode: "OMR" },
          maxVariantPrice: { amount: "0", currencyCode: "OMR" },
        },
        images: { edges: [] },
        variants: { edges: [] },
        options: [],
      },
    } as ShopifyProduct,
    variantId,
    variantTitle: "Free Gift",
    price: { amount: "0.00", currencyCode: "OMR" },
    quantity: 1,
    selectedOptions: [],
    isPending: false,
  };
}

let _giftSyncing = false;
let _isCreatingCart = false;
// Debounce handle so rapid actions only trigger one gift sync pass
let _giftSyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncFreeGifts(
  get: () => CartStore,
  set: (p: Partial<CartStore> | ((s: CartStore) => Partial<CartStore>)) => void,
) {
  if (_giftSyncTimer) clearTimeout(_giftSyncTimer);
  _giftSyncTimer = setTimeout(() => {
    _giftSyncTimer = null;
    enqueueCartMutation(() => syncFreeGifts(get, set));
  }, 150);
}

async function syncFreeGifts(
  get: () => CartStore,
  set: (p: Partial<CartStore> | ((s: CartStore) => Partial<CartStore>)) => void,
) {
  if (_giftSyncing) return;
  _giftSyncing = true;
  try {
    const rules = _giftRules;
    if (rules.length === 0) return;

    const { items, cartId } = get();
    if (!cartId) return;

    const giftVariantIds = new Set(rules.map((r) => r.variantId));
    // Only user items (exclude the gifts themselves) drive the logic.
    const userItems = items.filter((i) => !giftVariantIds.has(i.variantId));
    const subtotalOf = (list: CartItem[]) =>
      list.reduce((sum, i) => sum + parseFloat(i.price.amount) * i.quantity, 0);
    const subscriptionItems = userItems.filter((i) => !!i.sellingPlanId);
    const subscriptionSubtotal = subtotalOf(subscriptionItems);
    const cartSubtotal = subtotalOf(userItems);

    // Evaluate each rule independently. (Snapshots taken before the loop, mirroring
    // the previous two-gift logic — every rule targets a distinct gift variant.)
    for (const rule of rules) {
      const matched = userItems.filter((i) => {
        if (rule.requireSubscription && !i.sellingPlanId) return false;
        if (rule.matchTitles.length === 0) return true;
        const title = (i.product.node.title ?? "").toLowerCase();
        return rule.matchTitles.some((t) => title.includes(t));
      });
      const subtotal =
        rule.subtotalScope === "subscription_items" ? subscriptionSubtotal
        : rule.subtotalScope === "matched_items" ? subtotalOf(matched)
        : cartSubtotal;
      const want = matched.length > 0 && subtotal >= rule.minSubtotal;
      const has = items.find((i) => i.variantId === rule.variantId);

      if (want && !has) {
        const gift = makeGiftItem(rule.variantId);
        // Apply cached image/title immediately if available — no waiting
        const cached = _giftVariantCache.get(rule.variantId) ?? {};
        set((s) => ({ items: [...s.items, { ...gift, ...cached, isPending: true }] }));
        const [res, variantData] = await Promise.all([
          addLineToShopifyCart(cartId, gift),
          fetchGiftVariantData(rule.variantId),
        ]);
        set((s) => ({
          items: res.success
            ? s.items.map((i) => i.variantId === rule.variantId && i.isPending
                ? { ...i, ...variantData, lineId: res.lineId ?? null, isPending: false } : i)
            : s.items.filter((i) => !(i.variantId === rule.variantId && i.isPending)),
        }));
      } else if (!want && has?.lineId) {
        set((s) => ({ items: s.items.filter((i) => i.variantId !== rule.variantId) }));
        await removeLineFromShopifyCart(cartId, has.lineId);
      }
    }

    // After all gift operations: if every item is gone reset the cartId so
    // the next addItem creates a fresh cart instead of reusing a stale one.
    // This is intentionally inside the try (not finally) so early-returns
    // (no rules, no cartId) never incorrectly clear a valid cart.
    if (get().items.length === 0) {
      set({ cartId: null, checkoutUrl: null });
    }
  } finally {
    _giftSyncing = false;
  }
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      cartId: null,
      checkoutUrl: null,
      isLoading: false,
      isSyncing: false,
      isApplyingCode: false,
      isOpen: false,
      removingLineIds: [],
      addItemError: null,
      ...EMPTY,

      setOpen: (open) => set({ isOpen: open }),

      addItem: async (item) => {
        // Silently block manual addition of zero-price (free-gift) products
        if (parseFloat(item.price.amount) === 0) return;
        // GTM dataLayer — add_to_cart (covers PDP, quick-buy, every add source)
        pushDataLayer("add_to_cart", {
          ecommerce: {
            currency: item.price.currencyCode,
            value: (parseFloat(item.price.amount) || 0) * item.quantity,
            items: [gaItem({
              id: (item.product as any)?.handle ?? item.variantId,
              name: (item.product as any)?.title,
              price: item.price.amount,
              quantity: item.quantity,
              variant: item.variantTitle,
            })],
          },
        });
        const { items, cartId, clearCart } = get();
        const existing = items.find(
          (i) => i.variantId === item.variantId && (i.sellingPlanId ?? null) === (item.sellingPlanId ?? null)
        );

        try {
          if (!cartId) {
            // Guard: prevent two simultaneous createShopifyCart calls (rapid double-tap)
            if (_isCreatingCart) return;
            _isCreatingCart = true;
            try {
              // Open drawer immediately — don't make the user wait for cart creation
              set({
                items: [{ ...item, lineId: null, isPending: true }, ...get().items],
                isOpen: true,
              });
              const result = await createShopifyCart({ ...item, lineId: null });
              if (result) {
                set({
                  cartId: result.cartId,
                  checkoutUrl: result.checkoutUrl,
                  subtotalAmount: result.subtotalAmount,
                  totalAmount: result.totalAmount,
                  addItemError: null,
                  items: get().items.map((i) =>
                    i.variantId === item.variantId && i.isPending
                      ? { ...i, lineId: result.lineId, isPending: false }
                      : i
                  ),
                });
                toast.success("Added to cart", { description: item.product.node.title });
              } else {
                const remaining = get().items.filter((i) => !(i.variantId === item.variantId && i.isPending));
                const errorMsg = _lastAddError ?? "Could not add to cart. Please try again.";
                console.warn("[cart] Cart creation failed for variant", item.variantId, "—", errorMsg);
                set({ items: remaining, isOpen: false, addItemError: errorMsg });
              }
            } finally {
              _isCreatingCart = false;
            }
          } else if (existing) {
            const newQty = existing.quantity + item.quantity;
            if (!existing.lineId) return;
            // Optimistic qty update + open drawer immediately
            set({
              items: get().items.map((i) =>
                i.variantId === item.variantId && i.sellingPlanId === item.sellingPlanId
                  ? { ...i, quantity: newQty, isPending: true }
                  : i
              ),
              isOpen: true,
            });
            const result = await updateShopifyCartLine(cartId, existing.lineId, newQty);
            if (result.success) {
              set({
                subtotalAmount: result.subtotalAmount ?? get().subtotalAmount,
                totalAmount: result.totalAmount ?? get().totalAmount,
                items: get().items.map((i) =>
                  i.variantId === item.variantId && i.sellingPlanId === item.sellingPlanId
                    ? { ...i, isPending: false }
                    : i
                ),
              });
            } else if (result.cartNotFound) {
              clearCart();
            } else {
              set({
                items: get().items.map((i) =>
                  i.variantId === item.variantId && i.sellingPlanId === item.sellingPlanId
                    ? { ...i, quantity: existing.quantity, isPending: false }
                    : i
                ),
              });
            }
          } else {
            set({
              items: [{ ...item, lineId: null, isPending: true }, ...get().items],
              isOpen: true,
            });
            const result = await addLineToShopifyCart(cartId, { ...item, lineId: null });
            if (result.success) {
              set({
                subtotalAmount: result.subtotalAmount ?? get().subtotalAmount,
                totalAmount: result.totalAmount ?? get().totalAmount,
                addItemError: null,
                items: get().items.map((i) =>
                  i.variantId === item.variantId && i.isPending
                    ? { ...i, lineId: result.lineId ?? null, isPending: false }
                    : i
                ),
              });
              toast.success("Added to cart", { description: item.product.node.title });
            } else if (result.cartNotFound) {
              // Cart expired — reset silently; don't show empty open drawer
              clearCart();
              set({ isOpen: false });
            } else {
              const msg = (result as any).message ?? "Could not add to cart";
              const remaining = get().items.filter((i) => !(i.variantId === item.variantId && i.isPending));
              set({
                items: remaining,
                isOpen: remaining.length > 0,
                addItemError: msg,
              });
            }
          }
        } catch (err) {
          console.warn("[cart] addItem threw:", err);
          const remaining = get().items.filter((i) => !i.isPending);
          set({ items: remaining, isOpen: remaining.length > 0, addItemError: "Could not add to cart. Please try again." });
          toast.error("Could not add to cart", { description: "Please check your connection and try again." });
        } finally {
          scheduleSyncFreeGifts(get, set);
        }
      },

      updateQuantity: (lineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(lineId);
          return;
        }
        const { items, clearCart } = get();
        const item = items.find((i) => i.lineId === lineId);
        if (!item || !lineId) return;
        const prevQty = item.quantity;

        // Optimistic: update quantity immediately
        set({ items: get().items.map((i) => i.lineId === lineId ? { ...i, quantity } : i) });

        // Serialize through queue — prevents conflicts with concurrent removes
        enqueueCartMutation(async () => {
          const cartId = get().cartId;
          if (!cartId) return;
          try {
            const result = await updateShopifyCartLine(cartId, lineId, quantity);
            if (result.success) {
              const newSub = parseFloat(result.subtotalAmount?.amount ?? "0");
              const newTot = parseFloat(result.totalAmount?.amount ?? newSub.toString());
              set({
                subtotalAmount: result.subtotalAmount ?? get().subtotalAmount,
                totalAmount: result.totalAmount ?? get().totalAmount,
                // Shopify confirmed no discount gap — clear stale automaticDiscounts immediately
                // instead of waiting for the 2-minute syncCart cooldown
                ...(newSub > 0 && newSub - newTot < 0.01 ? { automaticDiscounts: [] } : {}),
              });
              scheduleSyncFreeGifts(get, set);
            } else if (result.cartNotFound) {
              clearCart();
            } else {
              // Revert on failure
              set({ items: get().items.map((i) => i.lineId === lineId ? { ...i, quantity: prevQty } : i) });
            }
          } catch {
            set({ items: get().items.map((i) => i.lineId === lineId ? { ...i, quantity: prevQty } : i) });
          }
        });
      },

      removeItem: (lineId) => {
        const { cartId, clearCart, removingLineIds } = get();
        if (!lineId || !cartId) return;
        // Guard: prevent duplicate queued call for the same line
        if (removingLineIds.includes(lineId)) return;

        // Find the item now — needed for targeted revert if the API fails
        const removedItem = get().items.find((i) => i.lineId === lineId);
        if (!removedItem) return;

        const prevSubtotal = get().subtotalAmount;
        const prevTotal = get().totalAmount;
        const nextItems = get().items.filter((i) => i.lineId !== lineId);

        // Optimistic: remove from UI immediately — no waiting for API
        set({
          items: nextItems,
          removingLineIds: [...get().removingLineIds, lineId],
          ...(nextItems.length === 0 ? { subtotalAmount: null, totalAmount: null } : {}),
        });

        // Serialize the Shopify API call — queued after any in-flight mutation completes.
        // This prevents concurrent cartLinesRemove calls that Shopify rejects.
        enqueueCartMutation(async () => {
          try {
            // Re-read cartId: a previous queued step may have called clearCart()
            const currentCartId = get().cartId;
            if (!currentCartId) {
              // Cart was already cleared — nothing to do, item is already gone from UI
              return;
            }

            const result = await removeLineFromShopifyCart(currentCartId, lineId);

            if (result.success) {
              if (get().items.length === 0) {
                clearCart();
              } else {
                const newSub = parseFloat(result.subtotalAmount?.amount ?? "0");
                const newTot = parseFloat(result.totalAmount?.amount ?? newSub.toString());
                set({
                  subtotalAmount: result.subtotalAmount ?? get().subtotalAmount,
                  totalAmount: result.totalAmount ?? get().totalAmount,
                  ...(newSub > 0 && newSub - newTot < 0.01 ? { automaticDiscounts: [] } : {}),
                });
              }
              // Gift sync only on confirmed success — never on optimistic state
              scheduleSyncFreeGifts(get, set);

            } else if (result.cartNotFound) {
              clearCart();

            } else {
              // API rejected — restore only this specific item (not the whole old snapshot)
              // so other successfully-deleted items stay gone
              set((s) => ({
                items: s.items.some((i) => i.lineId === lineId)
                  ? s.items
                  : [...s.items, removedItem],
                subtotalAmount: prevSubtotal,
                totalAmount: prevTotal,
              }));
            }
          } catch {
            // Network / unexpected error — restore just this item
            set((s) => ({
              items: s.items.some((i) => i.lineId === lineId)
                ? s.items
                : [...s.items, removedItem],
              subtotalAmount: prevSubtotal,
              totalAmount: prevTotal,
            }));
          } finally {
            set((s) => ({ removingLineIds: s.removingLineIds.filter((id) => id !== lineId) }));
          }
        });
      },

      clearCart: () => set({ items: [], cartId: null, checkoutUrl: null, ...EMPTY }),

      getCheckoutUrl: () => get().checkoutUrl,

      syncCart: async () => {
        const { cartId, isSyncing, clearCart } = get();
        if (!cartId || isSyncing) return;
        if (Date.now() - _lastSyncTime < SYNC_COOLDOWN_MS) return;
        _lastSyncTime = Date.now();
        set({ isSyncing: true });
        try {
          const data = await storefrontApiRequest<any>(CART_QUERY, { id: cartId });
          if (!data) return;
          const cart = data?.data?.cart;
          if (!cart) {
            // Cart no longer exists on Shopify (expired / deleted) — safe to clear.
            // NOTE: do NOT clear on totalQuantity === 0 — Shopify may report 0 due
            // to eventual-consistency lag immediately after an add mutation, which
            // would silently wipe the customer's cart on the next tab-focus sync.
            clearCart();
          } else {
            // Try cart-level allocations first (one entry per discount, full amount).
            // If those return no titles (can happen with product-scoped discounts or
            // channel permission limits), aggregate from line-level allocations instead.
            const cartLevelAllocs: any[] = cart.discountAllocations ?? [];
            const cartLevelDiscounts = extractAutomaticDiscounts(cartLevelAllocs);
            const automaticDiscounts = cartLevelDiscounts.length > 0
              ? cartLevelDiscounts
              : extractAutomaticDiscounts(
                  (cart.lines?.edges ?? []).flatMap((e: any) => e.node?.discountAllocations ?? [])
                );
            set({
              discountCodes: cart.discountCodes ?? [],
              appliedGiftCards: cart.appliedGiftCards ?? [],
              subtotalAmount: cart.cost?.subtotalAmount ?? null,
              totalAmount: cart.cost?.totalAmount ?? null,
              automaticDiscounts,
              orderNote: cart.note ?? "",
            });
          }
        } catch (err) {
          console.warn("[cart] syncCart failed:", err);
        } finally {
          set({ isSyncing: false });
        }
      },

      applyDiscountCode: async (code) => {
        const { cartId, discountCodes } = get();
        if (!cartId) return { success: false, error: "Add an item to your cart first" };
        const trimmed = code.trim().toUpperCase();
        if (!trimmed) return { success: false, error: "Enter a discount code" };
        if (discountCodes.some((d) => d.code.toUpperCase() === trimmed)) {
          return { success: false, error: "Code already applied" };
        }
        set({ isApplyingCode: true });
        try {
          const currentCodes = discountCodes.map((d) => d.code);
          const data = await storefrontApiRequest<any>(CART_DISCOUNT_CODES_UPDATE, {
            cartId,
            discountCodes: [...currentCodes, trimmed],
          });
          const userErrors = data?.data?.cartDiscountCodesUpdate?.userErrors ?? [];
          if (userErrors.length > 0) return { success: false, error: userErrors[0].message };
          const cart = data?.data?.cartDiscountCodesUpdate?.cart;
          if (!cart) return { success: false, error: "Could not verify discount code. Please try again." };
          const newCodes: DiscountCodeInfo[] = cart.discountCodes ?? [];
          const applied = newCodes.find((c) => c.code.toUpperCase() === trimmed);
          if (!applied?.applicable) {
            // Revert Shopify cart back to previous codes so invalid code doesn't linger
            void storefrontApiRequest<any>(CART_DISCOUNT_CODES_UPDATE, {
              cartId,
              discountCodes: currentCodes,
            });
            // Ask the server for the real reason (Admin API)
            let reason = "This discount code cannot be applied to your cart.";
            try {
              const items = get().items;
              const cartTotal = items.reduce((n, i) => n + parseFloat(i.price.amount) * i.quantity, 0);
              const currency = items[0]?.price.currencyCode ?? "OMR";
              const res = await fetch(
                `/api/discount-check?code=${encodeURIComponent(trimmed)}&cartTotal=${cartTotal}&currency=${currency}`
              );
              if (res.ok) {
                const json = await res.json() as { reason: string | null };
                if (json.reason) reason = json.reason;
              }
            } catch { /* fallback to generic message */ }
            return { success: false, error: reason };
          }
          set({
            discountCodes: newCodes,
            subtotalAmount: cart.cost?.subtotalAmount ?? get().subtotalAmount,
            totalAmount: cart.cost?.totalAmount ?? get().totalAmount,
          });
          return { success: true };
        } finally {
          set({ isApplyingCode: false });
        }
      },

      removeDiscountCode: async (code) => {
        const { cartId, discountCodes } = get();
        if (!cartId) return;
        set({ isApplyingCode: true });
        try {
          const remaining = discountCodes.filter((d) => d.code !== code).map((d) => d.code);
          const data = await storefrontApiRequest<any>(CART_DISCOUNT_CODES_UPDATE, {
            cartId,
            discountCodes: remaining,
          });
          const cart = data?.data?.cartDiscountCodesUpdate?.cart;
          set({
            discountCodes: cart?.discountCodes ?? discountCodes,
            subtotalAmount: cart?.cost?.subtotalAmount ?? get().subtotalAmount,
            totalAmount: cart?.cost?.totalAmount ?? get().totalAmount,
          });
        } catch {
          toast.error("Could not remove discount code", { description: "Please try again." });
        } finally {
          set({ isApplyingCode: false });
        }
      },

      applyGiftCard: async (code) => {
        const { cartId, giftCardCodes } = get();
        if (!cartId) return { success: false, error: "Add an item to your cart first" };
        const trimmed = code.trim();
        if (!trimmed) return { success: false, error: "Enter a gift card code" };
        if (giftCardCodes.includes(trimmed)) return { success: false, error: "Gift card already applied" };
        set({ isApplyingCode: true });
        try {
          const newCodes = [...giftCardCodes, trimmed];
          const data = await storefrontApiRequest<any>(CART_GIFT_CARD_CODES_UPDATE, {
            cartId,
            giftCardCodes: newCodes,
          });
          const userErrors = data?.data?.cartGiftCardCodesUpdate?.userErrors ?? [];
          if (userErrors.length > 0) return { success: false, error: userErrors[0].message };
          const cart = data?.data?.cartGiftCardCodesUpdate?.cart;
          const appliedCards: AppliedGiftCard[] = cart?.appliedGiftCards ?? [];
          if (appliedCards.length <= giftCardCodes.length) {
            return { success: false, error: "This gift card is invalid or has no remaining balance" };
          }
          set({
            giftCardCodes: newCodes,
            appliedGiftCards: appliedCards,
            subtotalAmount: cart?.cost?.subtotalAmount ?? get().subtotalAmount,
            totalAmount: cart?.cost?.totalAmount ?? get().totalAmount,
          });
          return { success: true };
        } catch (e) {
          console.error("[cart] applyGiftCard error:", e);
          return { success: false, error: "Could not apply gift card. Please try again." };
        } finally {
          set({ isApplyingCode: false });
        }
      },

      removeGiftCard: async (id) => {
        const { cartId, giftCardCodes, appliedGiftCards } = get();
        if (!cartId) return;
        const idx = appliedGiftCards.findIndex((c) => c.id === id);
        const remaining = idx === -1 ? giftCardCodes : giftCardCodes.filter((_, i) => i !== idx);
        set({ isApplyingCode: true });
        try {
          const data = await storefrontApiRequest<any>(CART_GIFT_CARD_CODES_UPDATE, {
            cartId,
            giftCardCodes: remaining,
          });
          const cart = data?.data?.cartGiftCardCodesUpdate?.cart;
          set({
            giftCardCodes: remaining,
            appliedGiftCards: cart?.appliedGiftCards ?? [],
            subtotalAmount: cart?.cost?.subtotalAmount ?? get().subtotalAmount,
            totalAmount: cart?.cost?.totalAmount ?? get().totalAmount,
          });
        } catch (e) {
          console.error("[cart] removeGiftCard error:", e);
        } finally {
          set({ isApplyingCode: false });
        }
      },

      updateOrderNote: async (note) => {
        const { cartId } = get();
        set({ orderNote: note });
        if (!cartId) return;
        try {
          await storefrontApiRequest<any>(CART_NOTE_UPDATE, { cartId, note });
        } catch (err) {
          console.warn("[cart] updateOrderNote failed:", err);
        }
      },
    }),
    {
      name: "mls-shopify-cart",
      version: 7,
      storage: createJSONStorage(() => localStorage),
      skipHydration: true, // Prevent auto-rehydrate during SSR — we call rehydrate() eagerly on the client below
      partialize: (s) => ({
        items: s.items.filter((i) => !i.isPending),
        cartId: s.cartId,
        checkoutUrl: s.checkoutUrl,
        giftCardCodes: s.giftCardCodes,
        discountCodes: s.discountCodes,
        appliedGiftCards: s.appliedGiftCards,
        orderNote: s.orderNote,
        subtotalAmount: s.subtotalAmount,
        totalAmount: s.totalAmount,
        automaticDiscounts: s.automaticDiscounts,
      }),
      migrate: (persisted: any, fromVersion: number) => {
        if (fromVersion < 2) {
          const items = (persisted.items ?? []).map((item: any) =>
            item.sellingPlanId ? { ...item, sellingPlanName: item.sellingPlanName ?? null } : item
          );
          return { ...persisted, items, giftCardCodes: [], discountCodes: [], appliedGiftCards: [], orderNote: "" };
        }
        if (fromVersion < 3) {
          return { ...persisted, giftCardCodes: persisted.giftCardCodes ?? [], discountCodes: persisted.discountCodes ?? [], appliedGiftCards: persisted.appliedGiftCards ?? [], orderNote: "" };
        }
        if (fromVersion < 4) {
          return { ...persisted, orderNote: persisted.orderNote ?? "" };
        }
        if (fromVersion < 5) {
          return { ...persisted, subtotalAmount: persisted.subtotalAmount ?? null, totalAmount: persisted.totalAmount ?? null };
        }
        if (fromVersion < 6) {
          return { ...persisted, automaticDiscounts: persisted.automaticDiscounts ?? [] };
        }
        if (fromVersion < 7) {
          // Clear stale automaticDiscounts that may have been set incorrectly by Admin API lookup
          return { ...persisted, automaticDiscounts: [] };
        }
        return persisted;
      },
    }
  )
);

// Eagerly rehydrate from localStorage on module load so the cart count is
// available on first render without waiting for a useEffect tick.
if (typeof window !== "undefined") {
  useCartStore.persist.rehydrate();
}

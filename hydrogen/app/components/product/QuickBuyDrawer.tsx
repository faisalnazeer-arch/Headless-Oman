import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, ShoppingBag } from "lucide-react";
import { QuantitySelector } from "@/components/shared/QuantitySelector";
import { OptionButton } from "@/components/shared/OptionButton";
import { useQuickBuyStore } from "@/stores/quickBuyStore";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice, shopifyImageUrl } from "@/lib/shopify";
import {
  SubscriptionSelector,
  parseSellingPlanGroups,
  type SellingPlanGroup,
} from "@/components/product/SubscriptionSelector";

// Per-handle cache so re-opening the same product is instant (no spinner)
type PlanData = {
  groups: SellingPlanGroup[];
  variantAllocations: Record<string, Record<string, string>>;
};
const _planCache = new Map<string, PlanData>();

export function QuickBuyDrawer() {
  const { product, isOpen, close } = useQuickBuyStore();
  const addItem = useCartStore((s) => s.addItem);
  const addItemError = useCartStore((s) => s.addItemError);
  const [isAdding, setIsAdding] = useState(false);

  const node = product?.node;
  const variants = useMemo(
    () => node?.variants.edges.map((e) => e.node) ?? [],
    [node]
  );
  const options = node?.options ?? [];

  const [selected, setSelected] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);

  // Subscription state
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [sellingPlanGroups, setSellingPlanGroups] = useState<SellingPlanGroup[]>([]);
  const [fetchingPlans, setFetchingPlans] = useState(false);
  // variantId → { planId → subscriptionPriceAmount }
  const [variantAllocations, setVariantAllocations] = useState<Record<string, Record<string, string>>>({});

  // Reset variant selection + qty when the product changes — done DURING render (not in an
  // effect) so the very first paint already shows the correct selection (avoids the flash where
  // all values appear, then the unavailable ones disappear once the effect runs).
  const lastHandle = useRef<string | null>(null);
  if (node && lastHandle.current !== node.handle) {
    lastHandle.current = node.handle;
    const firstAvail = variants.find((v) => v.availableForSale) ?? variants[0];
    const map: Record<string, string> = {};
    firstAvail?.selectedOptions.forEach((o) => (map[o.name] = o.value));
    setSelected(map);
    setQty(1);
  }

  // Load selling plans for the current product.
  // Cache hit → instant (no spinner). Miss → fetch with one auto-retry.
  // AbortController cancels in-flight requests when product changes or drawer unmounts.
  useEffect(() => {
    if (!node?.handle) {
      setSelectedPlanId(null);
      setSellingPlanGroups([]);
      setVariantAllocations({});
      return;
    }

    // Clear any error left from a previous product
    useCartStore.setState({ addItemError: null });

    const cached = _planCache.get(node.handle);
    if (cached) {
      setSelectedPlanId(null);
      setSellingPlanGroups(cached.groups);
      setVariantAllocations(cached.variantAllocations);
      return;
    }

    setSelectedPlanId(null);
    setSellingPlanGroups([]);
    setVariantAllocations({});
    setFetchingPlans(true);

    const ac = new AbortController();

    const load = async (): Promise<void> => {
      try {
        for (let attempt = 0; attempt <= 1; attempt++) {
          if (ac.signal.aborted) return;
          try {
            const res = await fetch(`/api/selling-plans/${node.handle}`, { signal: ac.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as {
              groups: any[];
              discountMap: Record<string, number>;
              variantAllocations: Record<string, Record<string, string>>;
            };
            const groups = parseSellingPlanGroups(data.groups ?? [], data.discountMap ?? {});
            const allocs = data.variantAllocations ?? {};
            _planCache.set(node.handle, { groups, variantAllocations: allocs });
            setSellingPlanGroups(groups);
            setVariantAllocations(allocs);
            return;
          } catch (err: any) {
            if (ac.signal.aborted || err?.name === "AbortError") return;
            if (attempt < 1) {
              await new Promise<void>((r) => setTimeout(r, 400));
              continue;
            }
            console.warn("[QuickBuy] Failed to load subscription plans:", err);
          }
        }
      } finally {
        if (!ac.signal.aborted) setFetchingPlans(false);
      }
    };

    load();

    return () => {
      ac.abort();
      setFetchingPlans(false);
    };
  }, [node?.handle]);

  const matched = variants.find((v) =>
    v.selectedOptions.every((o) => selected[o.name] === o.value)
  );

  // Plan prices for the currently selected variant
  const planPrices: Record<string, string> = matched ? (variantAllocations[matched.id] ?? {}) : {};

  // Compute display price
  const regularPrice = matched?.price ?? node?.priceRange?.minVariantPrice;
  const regularAmt = parseFloat(regularPrice?.amount ?? "0");
  const currency = regularPrice?.currencyCode ?? "OMR";

  const allPlans = sellingPlanGroups.flatMap((g) => g.plans);
  const activePlan = allPlans.find((p) => p.id === selectedPlanId) ?? null;

  const subAmt = selectedPlanId
    ? (() => {
        const exact = planPrices[selectedPlanId];
        if (exact) return parseFloat(exact);
        const pct = activePlan?.discount ?? 10;
        return regularAmt * (1 - pct / 100);
      })()
    : regularAmt;

  const displayPrice = selectedPlanId
    ? { amount: subAmt.toFixed(2), currencyCode: currency }
    : regularPrice ?? { amount: "0", currencyCode: "OMR" };

  const displayCompareAt = selectedPlanId ? regularPrice : matched?.compareAtPrice;

  if (!node) return null;
  const img = node.images.edges[0]?.node;

  const handleAdd = () => {
    if (!matched || isAdding) return;
    useCartStore.setState({ addItemError: null });
    setIsAdding(true);
    // Fire-and-forget — drawer opens immediately
    void addItem({
      product: product!,
      variantId: matched.id,
      variantTitle: matched.title,
      price: displayPrice,
      compareAtPrice: displayCompareAt ?? null,
      quantity: qty,
      selectedOptions: matched.selectedOptions,
      sellingPlanId: selectedPlanId ?? undefined,
      sellingPlanName: activePlan?.name ?? null,
    });
    // Brief button lock to prevent double-submit, then close QuickBuy
    setTimeout(() => {
      setIsAdding(false);
      const { isOpen: cartIsOpen, addItemError: err } = useCartStore.getState();
      if (cartIsOpen && !err) close();
    }, 350);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent className="flex w-[96vw] max-w-[440px] flex-col p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-2.5 sm:px-5">
          <SheetTitle className="font-display text-base">Quick Buy</SheetTitle>
          <SheetDescription className="sr-only">Select options and add to cart</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-2 sm:px-5 sm:py-3">
          <div className="flex gap-3">
            {img && (
              <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-md bg-muted sm:h-20 sm:w-20">
                <img
                  src={shopifyImageUrl(img.url, 300)}
                  alt={img.altText ?? node.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="flex flex-col justify-start">
              <div className="text-sm font-medium leading-tight sm:text-base">{node.title}</div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-display text-base font-bold text-crimson sm:text-2xl">
                  {formatPrice(displayPrice.amount, displayPrice.currencyCode)}
                </span>
                {displayCompareAt && displayCompareAt.amount !== displayPrice.amount && (
                  <span className="text-[11px] text-muted-foreground line-through sm:text-sm">
                    {formatPrice(displayCompareAt.amount, displayCompareAt.currencyCode)}
                  </span>
                )}
              </div>
              {matched && !matched.availableForSale && (
                <div className="mt-0.5 text-xs font-semibold text-destructive">
                  Out of stock
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 space-y-3 sm:mt-6 sm:space-y-5">
            {/* Variant options */}
            {options.map((opt: any) => {
              // Given the CURRENT selection of the other options, does this value lead to an
              // in-stock variant? (e.g. "1kg" may be in stock for Australia but not New Zealand)
              const availForValue = (value: string) =>
                variants.some(
                  (v: any) =>
                    v.selectedOptions.find((o: any) => o.name === opt.name)?.value === value &&
                    v.selectedOptions.every(
                      (o: any) => o.name === opt.name || selected[o.name] === undefined || selected[o.name] === o.value,
                    ) &&
                    v.availableForSale,
                );
              const availableValues = opt.values.filter(availForValue);
              // Hide out-of-stock values for the current selection; keep them all (disabled) if
              // NONE are available, so the option never renders empty.
              const hideUnavailable = availableValues.length > 0;
              return (
              <div key={opt.name}>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:mb-2 sm:text-xs">
                  {opt.name}
                </div>
                <div className="flex flex-wrap gap-1 sm:gap-2">
                  {opt.values.map((value: string) => {
                    if (hideUnavailable && !availableValues.includes(value)) return null;
                    const available = availForValue(value);
                    return (
                      <OptionButton
                        key={value}
                        label={value}
                        active={selected[opt.name] === value}
                        disabled={!available}
                        onClick={() => available && setSelected((s) => ({ ...s, [opt.name]: value }))}
                        className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm"
                      />
                    );
                  })}
                </div>
              </div>
              );
            })}

            {/* Subscription selector */}
            {fetchingPlans ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading subscription options…
              </div>
            ) : sellingPlanGroups.length > 0 ? (
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:mb-2 sm:text-xs">
                  Purchase Type
                </div>
                <SubscriptionSelector
                  groups={sellingPlanGroups}
                  selectedPlanId={selectedPlanId}
                  onSelect={setSelectedPlanId}
                  regularPrice={regularPrice?.amount ?? "0"}
                  currency={currency}
                  planPrices={planPrices}
                />
              </div>
            ) : null}

            {/* Quantity */}
            <div>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:mb-2 sm:text-xs">
                Quantity
              </div>
              <QuantitySelector size="md" value={qty} onChange={setQty} />
            </div>
          </div>
        </div>

        <div className="border-t border-border px-4 py-2.5 sm:p-4">
          {addItemError && (
            <div className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {addItemError}
            </div>
          )}
          <Button
            onClick={handleAdd}
            disabled={!matched?.availableForSale || isAdding || fetchingPlans}
            size="sm"
            className="h-9 w-full bg-crimson text-xs text-crimson-foreground hover:bg-rich-red sm:h-11 sm:text-sm"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : fetchingPlans ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Loading options…
              </>
            ) : (
              <>
                <ShoppingBag className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" />
                {selectedPlanId ? "Subscribe & Add to Cart" : "Add to Cart"}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

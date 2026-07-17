import { memo, useMemo, useState } from "react";
import { useLocalePath } from "@/stores/localeStore";
import { Link } from "react-router";
import { Bell, BellRing, Eye, Loader2, Tag, X } from "lucide-react";
import {
  type ShopifyProduct,
  formatPrice,
  parseRatingMetafields,
  shopifyImageUrl,
} from "@/lib/shopify";
import { StarRating } from "@/components/reviews/StarRating";
import { useCartStore } from "@/stores/cartStore";
import { useQuickBuyStore } from "@/stores/quickBuyStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useT } from "@/i18n/strings";

interface ProductCardProps {
  product: ShopifyProduct;
  onQuickView?: (product: ShopifyProduct) => void;
  ratingOverride?: { average: number; count: number };
  collectionHandle?: string;
}

export const ProductCard = memo(function ProductCard({ product, onQuickView, ratingOverride, collectionHandle }: ProductCardProps) {
  const t = useT();
  const lp = useLocalePath();
  const node = product.node;
  const productPath = collectionHandle
    ? `/collections/${collectionHandle}/products/${node.handle}`
    : `/products/${node.handle}`;
  const variants = node.variants.edges.map((e) => e.node);
  const firstAvailable = variants.find((v) => v.availableForSale) ?? variants[0];
  const isAvailable = !!firstAvailable?.availableForSale;

  const addItem = useCartStore((s) => s.addItem);
  const openQuickBuy = useQuickBuyStore((s) => s.open);
  const [isAdding, setIsAdding] = useState(false);

  const images = node.images.edges.map((e) => e.node);
  const primary = images[0];
  const secondary = images[1] ?? null;
  const currency = node.priceRange.minVariantPrice.currencyCode;
  const minPrice = node.priceRange.minVariantPrice.amount;
  const maxPrice = node.priceRange.maxVariantPrice.amount;
  const showFrom = minPrice !== maxPrice;

  // Max savings across all variants
  const maxSavings = useMemo(() => {
    return variants.reduce((max, v) => {
      if (!v.compareAtPrice) return max;
      const save = parseFloat(v.compareAtPrice.amount) - parseFloat(v.price.amount);
      return save > max ? save : max;
    }, 0);
  }, [variants]);

  const hasOptions =
    variants.length > 1 ||
    node.options.some((o) => o.values.length > 1 && o.values[0] !== "Default Title");

  const isFrozen = node.tags?.some((t) => t.toLowerCase() === "frozen") ?? false;

  const metaRating = parseRatingMetafields(node.metafields);
  const avgRating = (ratingOverride?.average ?? 0) > 0 ? ratingOverride!.average : metaRating.average;
  const reviewCount = (ratingOverride?.count ?? 0) > 0 ? ratingOverride!.count : metaRating.count;

  const handleClick = () => {
    if (hasOptions) { openQuickBuy(product); return; }
    if (!firstAvailable || isAdding) return;
    setIsAdding(true);
    // Fire-and-forget — drawer opens immediately, no need to await the full chain
    void addItem({
      product,
      variantId: firstAvailable.id,
      variantTitle: firstAvailable.title,
      price: firstAvailable.price,
      quantity: 1,
      selectedOptions: firstAvailable.selectedOptions || [],
    });
    setTimeout(() => setIsAdding(false), 350);
  };

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-[var(--shadow-card)]"
    >
      {/* ── Image ── */}
      <Link
        to={lp(productPath)}
        prefetch="viewport"
        className="relative block aspect-square overflow-hidden bg-muted"
      >
        {primary && (
          <img
            src={shopifyImageUrl(primary.url, 600)}
            alt={primary.altText ?? node.title}
            loading="lazy"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${secondary ? "group-hover:opacity-0" : ""}`}
          />
        )}
        {secondary && (
          <img
            src={shopifyImageUrl(secondary.url, 600)}
            alt={secondary.altText ?? node.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
        )}

        {/* Top-left: savings + frozen badges */}
        {(maxSavings > 0.01 || isFrozen) && (
          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {maxSavings > 0.01 && (
              <span className="inline-flex items-center gap-1 rounded-sm bg-crimson px-2 py-0.5 text-[10px] font-bold text-white">
                <Tag className="h-2.5 w-2.5" />
                Up to {currency} {maxSavings.toFixed(2)} off
              </span>
            )}
            {isFrozen && (
              <span className="inline-flex rounded-sm bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Frozen</span>
            )}
          </div>
        )}

        {/* Sold out overlay */}
        {!isAvailable && (
          <div className="absolute inset-0 flex items-end justify-start bg-black/25">
            <span className="m-2 inline-flex items-center rounded-sm bg-charcoal/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {t("product.sold_out")}
            </span>
          </div>
        )}

        {/* Quick view */}
        {onQuickView && (
          <button
            type="button"
            aria-label={`${t("product.quick_view")} — ${node.title}`}
            onClick={(e) => { e.preventDefault(); onQuickView(product); }}
            className="absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-2 rounded-sm bg-charcoal/90 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-off-white opacity-0 backdrop-blur transition-opacity duration-300 group-hover:opacity-100"
          >
            <Eye className="h-3.5 w-3.5" /> {t("product.quick_view")}
          </button>
        )}
      </Link>

      {/* ── Card body ── */}
      <div className="flex flex-1 flex-col p-3">
        <Link
          to={lp(productPath)}
          prefetch="viewport"
          className="text-balance text-xs font-medium leading-snug text-foreground transition-colors hover:text-crimson sm:text-sm"
          title={node.title}
        >
          {node.title}
        </Link>

        {avgRating > 0 && (
          <div className="mt-0.5 flex items-center gap-0.5">
            <StarRating rating={avgRating} size="sm" />
            <span className="text-[10px] text-muted-foreground">({reviewCount})</span>
          </div>
        )}

        {/* Price + button pushed to bottom */}
        <div className="mt-auto flex flex-col gap-1.5 pt-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5 leading-tight">
            {showFrom && (
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                {t("product.from")}
              </span>
            )}
            <span className="font-display text-sm font-bold text-crimson sm:text-base">
              {formatPrice(minPrice, currency)}
            </span>
            {firstAvailable?.compareAtPrice && (
              <span className="text-[10px] text-muted-foreground line-through">
                {formatPrice(firstAvailable.compareAtPrice.amount, currency)}
              </span>
            )}
          </div>
          {!isAvailable ? (
            <NotifyMeCard
              variantId={firstAvailable?.id ?? ""}
              productHandle={node.handle}
            />
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleClick}
              disabled={isAdding}
              className="h-7 w-full text-[11px] sm:h-8 sm:text-xs"
            >
              {isAdding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : hasOptions ? (
                t("product.quick_buy")
              ) : (
                t("product.add")
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

// ── Notify Me (card variant) ───────────────────────────────────────────────
function NotifyMeCard({ variantId, productHandle }: { variantId: string; productHandle: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/back-in-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, variantId, productHandle }),
      });
      setStatus(res.ok ? "success" : "error");
    } catch {
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-green-50 px-2 text-[11px] font-semibold text-green-700 sm:h-8">
        <BellRing className="h-3 w-3 shrink-0" />
        {t("product.notify_listed")}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-crimson/50 text-[11px] font-semibold text-crimson transition-colors hover:border-crimson hover:bg-crimson/5 sm:h-8 sm:text-xs"
      >
        <Bell className="h-3 w-3 shrink-0" />
        {t("product.notify_submit")}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          required
          autoFocus
          className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] outline-none focus:border-crimson"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        type="submit"
        disabled={status === "loading"}
        className="flex h-7 w-full items-center justify-center rounded-md bg-crimson text-[11px] font-bold text-white transition-colors hover:bg-rich-red disabled:opacity-60 sm:h-8"
      >
        {status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("product.notify_submit")}
      </button>
      {status === "error" && (
        <p className="text-[10px] text-destructive">Try again</p>
      )}
    </form>
  );
}

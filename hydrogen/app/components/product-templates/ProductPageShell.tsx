import { useState, useEffect, useCallback, type ReactNode, useRef } from "react";
import { useLocalePath } from "@/stores/localeStore";
import { useT } from "@/i18n/strings";
import {
  Minus, Plus, Truck, ShieldCheck, RefreshCw, Loader2, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, Check, Play, MapPin, Phone, Clock, X, Store,
  FlameKindling, Leaf, PackageOpen, BookOpen, Thermometer,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Link } from "react-router";
import { OriginBadge } from "~/components/product/OriginBadge";
import { StockBadge } from "~/components/product/StockBadge";
import {
  formatPrice,
  getOriginFromTags,
  parseRatingMetafields,
  shopifyImageUrl,
  type ShopifyProduct,
} from "~/lib/shopify";
import { useCartStore } from "~/stores/cartStore";
import { useRecentlyViewed } from "~/stores/recentlyViewedStore";
import { JudgemeReviews } from "~/components/reviews/JudgemeReviews";
import { JudgemeWidgetEmbed } from "~/components/reviews/JudgemeWidgetEmbed";
import { StarRating } from "~/components/reviews/StarRating";
import { SubscriptionSelector, parseSellingPlanGroups } from "~/components/product/SubscriptionSelector";
import { ProductCard } from "~/components/product/ProductCard";
import { HScroller } from "~/components/home/HScroller";
import { RecentlyViewed } from "~/components/home/RecentlyViewed";
import { GloboProductOptions } from "~/components/product/GloboProductOptions";
import type { GloboOptionSet } from "~/lib/globo";
import { pushDataLayer, gaItem } from "~/lib/dataLayer";

export interface PageSettings {
  deliveryTitle: string;
  deliveryContent: string | null;
  supportTitle: string;
  supportContent: string | null;
  dubaiDeliveryInfo: Array<{ label: string; body: string }> | null;
  abudhabiDeliveryInfo: Array<{ label: string; body: string }> | null;
  sharjahDeliveryInfo: Array<{ label: string; body: string }> | null;
  // Metaobject-driven delivery tabs (editable name + rows). Preferred over the per-city fields above.
  deliveryCities?: Array<{ name: string; rows: Array<{ label: string; body: string }> }> | null;
  // Metaobject-driven Free Returns accordion (editable title + bullet list).
  freeReturnsTitle?: string;
  freeReturns?: string[] | null;
  badgeImage: string | null;
}

export type AccordionSection = { value: string; label: string; content: ReactNode };

export interface ProductPageShellProps {
  product: any;
  sellingPlanGroupsRaw: any[];
  discountMap: Record<string, number>;
  reviews: any[];
  reviewsTotalCount: number;
  rating: any;
  externalId?: string | null;
  templateSuffix?: string | null;
  extraSections?: ReactNode;
  accordionSections?: AccordionSection[];
  recommendations?: ShopifyProduct[];
  pageSettings?: PageSettings;
  globoOptionSets?: GloboOptionSet[];
  iconBadges?: any[];
}



// ── Description with read more ──────────────────────────────────────────────
function DescriptionWithToggle({ html }: { html: string }) {
  return (
    <div className="prose prose-sm max-w-none [&_p]:leading-relaxed [&_table]:block [&_table]:overflow-x-auto [&_pre]:overflow-x-auto [&_img]:max-w-full"
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

// ── Accordion ──────────────────────────────────────────────────────────────
function AccordionItem({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-4 text-left text-sm font-semibold transition-colors hover:text-crimson">
        {title}
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div ref={contentRef} className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
        style={{ maxHeight: open ? "none" : 0 }}>
        <div className="pb-4 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

// ── Linkify phone / email in text lines ────────────────────────────────────
function LinkifyLine({ text }: { text: string }) {
  const parts = text.split(/(\+[\d\s]{7,}|[\w.+-]+@[\w-]+\.[a-z]{2,})/gi);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\+[\d\s]{7,}$/.test(part))
          return <a key={i} href={`tel:${part.replace(/\s/g, "")}`} className="font-medium text-crimson hover:underline">{part}</a>;
        if (/^[\w.+-]+@[\w-]+\.[a-z]{2,}$/i.test(part))
          return <a key={i} href={`mailto:${part}`} className="font-medium text-crimson hover:underline">{part}</a>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Back in stock ─────────────────────────────────────────────────────────
function BackInStock({ productHandle, variantId }: { productHandle: string; variantId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/back-in-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, productHandle, variantId }),
      });
      const data = await res.json() as any;
      if (!res.ok) { setErrorMsg(data.error ?? "Could not register"); setStatus("error"); }
      else setStatus("success");
    } catch {
      setErrorMsg("Could not register notification");
      setStatus("error");
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-crimson/50 py-3 text-sm font-semibold text-crimson transition-colors hover:border-crimson hover:bg-crimson/5">
        {t("product.notify_me")}
      </button>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-4">
      <p className="mb-3 text-sm font-semibold">{t("product.notify_heading")}</p>
      {status === "success" ? (
        <p className="text-sm font-medium text-green-700">{t("product.notify_success")}</p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <input type="text" placeholder={t("product.name_placeholder")} value={name} onChange={(e) => setName(e.target.value)} required
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-crimson" />
          <input type="email" placeholder={t("product.email_placeholder")} value={email} onChange={(e) => setEmail(e.target.value)} required
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-crimson" />
          {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={status === "loading"}
              className="flex-1 rounded-lg bg-crimson py-2 text-sm font-bold text-crimson-foreground hover:bg-rich-red disabled:opacity-50">
              {status === "loading" ? t("product.submitting") : t("product.notify_submit")}
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Media items ───────────────────────────────────────────────────────────
type MediaItem =
  | { type: "image"; url: string; altText: string | null }
  | { type: "video"; id: string; mp4Url: string | null; poster: string | null }
  | { type: "external_video"; id: string; embedUrl: string; poster: string | null };

function buildMediaItems(images: any[], mediaNodes: any[]): MediaItem[] {
  if (mediaNodes && mediaNodes.length > 0) {
    return mediaNodes
      .map((node: any): MediaItem | null => {
        if (node.mediaContentType === "VIDEO") {
          const mp4 = node.sources?.find((s: any) => s.mimeType === "video/mp4") ?? node.sources?.[0];
          return { type: "video", id: node.id, mp4Url: mp4?.url ?? null, poster: node.previewImage?.url ?? null };
        }
        if (node.mediaContentType === "EXTERNAL_VIDEO") {
          return { type: "external_video", id: node.id, embedUrl: node.embedUrl, poster: node.previewImage?.url ?? null };
        }
        const imgUrl = node.image?.url ?? "";
        if (!imgUrl) return null;
        return { type: "image", url: imgUrl, altText: node.image?.altText ?? null };
      })
      .filter((m): m is MediaItem => m !== null);
  }
  return images.map((img: any): MediaItem => ({ type: "image", url: img.url ?? "", altText: img.altText ?? null }));
}

// ── Nutrition helpers ─────────────────────────────────────────────────────
// FDA daily reference values used to compute % Daily Value
const FDA_DV: Record<string, number> = {
  total_fat:           78,   // g
  saturated_fat:       20,   // g
  total_cholesterol:  300,   // mg
  sodium:            2300,   // mg
  total_carbohydrates: 275,  // g
  dietary_fibers:      28,   // g
  iron:                18,   // mg
};

const NUTRITION_ROWS: Array<{
  ns: string; key: string; label: string; indent?: boolean; noDv?: boolean; separator?: boolean;
}> = [
  { ns: "nutrition", key: "total_fat",           label: "Total Fat" },
  { ns: "nutrition", key: "saturated_fat",       label: "Saturated Fat",      indent: true },
  { ns: "nutrition", key: "trans_fat",           label: "Trans Fat",          indent: true, noDv: true },
  { ns: "nutrition", key: "total_cholesterol",   label: "Cholesterol" },
  { ns: "nutrition", key: "sodium",              label: "Sodium" },
  { ns: "nutrition", key: "total_carbohydrates", label: "Total Carbohydrate" },
  { ns: "nutrition", key: "dietary_fibers",      label: "Dietary Fiber",      indent: true },
  { ns: "nutrition", key: "sugar",               label: "Total Sugars",       indent: true, noDv: true },
  { ns: "nutrition", key: "protein",             label: "Protein",            noDv: true },
  { ns: "nutrition", key: "iron",                label: "Iron",               separator: true },
];

function getMF(variant: any, ns: string, key: string): string | null {
  return variant?.metafields?.find((m: any) => m?.namespace === ns && m?.key === key)?.value ?? null;
}

function getProductMF(product: any, ns: string, key: string): string | null {
  return product?.metafields?.find((m: any) => m?.namespace === ns && m?.key === key)?.value ?? null;
}

// Converts a Shopify rich_text metafield JSON string to safe HTML.
// Falls back to plain text with <br> newlines if not JSON.
function nodeToHtml(node: any): string {
  if (!node) return '';
  if (node.type === 'text') {
    let t = (node.value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (node.bold)      t = `<strong>${t}</strong>`;
    if (node.italic)    t = `<em>${t}</em>`;
    if (node.underline) t = `<u>${t}</u>`;
    return t;
  }
  const inner = (node.children ?? []).map(nodeToHtml).join('');
  switch (node.type) {
    case 'root':      return inner;
    case 'paragraph': return inner ? `<p>${inner}</p>` : '';
    case 'heading':   return `<h${node.level ?? 2}>${inner}</h${node.level ?? 2}>`;
    case 'list':      return node.listType === 'ordered' ? `<ol>${inner}</ol>` : `<ul>${inner}</ul>`;
    case 'list-item': return `<li>${inner}</li>`;
    case 'link':      return `<a href="${node.url ?? '#'}" rel="noopener noreferrer">${inner}</a>`;
    default:          return inner;
  }
}
function richTextToHtml(value: string): string {
  if (!value) return '';
  if (!value.trim().startsWith('{')) return value.replace(/\n/g, '<br>');
  try { return nodeToHtml(JSON.parse(value)); } catch { return value.replace(/\n/g, '<br>'); }
}

// Formats a score: whole number → "8/10", fraction stays as-is ("4/5")
function formatScore(val: string): string {
  const n = Number(val.trim());
  return !isNaN(n) && Number.isInteger(n) ? `${n}/10` : val.trim();
}

function calcDv(rawValue: string | null, key: string): string | null {
  const dvFactor = FDA_DV[key];
  if (!rawValue || !dvFactor) return null;
  const num = parseFloat(rawValue.match(/[\d.]+/)?.[0] ?? "");
  if (isNaN(num)) return null;
  return `${Math.round((num / dvFactor) * 100)}%`;
}

function NutritionPanel({ variant }: { variant: any }) {
  const portion = getMF(variant, "custom", "portion_text") ?? "Per 100g";
  const caloriesRaw = getMF(variant, "nutrition", "total_energy");
  const caloriesNum = caloriesRaw?.match(/[\d.]+/)?.[0] ?? caloriesRaw ?? "";
  const rows = NUTRITION_ROWS.map(r => {
    const value = getMF(variant, r.ns, r.key);
    return { ...r, value, dv: r.noDv ? null : calcDv(value, r.key) };
  }).filter(r => r.value);

  if (!caloriesRaw && rows.length === 0) return (
    <p className="py-8 text-center text-sm text-muted-foreground">
      Nutrition information not available for this variant.
    </p>
  );

  return (
    <div className="mx-auto w-full max-w-lg font-sans">
      <div className="overflow-hidden rounded-xl border-[2px] border-foreground sm:rounded-2xl sm:border-[3px]">

        {/* Header */}
        <div className="border-b-[6px] border-foreground px-3 pt-2.5 pb-1.5 sm:border-b-[10px] sm:px-4 sm:pt-3 sm:pb-2">
          <h2 className="text-2xl font-black leading-none tracking-tight sm:text-[2rem]">Nutrition Facts</h2>
          <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-foreground/20 pt-1 sm:mt-2 sm:pt-1.5">
            <span className="text-xs sm:text-sm">Serving size</span>
            <span className="text-xs font-bold sm:text-sm">{portion}</span>
          </div>
        </div>

        {/* Calories */}
        {caloriesNum && (
          <div className="border-b-[4px] border-foreground px-3 py-1.5 sm:border-b-[5px] sm:px-4 sm:py-2">
            <p className="text-[10px] font-medium text-foreground/70 sm:text-[11px]">Amount per serving</p>
            <div className="flex items-end justify-between">
              <span className="text-lg font-black leading-tight sm:text-2xl">Calories</span>
              <span className="text-[2.25rem] font-black leading-none tabular-nums sm:text-5xl">{caloriesNum}</span>
            </div>
          </div>
        )}

        {/* % DV header */}
        <div className="border-b border-foreground/25 px-3 py-0.5 sm:px-4">
          <p className="text-right text-[10px] font-bold sm:text-[11px]">% Daily Value*</p>
        </div>

        {/* Nutrient rows */}
        <div>
          {rows.map((row) => (
            <div key={row.key}
              className={`flex items-baseline justify-between border-b border-foreground/15 px-3 py-0.5 text-[11px] last:border-b-0 sm:px-4 sm:py-1 sm:text-sm ${row.separator ? "border-t-[3px] border-t-foreground sm:border-t-[5px]" : ""} ${row.indent ? "ps-5 sm:ps-8" : ""}`}>
              <span className="flex-1 leading-snug">
                {row.indent
                  ? <span className="text-foreground/80">{row.label} <em className="not-italic text-foreground/60 text-[10px] sm:text-xs">{row.value}</em></span>
                  : <><strong>{row.label}</strong> <span className="font-normal">{row.value}</span></>
                }
              </span>
              {!row.noDv && (
                <span className="ml-2 shrink-0 font-bold tabular-nums text-[11px] sm:ml-3 sm:text-sm">
                  {row.dv ?? ""}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Footnote */}
        <div className="border-t-[3px] border-foreground px-3 py-2 sm:border-t-[5px] sm:px-4 sm:py-2.5">
          <p className="text-[9px] leading-snug text-foreground/55 sm:text-[10px]">
            * The % Daily Value (DV) tells you how much a nutrient in a serving of food contributes to a daily diet. 2,000 calories a day is used for general nutrition advice.
          </p>
        </div>
      </div>
    </div>
  );
}

function DeliveryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-3 last:border-b-0 sm:flex-row sm:gap-6">
      <span className="w-32 shrink-0 text-[13px] font-semibold text-foreground">{label}</span>
      <span className="text-[13px] leading-relaxed text-muted-foreground">{children}</span>
    </div>
  );
}

type CityTab = "dubai" | "abudhabi" | "sharjah";

function DeliveryTab({ pageSettings }: { pageSettings: PageSettings | undefined }) {
  const t = useT();
  const [cityIdx, setCityIdx] = useState(0);

  type CityBlock = { label: string; body: string };

  const DEFAULT_DUBAI: CityBlock[] = [
    { label: "Delivery Time",         body: "Fresh delivery within 1 hour across Dubai. Order before 8:45 PM for same-day delivery, 7 days a week." },
    { label: "Last Order Time",       body: "8:45 PM is our last order cutoff, all days of the week." },
    { label: "Delivery Fee",          body: "No minimum order value. Standard delivery fee is AED 15." },
    { label: "Free Returns",          body: "We offer a \"no questions asked\" free returns policy which allows you to return delivered items to us for any reason up to 30 days from the delivery of your order, free of charge." },
    { label: "100% Satisfaction",     body: "We offer 100% satisfaction policy. Please WhatsApp us on our customer service number within 24 hours and we will fix your experience. Call or WhatsApp: +971 50 451 6403" },
    { label: "Tipping",               body: "There's no need to tip your delivery driver — we pay a living wage that doesn't depend on tips." },
  ];
  const DEFAULT_ABUDHABI: CityBlock[] = [
    { label: "Delivery Time",         body: "Fresh delivery within 2 hours across Abu Dhabi. Order before 8:45 PM for same-day delivery, 7 days a week." },
    { label: "Last Order Time",       body: "8:45 PM is our last order cutoff, all days of the week." },
    { label: "Delivery Fee",          body: "No minimum order value. Standard delivery fee is AED 20." },
    { label: "Free Returns",          body: "We offer a \"no questions asked\" free returns policy which allows you to return delivered items to us for any reason up to 30 days from the delivery of your order, free of charge." },
    { label: "100% Satisfaction",     body: "We offer 100% satisfaction policy. Please WhatsApp us on our customer service number within 24 hours and we will fix your experience. Call or WhatsApp: +971 50 451 6403" },
    { label: "Tipping",               body: "There's no need to tip your delivery driver — we pay a living wage that doesn't depend on tips." },
  ];
  const DEFAULT_SHARJAH: CityBlock[] = [
    { label: "Delivery Time",         body: "Same-day delivery across Sharjah and Ajman. Order before 8:45 PM for same-day delivery, 7 days a week." },
    { label: "Last Order Time",       body: "8:45 PM is our last order cutoff, all days of the week." },
    { label: "Delivery Fee",          body: "No minimum order value. Standard delivery fee is AED 15." },
    { label: "Free Returns",          body: "We offer a \"no questions asked\" free returns policy which allows you to return delivered items to us for any reason up to 30 days from the delivery of your order, free of charge." },
    { label: "100% Satisfaction",     body: "We offer 100% satisfaction policy. Please WhatsApp us on our customer service number within 24 hours and we will fix your experience. Call or WhatsApp: +971 50 451 6403" },
    { label: "Tipping",               body: "There's no need to tip your delivery driver — we pay a living wage that doesn't depend on tips." },
  ];

  // Prefer the metaobject-driven cities (editable tab name + rows); fall back to the
  // hardcoded defaults (with translated tab names) when not configured.
  const cities: Array<{ name: string; rows: CityBlock[] }> =
    pageSettings?.deliveryCities && pageSettings.deliveryCities.length
      ? pageSettings.deliveryCities
      : [
          { name: t("product.city_dubai"),    rows: pageSettings?.dubaiDeliveryInfo    ?? DEFAULT_DUBAI },
          { name: t("product.city_abudhabi"), rows: pageSettings?.abudhabiDeliveryInfo ?? DEFAULT_ABUDHABI },
          { name: t("product.city_sharjah"),  rows: pageSettings?.sharjahDeliveryInfo  ?? DEFAULT_SHARJAH },
        ];
  const activeIdx = Math.min(cityIdx, cities.length - 1);
  const active = cities[activeIdx] ?? cities[0];

  return (
    <div className="mx-auto max-w-2xl space-y-8">

      {/* Delivery by city */}
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-crimson">
          <Truck className="h-3.5 w-3.5" />
          {pageSettings?.deliveryTitle ?? t("product.delivery_info_title")}
        </h3>

        {/* City tabs — crimson pill active */}
        <div className="mb-4 overflow-x-auto sm:mb-5">
          <div className="flex min-w-max gap-1 rounded-lg border border-border p-0.5 sm:p-1">
            {cities.map((c, i) => (
              <button key={i} type="button" onClick={() => setCityIdx(i)}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 sm:py-2 ${
                  i === activeIdx ? "bg-crimson text-crimson-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 sm:space-y-3">
          {active.rows.map(({ label, body }, i) => (
            <div key={i} className="rounded-lg border border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="mb-0.5 text-xs font-semibold text-foreground sm:mb-1 sm:text-sm">{label}</p>
              <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground sm:text-sm">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Product Details Tab — Origin, Tasting Profile, How to Cook, Suitable For, Storage ──
type ProductDetailTabId = "origin" | "tasting" | "cooking" | "suitable" | "storage";

function ProductDetailsTab({ product }: { product: any }) {
  const t = useT();
  // Shopify stores mls.* names as custom.mls_* identifiers.
  // Try both short form (e.g. mls_flavour) and long form (mls_flavour_score) for resilience.
  const mls = (key: string) => getProductMF(product, "custom", `mls_${key}`);
  const mlsOr = (a: string, b: string) => mls(a) ?? mls(b);

  // Origin & Farm Story
  const originFlag    = mls("origin_flag_emoji");
  const originCountry = mls("origin_country");
  const feedType      = mls("feed_type");
  const halal         = mls("halal_certified");
  const exportCert    = mls("export_certified");
  const farmStory     = mls("farm_story");
  const hasOrigin     = !!(originFlag || originCountry || feedType || halal || exportCert || farmStory);

  // Tasting Profile — identifier screenshots show mls_flavour (not mls_flavour_score)
  // and mls_marbling may also exist without _score suffix; try both for safety.
  const flavour    = mlsOr("flavour", "flavour_score");
  const marbling   = mlsOr("marbling", "marbling_score");
  const tenderness = mls("tenderness_score2");
  const doneness   = mls("doneness_tags");
  const hasTasting = !!(flavour || marbling || tenderness || doneness);

  // How to Cook
  const cookMethod = mls("cook_method");
  const cookTime   = mls("cook_time");
  const cookTemp   = mls("cook_temperature");
  const cookSteps  = mls("cook_steps");
  const hasCooking = !!(cookMethod || cookTime || cookTemp || cookSteps);

  // Suitable For (List type — value is a JSON array)
  const suitableTags = mls("suitable_for_tags");
  const hasSuitable  = !!suitableTags;

  // Storage & Shelf Life
  const storageTip  = mls("storage_tip");
  const fridgeLife  = mls("fridge_life");
  const hasStorage  = !!(storageTip || fridgeLife);

  const allTabs: Array<{ id: ProductDetailTabId; label: string; has: boolean }> = [
    { id: "origin",   label: t("product.origin_farm_story"), has: hasOrigin },
    { id: "tasting",  label: t("product.tasting_profile"),   has: hasTasting },
    { id: "cooking",  label: t("product.how_to_cook"),       has: hasCooking },
    { id: "suitable", label: t("product.suitable_for"),      has: hasSuitable },
    { id: "storage",  label: t("product.storage"),           has: hasStorage },
  ];
  const availableTabs = allTabs.filter((tab) => tab.has);
  const [active, setActive] = useState<ProductDetailTabId>(availableTabs[0]?.id ?? "origin");

  if (availableTabs.length === 0) return null;

  // Handles both JSON arrays (list.* metafields) and comma-separated plain text
  const parseTags = (val: string): string[] => {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* fall through */ }
    return val.split(",").map((s) => s.replace(/^and\s+/i, "").trim()).filter(Boolean);
  };

  // Score to % for progress bar (assumes /10 scale)
  const scorePercent = (val: string) => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : Math.min(100, Math.max(0, (n / 10) * 100));
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Sub-tab bar */}
      {availableTabs.length > 1 && (
        <div className="mb-4 overflow-x-auto sm:mb-5">
          <div className="flex min-w-max gap-1 rounded-lg border border-border p-0.5 sm:p-1">
            {availableTabs.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => setActive(id)}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 sm:py-2 ${
                  active === id ? "bg-crimson text-crimson-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Origin & Farm Story ── */}
      {active === "origin" && (
        <div className="space-y-3">
          {(originFlag || originCountry) && (
            <div className="inline-flex items-center gap-2 rounded-full border border-crimson/20 bg-crimson/5 px-3 py-1.5">
              {originFlag && <span className="text-xl leading-none">{originFlag}</span>}
              {originCountry && <span className="text-sm font-semibold text-crimson">{originCountry}</span>}
            </div>
          )}
          {feedType && (
            <div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {feedType}
              </span>
            </div>
          )}
          {(halal || exportCert) && (
            <div className="flex flex-wrap gap-2">
              {halal && halal !== "false" && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                  <Check className="h-3 w-3" /> Halal Certified
                </span>
              )}
              {exportCert && exportCert !== "false" && (
                <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
                  <Check className="h-3 w-3" /> Export Certified
                </span>
              )}
            </div>
          )}
          {farmStory && (
            <div
              className="prose prose-sm max-w-none text-muted-foreground [&_p]:leading-relaxed [&_ul]:ps-4 [&_ol]:ps-4 [&_li]:mb-1"
              dangerouslySetInnerHTML={{ __html: richTextToHtml(farmStory) }}
            />
          )}
        </div>
      )}

      {/* ── Tasting Profile — progress bars matching live theme ── */}
      {active === "tasting" && (
        <div className="space-y-5">
          {[
            { label: "Flavour",    value: flavour },
            { label: "Marbling",   value: marbling },
            { label: "Tenderness", value: tenderness },
          ].filter((r) => r.value).map(({ label, value }) => (
            <div key={label}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-semibold text-foreground">{label}</span>
                <span className="text-sm font-bold text-crimson">{formatScore(value!)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-crimson transition-[width] duration-500"
                  style={{ width: `${scorePercent(value!)}%` }}
                />
              </div>
            </div>
          ))}
          {doneness && (
            <div className="pt-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {t("product.rec_doneness")}
              </p>
              <div className="flex flex-wrap gap-2">
                {parseTags(doneness).map((tag) => (
                  <span key={tag} className="rounded-full border border-crimson/30 bg-crimson/5 px-3 py-1 text-xs font-semibold text-crimson">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── How to Cook — compact icon pills matching live theme ── */}
      {active === "cooking" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {cookMethod && (
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground">
                <FlameKindling className="h-3.5 w-3.5 shrink-0 text-crimson" />
                {cookMethod}
              </span>
            )}
            {cookTemp && (
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground">
                <Thermometer className="h-3.5 w-3.5 shrink-0 text-crimson" />
                {cookTemp}
              </span>
            )}
            {cookTime && (
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground">
                <Clock className="h-3.5 w-3.5 shrink-0 text-crimson" />
                {cookTime}
              </span>
            )}
          </div>
          {cookSteps && (
            <div className="rounded-lg border border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="mb-2 text-xs font-semibold text-foreground sm:text-sm">Steps</p>
              <div
                className="prose prose-sm max-w-none text-muted-foreground [&_ol]:ps-4 [&_ul]:ps-4 [&_li]:mb-1 [&_p]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: richTextToHtml(cookSteps) }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Suitable For ── */}
      {active === "suitable" && suitableTags && (
        <div className="flex flex-wrap gap-2">
          {parseTags(suitableTags).map((tag) => (
            <span key={tag}
              className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ── Storage & Shelf Life ── */}
      {active === "storage" && (
        <div className="space-y-3">
          {fridgeLife && (
            <div className="rounded-lg border border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="mb-0.5 text-xs font-semibold text-foreground sm:mb-1 sm:text-sm">Fridge Life</p>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">{fridgeLife}</p>
            </div>
          )}
          {storageTip && (
            <div className="rounded-lg border border-border/60 px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="mb-0.5 text-xs font-semibold text-foreground sm:mb-1 sm:text-sm">Storage Tips</p>
              <div
                className="prose prose-sm max-w-none text-muted-foreground [&_p]:leading-relaxed"
                dangerouslySetInnerHTML={{ __html: richTextToHtml(storageTip) }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── InfoTabs — shown below the product grid ────────────────────────────────
type TabId = "nutrition" | "template" | "delivery" | "productDetails";

function InfoTabs({
  extraSections,
  extraSectionTitle,
  pageSettings,
  variant,
  product,
}: {
  extraSections: ReactNode | undefined;
  extraSectionTitle: string;
  pageSettings: PageSettings | undefined;
  variant: any;
  product: any;
}) {
  const t = useT();
  const hasNutrition     = !!getMF(variant, "nutrition", "total_energy") || NUTRITION_ROWS.some(r => getMF(variant, r.ns, r.key));
  const hasTemplate      = !!extraSections;
  const hasProductDetails = ([
    "mls_origin_flag_emoji", "mls_origin_country", "mls_feed_type", "mls_halal_certified",
    "mls_export_certified", "mls_farm_story",
    "mls_flavour", "mls_flavour_score", "mls_marbling", "mls_marbling_score",
    "mls_tenderness_score2", "mls_doneness_tags",
    "mls_cook_method", "mls_cook_time", "mls_cook_temperature", "mls_cook_steps",
    "mls_suitable_for_tags", "mls_storage_tip", "mls_fridge_life",
  ] as const).some(key => !!getProductMF(product, "custom", key));

  // Tab order: Understanding Rubs → Product Details → Nutrition Facts → Delivery Info
  const tabs: Array<{ id: TabId; label: string; Icon: any }> = [
    hasTemplate       && { id: "template"       as TabId, label: extraSectionTitle,                    Icon: FlameKindling },
    hasProductDetails && { id: "productDetails" as TabId, label: t("product.product_details"),         Icon: BookOpen },
    hasNutrition      && { id: "nutrition"      as TabId, label: t("product.nutrition_tab"),           Icon: Leaf },
                         { id: "delivery"       as TabId, label: t("product.delivery_info"),           Icon: PackageOpen },
  ].filter(Boolean) as Array<{ id: TabId; label: string; Icon: any }>;

  const [active, setActive] = useState<TabId>(tabs[0].id);

  useEffect(() => {
    if (!tabs.find(t => t.id === active)) setActive(tabs[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant?.id]);

  return (
    <div className="border-t border-border bg-card">
      <div className="container mx-auto px-4">
        {/* Tab bar */}
        <div className="flex overflow-x-auto">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-semibold transition-colors sm:gap-2 sm:px-5 sm:py-4 ${
                active === id
                  ? "border-crimson text-crimson"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="py-4 sm:py-5">
          {active === "template"       && hasTemplate       && <div>{extraSections}</div>}
          {active === "productDetails" && hasProductDetails && <ProductDetailsTab product={product} />}
          {active === "nutrition"      && hasNutrition      && <NutritionPanel variant={variant} />}
          {active === "delivery"                            && <DeliveryTab pageSettings={pageSettings} />}
        </div>
      </div>
    </div>
  );
}

// ── Returns tab ───────────────────────────────────────────────────────────────
function ReturnsTab() {
  const t = useT();
  return (
    <div className="mx-auto max-w-2xl">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-crimson">
        <RefreshCw className="h-3.5 w-3.5" />
        {t("product.free_returns_title")}
      </h3>
      <div className="divide-y divide-border/50">
        {[
          "Drop a WhatsApp message or send us an email within 24 hours after delivery.",
          "We will exchange the product and deliver it again to your door, or you can pick it up if you want.",
          "You will receive the product or a refund. Refunds will be processed within 14 working days.",
        ].map((line, i) => (
          <p key={i} className="py-2.5 text-xs leading-relaxed text-muted-foreground sm:py-3 sm:text-[13px]">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

// ── Pickup availability drawer ────────────────────────────────────────────
interface StoreNode {
  available: boolean;
  pickUpTime?: string | null;
  location: {
    name: string;
    address?: {
      address1?: string | null;
      address2?: string | null;
      city?: string | null;
      province?: string | null;
      country?: string | null;
      phone?: string | null;
    } | null;
  };
}

function PickupDrawer({
  open, onClose, productTitle, variantTitle, stores,
}: {
  open: boolean;
  onClose: () => void;
  productTitle: string;
  variantTitle: string;
  stores: StoreNode[];
}) {
  const t = useT();
  const available = stores.filter((s) => s.available);
  const unavailable = stores.filter((s) => !s.available);
  const sorted = [...available, ...unavailable];

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col gap-0 overflow-y-auto p-0">
        <SheetHeader className="sticky top-0 z-10 border-b border-border bg-background px-5 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-base font-bold">{t("product.store_availability")}</SheetTitle>
            <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-sm font-semibold leading-snug">{productTitle}</p>
            {variantTitle && variantTitle !== "Default Title" && (
              <p className="text-xs text-muted-foreground">{variantTitle}</p>
            )}
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-3 p-5">
          {sorted.map((store, i) => (
            <div
              key={i}
              className={`rounded-xl border p-4 transition-colors ${
                store.available ? "border-green-200 bg-green-50/40" : "border-border bg-muted/20"
              }`}
            >
              {/* Store name + status */}
              <div className="flex items-start gap-2.5">
                <Store className={`mt-0.5 h-4 w-4 flex-shrink-0 ${store.available ? "text-green-600" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{store.location.name}</p>
                  {store.available ? (
                    <>
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {t("product.pickup_available")}
                      </span>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        {store.pickUpTime ?? t("product.usually_ready")}
                      </div>
                    </>
                  ) : (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                      {t("product.unavailable")}
                    </span>
                  )}
                </div>
              </div>

              {/* Address */}
              {store.location.address && (
                <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <div className="leading-relaxed">
                    {store.location.address.address1 && <p>{store.location.address.address1}</p>}
                    {store.location.address.address2 && <p>{store.location.address.address2}</p>}
                    {(store.location.address.city || store.location.address.province) && (
                      <p>{[store.location.address.city, store.location.address.province].filter(Boolean).join(" ")}</p>
                    )}
                    {store.location.address.country && <p>{store.location.address.country}</p>}
                  </div>
                </div>
              )}

              {/* Phone */}
              {store.location.address?.phone && (
                <a
                  href={`tel:${store.location.address.phone.replace(/\s/g, "")}`}
                  className="mt-2.5 flex items-center gap-2 text-xs font-semibold text-crimson hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {store.location.address.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────
export function ProductPageShell({
  product,
  sellingPlanGroupsRaw,
  discountMap,
  reviews,
  reviewsTotalCount,
  rating,
  externalId,
  templateSuffix,
  extraSections,
  accordionSections = [],
  recommendations = [],
  pageSettings,
  globoOptionSets = [],
  iconBadges = [],
}: ProductPageShellProps) {
  const lp = useLocalePath();
  const t = useT();
  const [globoAttributes, setGloboAttributes] = useState<Array<{ key: string; value: string }>>([]);
  const handleGloboChange = useCallback((attrs: Array<{ key: string; value: string }>) => setGloboAttributes(attrs), []);

  // Live Globo option sets — start with whatever the server scraped.
  // If the server returned nothing (headless store with no theme HTML to scrape),
  // fetch client-side via our API route once the component mounts.
  const [liveGloboSets, setLiveGloboSets] = useState<GloboOptionSet[]>(globoOptionSets);
  const [globoLoading, setGloboLoading] = useState(false);

  const variants = product.variants.nodes;
  const images = product.images.nodes;
  const mediaNodes = product.media?.nodes ?? [];
  const origin = getOriginFromTags(product.tags);
  const isFrozen = product.tags?.some((t: string) => t.toLowerCase() === "frozen") ?? false;
  const addToRecentlyViewed = useRecentlyViewed((s) => s.add);

  const [selectedVariantId, setSelectedVariantId] = useState(
    variants.find((v: any) => v.availableForSale)?.id ?? variants[0]?.id ?? "",
  );
  const [activeMediaIdx, setActiveMediaIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [specialRequest, setSpecialRequest] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [stickyVisible, setStickyVisible] = useState(false);
  const [stickyExpanded, setStickyExpanded] = useState(false);
  const [pickupDrawerOpen, setPickupDrawerOpen] = useState(false);
  const thumbTrackRef = useRef<HTMLDivElement>(null);
  const [thumbCanLeft,  setThumbCanLeft]  = useState(false);
  const [thumbCanRight, setThumbCanRight] = useState(false);
  const THUMB_SCROLL = 88; // scroll 1 thumb+gap per arrow click
  const atcSentinelRef = useRef<HTMLDivElement>(null);

  // Hide the Richpanel chat launcher while the sticky ATC bar is visible so it can't overlap
  // the bar. We add a class (`.mls-rp-hidden { display:none !important }`) to every Richpanel
  // element — non-destructive (doesn't touch the widget's own inline styles, and removing the
  // class reverts cleanly), and a MutationObserver re-applies it if the widget injects/
  // re-renders. An open (full-screen) chat is left visible.
  useEffect(() => {
    document.body.classList.toggle("pdp-page", stickyVisible);

    // Richpanel uses two id/class families: `richpanel*` and `rp-*` (e.g. rp-customer-widget).
    const sel =
      '[id*="richpanel"],[class*="richpanel"],[id^="rp-"],[id^="rp_"],[class*="rp-customer-widget"],[class*="rp-micro-app"],[class*="rp-messenger"]';
    const apply = () => {
      const chatOpen = document.documentElement.classList.contains("rp-messenger-active-html-full");
      const hide = stickyVisible && !chatOpen;
      document.querySelectorAll(sel).forEach((el) => el.classList.toggle("mls-rp-hidden", hide));
    };
    apply();

    let raf = 0;
    const obs = new MutationObserver(() => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => { raf = 0; apply(); });
    });
    if (stickyVisible) obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      obs.disconnect();
      if (raf) window.cancelAnimationFrame(raf);
      document.body.classList.remove("pdp-page");
      document.querySelectorAll(".mls-rp-hidden").forEach((el) => el.classList.remove("mls-rp-hidden"));
    };
  }, [stickyVisible]);

  // Push Richpanel behind sticky expanded panel — toggle atc-expanded on body
  useEffect(() => {
    if (stickyExpanded) {
      document.body.classList.add("atc-expanded");
    } else {
      document.body.classList.remove("atc-expanded");
    }
    return () => { document.body.classList.remove("atc-expanded"); };
  }, [stickyExpanded]);

  // Track this product as recently viewed
  useEffect(() => { addToRecentlyViewed(product.handle); }, [product.handle, addToRecentlyViewed]);

  // Client-side Globo fetch — runs when server scraping returned nothing.
  // This is the reliable path for headless stores where the Shopify theme
  // doesn't embed Globo's window.GPOConfigs script.
  useEffect(() => {
    if (!externalId || liveGloboSets.length > 0) return;
    setGloboLoading(true);
    fetch(`/api/globo-options/${externalId}`)
      .then((r) => r.ok ? r.json() : { optionSets: [] })
      .then((data: any) => {
        const raw: GloboOptionSet[] = data?.optionSets ?? [];
        // Deduplicate by ID before storing
        const seen = new Set<string>();
        const sets = raw.filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
        if (sets.length > 0) setLiveGloboSets(sets);
      })
      .catch(() => { /* ignore */ })
      .finally(() => setGloboLoading(false));
  }, [externalId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sticky bar visibility — appears when main ATC scrolls out of view
  useEffect(() => {
    const el = atcSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setStickyVisible(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const metaRating = parseRatingMetafields((product as any).metafields);
  const displayRating = rating.average > 0 ? rating : metaRating;
  const displayCount = reviewsTotalCount > 0 ? reviewsTotalCount : metaRating.count;

  const sellingPlanGroups = parseSellingPlanGroups(sellingPlanGroupsRaw, discountMap);
  const addItem = useCartStore((s) => s.addItem);
  const [isAdding, setIsAdding] = useState(false);

  const variant = variants.find((v: any) => v.id === selectedVariantId) ?? variants[0];
  const currency = variant?.price.currencyCode ?? "OMR";

  const selectedAllocation = selectedPlanId
    ? (variant as any)?.sellingPlanAllocations?.nodes?.find((a: any) => a.sellingPlan?.id === selectedPlanId)
    : null;
  const displayPrice = selectedAllocation?.priceAdjustments?.[0]?.price ?? variant?.price;
  const displayCompareAt = selectedAllocation
    ? selectedAllocation.priceAdjustments?.[0]?.compareAtPrice ?? variant?.compareAtPrice
    : variant?.compareAtPrice;

  useEffect(() => {
    if (!variant?.image?.url) return;
    const idx = images.findIndex((img: any) => img.url === variant.image!.url);
    if (idx !== -1) setActiveMediaIdx(idx);
  }, [selectedVariantId]); // eslint-disable-line

  // Persist the selected variant in the URL (?variant=) so a refresh restores the choice.
  // Uses history.replaceState (not the router) so it never re-runs the loader or resets state.
  const firstVariantWrite = useRef(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("variant");
    if (!param) return;
    const match = variants.find((v: any) => String(v.id).split("/").pop() === param || v.id === param);
    if (match) setSelectedVariantId(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !selectedVariantId) return;
    if (firstVariantWrite.current) { firstVariantWrite.current = false; return; }
    const num = String(selectedVariantId).split("/").pop() ?? "";
    const url = new URL(window.location.href);
    if (url.searchParams.get("variant") === num) return;
    url.searchParams.set("variant", num);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, [selectedVariantId]);

  // GTM dataLayer — view_item (once per product page)
  useEffect(() => {
    pushDataLayer("view_item", {
      ecommerce: {
        currency,
        value: parseFloat(displayPrice?.amount ?? "0") || 0,
        items: [gaItem({ id: product.handle, name: product.title, price: displayPrice?.amount, variant: variant?.title })],
      },
    });
  }, [product.handle]); // eslint-disable-line

  const allMedia = buildMediaItems(images, mediaNodes);
  const activeMedia = allMedia[activeMediaIdx];

  // Update left/right arrow visibility whenever media list size or scroll position changes
  useEffect(() => {
    const el = thumbTrackRef.current;
    if (!el) return;
    const update = () => {
      setThumbCanLeft(el.scrollLeft > 1);
      setThumbCanRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [allMedia.length]); // eslint-disable-line

  // Scroll active thumbnail into view when selection changes
  useEffect(() => {
    const el = thumbTrackRef.current;
    if (!el) return;
    const thumb = el.children[activeMediaIdx] as HTMLElement | undefined;
    if (!thumb) return;
    const { offsetLeft, offsetWidth } = thumb;
    if (offsetLeft < el.scrollLeft) {
      el.scrollTo({ left: offsetLeft, behavior: 'smooth' });
    } else if (offsetLeft + offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: offsetLeft + offsetWidth - el.clientWidth, behavior: 'smooth' });
    }
  }, [activeMediaIdx]);

  const hasOptions =
    product.options.length > 1 ||
    product.options.some((o: any) => o.values.length > 1 && o.values[0] !== "Default Title");

  const shopifyProduct: ShopifyProduct = {
    node: {
      id: product.id, title: product.title, handle: product.handle,
      description: "", descriptionHtml: product.descriptionHtml ?? "",
      tags: product.tags, vendor: product.vendor ?? "", productType: "",
      availableForSale: variants.some((v: any) => v.availableForSale),
      priceRange: product.priceRange,
      images: { edges: images.map((img: any) => ({ node: img })) },
      variants: { edges: variants.map((v: any) => ({ node: { id: v.id, title: v.title, availableForSale: v.availableForSale, quantityAvailable: v.quantityAvailable ?? null, price: v.price, compareAtPrice: v.compareAtPrice ?? null, selectedOptions: v.selectedOptions } })) },
      options: product.options,
    },
  };

  const handleAddToCart = () => {
    if (!variant || isAdding) return;
    const selectedPlan = selectedPlanId
      ? sellingPlanGroups.flatMap((g) => g.plans).find((p) => p.id === selectedPlanId)
      : null;
    const attributes: Array<{ key: string; value: string }> = [
      ...globoAttributes,
      ...(specialRequest.trim() ? [{ key: "Special Request", value: specialRequest.trim() }] : []),
    ];
    setIsAdding(true);
    // Fire-and-forget — drawer opens immediately, no need to await
    void addItem({
      product: shopifyProduct, variantId: variant.id, variantTitle: variant.title,
      price: displayPrice, quantity: qty, selectedOptions: variant.selectedOptions,
      sellingPlanId: selectedPlanId ?? undefined,
      sellingPlanName: selectedPlan?.name ?? null,
      attributes: attributes.length ? attributes : undefined,
    });
    setTimeout(() => setIsAdding(false), 350);
  };

  // Extra-sections accordion label — determined entirely by template, not by
  // which metafields have values (avoids false-positive when "understanding_rubs"
  // key name contains "rub" but the product is actually a whole-cut).
  const extraSectionTitle =
    templateSuffix === "whole-cuts"     ? "Understanding Rubs"  :
    templateSuffix === "box-collections"? "About This Box"  :
    "Understanding Rubs"; // all rubs templates

  // JSON-LD structured data
  const jsonLd: Record<string, any> = {
    "@context": "https://schema.org", "@type": "Product",
    name: product.title,
    image: images[0]?.url ?? "",
    brand: { "@type": "Brand", name: product.vendor ?? "MLS Oman" },
    offers: {
      "@type": "Offer",
      price: displayPrice?.amount ?? "0",
      priceCurrency: currency,
      availability: variants.some((v: any) => v.availableForSale) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
  if (displayRating.average > 0 && displayCount > 0) {
    jsonLd.aggregateRating = { "@type": "AggregateRating", ratingValue: displayRating.average.toFixed(1), reviewCount: displayCount };
  }

  return (
    <div className="bg-background min-h-screen pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Breadcrumb */}
      {(() => {
        const category = (product.collections?.nodes ?? []).find(
          (c: any) => c.handle && c.handle !== "all" && c.handle !== "frontpage"
        );
        return (
          <div className="container mx-auto px-4 py-3">
            <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Link to={lp("/")} className="transition-colors hover:text-foreground">{t("common.home")}</Link>
              <span>/</span>
              {category ? (
                <Link to={lp(`/collections/${category.handle}`)} className="transition-colors hover:text-foreground">
                  {category.title}
                </Link>
              ) : (
                <Link to={lp("/collections/all")} className="transition-colors hover:text-foreground">
                  {product.vendor || "Products"}
                </Link>
              )}
              <span>/</span>
              <span className="max-w-[220px] truncate font-medium text-foreground">{product.title}</span>
            </nav>
          </div>
        );
      })()}

      {/* Issue 3: pb-24 on mobile so last content clears the sticky ATC bar */}
      <div className="container mx-auto grid gap-6 px-4 pb-4 md:grid-cols-2 md:items-start md:gap-10">
        {/* ── Media gallery ── */}
        <div className="flex min-w-0 flex-col gap-3 md:sticky md:top-36 md:self-start">

          {/* Unified layout: left vertical thumb rail + main image to the right.
              Mobile: 56px rail, 50vh max-height main image.
              Desktop: 80px rail, full aspect-square main image. */}
          <div className="flex flex-row gap-2 md:gap-3">

            {/* Vertical thumbnail rail with up/down nav arrows */}
            {allMedia.length > 1 && (
              <div className="flex w-12 flex-col items-center gap-1 md:w-16">
                {/* Up arrow — only when not at first thumb */}
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={() => setActiveMediaIdx((i) => Math.max(0, i - 1))}
                  className={`flex h-5 w-full items-center justify-center rounded text-muted-foreground transition-opacity hover:text-foreground ${activeMediaIdx === 0 ? "pointer-events-none opacity-0" : "opacity-70"}`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>

                <div className="relative min-h-0 w-full flex-1">
                  <div className="no-scrollbar absolute inset-0 flex flex-col items-center gap-1.5 overflow-y-auto">
                  {allMedia.map((media, i) => {
                    const thumb = media.type === "image" ? shopifyImageUrl(media.url, 200) : media.type === "video" ? (media.poster ?? "") : (media as any).poster ?? "";
                    const isActive = i === activeMediaIdx;
                    return (
                      <button key={i} type="button" onClick={() => setActiveMediaIdx(i)}
                        className={`relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all duration-200 md:h-16 md:w-16 ${
                          isActive
                            ? "border-crimson shadow-[inset_0_0_0_1px_rgba(180,0,0,0.25)]"
                            : "border-transparent opacity-60 hover:opacity-100 hover:border-border/60"
                        }`}>
                        {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" />}
                        {(media.type === "video" || media.type === "external_video") && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="h-4 w-4 fill-white text-white" />
                          </div>
                        )}
                        {isActive && <span className="absolute bottom-1 left-1/2 h-[3px] w-4 -translate-x-1/2 rounded-full bg-crimson" />}
                      </button>
                    );
                  })}
                  </div>
                </div>

                {/* Down arrow — only when not at last thumb */}
                <button
                  type="button"
                  aria-label="Next image"
                  onClick={() => setActiveMediaIdx((i) => Math.min(allMedia.length - 1, i + 1))}
                  className={`flex h-5 w-full items-center justify-center rounded text-muted-foreground transition-opacity hover:text-foreground ${activeMediaIdx === allMedia.length - 1 ? "pointer-events-none opacity-0" : "opacity-70"}`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Main image — square; image fills via object-cover (no letterbox bands) */}
            <div className="relative aspect-square min-w-0 flex-1 self-start overflow-hidden rounded-xl bg-muted">
              {activeMedia?.type === "video" && activeMedia.mp4Url ? (
                <video src={activeMedia.mp4Url} poster={activeMedia.poster ?? undefined}
                  controls autoPlay muted loop playsInline className="h-full w-full object-cover" />
              ) : activeMedia?.type === "external_video" ? (
                <iframe src={activeMedia.embedUrl} className="h-full w-full"
                  allow="autoplay; encrypted-media" allowFullScreen title="Product video" />
              ) : activeMedia?.type === "image" ? (
                <img src={shopifyImageUrl(activeMedia.url, 800)} alt={activeMedia.altText ?? product.title}
                  className="h-full w-full object-cover transition-opacity duration-300" key={activeMediaIdx} />
              ) : null}
              <div className="absolute left-3 top-3 flex flex-col gap-1.5">
                <OriginBadge origin={origin} />
                {variant?.compareAtPrice && (
                  <span className="inline-flex rounded-sm bg-crimson px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-crimson-foreground">{t("product.sale")}</span>
                )}
                {isFrozen && (
                  <span className="inline-flex rounded-sm bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Frozen</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Product info ── */}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <div>
            <h1 className="font-display text-xl font-bold leading-snug tracking-tight sm:text-2xl">{product.title}</h1>
            {displayRating.average > 0 && (
              <button type="button" onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" })}
                className="mt-2 flex items-center gap-2 transition-opacity hover:opacity-80">
                <StarRating rating={displayRating.average} size="sm" />
                <span className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  {displayRating.average.toFixed(1)} · {displayCount} {displayCount === 1 ? t("product.review_singular") : t("product.review_plural")}
                </span>
              </button>
            )}
          </div>

          {/* Price */}
          <div className="-mt-2.5 flex flex-col gap-1 sm:-mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-bold text-crimson sm:text-3xl">{formatPrice(displayPrice?.amount ?? "0", currency)}</span>
              {displayCompareAt && <span className="text-sm text-muted-foreground line-through sm:text-base">{formatPrice(displayCompareAt.amount, currency)}</span>}
              <StockBadge available={variant?.availableForSale ?? false} qty={variant?.quantityAvailable ?? null} />
            </div>

            {/* Price per kg — updates on every variant change */}
            {(() => {
              const pricePerKgLine = (label: string) => (
                <p className="text-xs text-muted-foreground sm:text-sm">
                  <span className="font-medium text-foreground">{t("product.price_per_kg")}</span>{" "}
                  {label}
                </p>
              );

              // 1. Shopify built-in unit price
              const unitPrice = (variant as any)?.unitPrice;
              const unitMeasure = (variant as any)?.unitPriceMeasurement;
              if (unitPrice?.amount && parseFloat(unitPrice.amount) > 0) {
                const unit = unitMeasure?.referenceUnit ?? "kg";
                return pricePerKgLine(`${formatPrice(unitPrice.amount, unitPrice.currencyCode)} / ${unit}`);
              }

              // 2. Custom metafield price_per_kg or per_kg_price on the variant
              // Value may be a plain number ("96") or pre-formatted ("AED 96")
              const metaPerKg =
                (variant as any)?.metafields?.find((m: any) => m?.key === "price_per_kg")?.value ??
                (variant as any)?.metafields?.find((m: any) => m?.key === "per_kg_price")?.value;
              if (metaPerKg?.trim()) {
                const numVal = parseFloat(metaPerKg);
                if (!isNaN(numVal) && numVal > 0) {
                  return pricePerKgLine(formatPrice(numVal.toString(), currency));
                }
                // Already formatted string e.g. "AED 96"
                return pricePerKgLine(metaPerKg.trim());
              }

              // 3. Parse weight from variant title and calculate (e.g. "6kg", "500g", "2.5 kg")
              if (variant?.title && displayPrice?.amount) {
                const kgMatch = variant.title.match(/(\d+(?:\.\d+)?)\s*kg/i);
                const gMatch  = variant.title.match(/(\d+(?:\.\d+)?)\s*g(?!$|\w)/i);
                let kgValue: number | null = null;
                if (kgMatch)  kgValue = parseFloat(kgMatch[1]);
                else if (gMatch) kgValue = parseFloat(gMatch[1]) / 1000;
                if (kgValue && kgValue > 0) {
                  const ppkg = parseFloat(displayPrice.amount) / kgValue;
                  if (ppkg > 0) return pricePerKgLine(formatPrice(ppkg.toFixed(2), currency));
                }
              }

              return null;
            })()}

          </div>

          {/* Variants */}
          {hasOptions && (
            <div className="flex flex-col gap-3">
              {product.options.map((option: any) => {
                if (option.values.length === 1 && option.values[0] === "Default Title") return null;
                // The exact variant a value would select, given the CURRENT choice of the other options.
                const baseSel: Record<string, string> = Object.fromEntries(
                  (variant?.selectedOptions ?? []).map((o: any) => [o.name, o.value])
                );
                const exactFor = (value: any) => {
                  const desired: Record<string, string> = { ...baseSel, [option.name]: value };
                  return variants.find((v: any) => v.selectedOptions.every((o: any) => desired[o.name] === o.value));
                };
                // Hide values out of stock for the current selection; keep them all (disabled) if
                // none are available, so the option never renders empty.
                const availableValues = option.values.filter((val: any) => exactFor(val)?.availableForSale);
                const hideUnavailable = availableValues.length > 0;
                return (
                  <div key={option.name}>
                    <p className="mb-1.5 text-xs font-semibold sm:mb-2 sm:text-sm">{option.name}</p>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {option.values.map((value: any) => {
                        if (hideUnavailable && !availableValues.includes(value)) return null;
                        const mv =
                          exactFor(value) ??
                          variants.find((v: any) =>
                            v.selectedOptions.some((o: any) => o.name === option.name && o.value === value)
                          );
                        const active = variant?.selectedOptions.some((o: any) => o.name === option.name && o.value === value);
                        return (
                          <button key={value} type="button" onClick={() => mv && setSelectedVariantId(mv.id)} disabled={!mv?.availableForSale}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 sm:text-sm ${active ? "border-crimson bg-crimson text-crimson-foreground" : "border-border bg-card hover:border-crimson"} disabled:opacity-40`}>
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Globo custom options — loaded from server scrape or client-side fetch */}
          {globoLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("product.loading_options")}
            </div>
          )}
          {liveGloboSets.length > 0 && (
            <div className="border-t border-border pt-4">
              <GloboProductOptions optionSets={liveGloboSets} onChange={handleGloboChange} />
            </div>
          )}

          {/* Subscription */}
          {sellingPlanGroups.length > 0 && (
            <SubscriptionSelector groups={sellingPlanGroups} selectedPlanId={selectedPlanId} onSelect={setSelectedPlanId}
              regularPrice={variant?.price.amount ?? "0"} currency={currency} />
          )}

          {/* Special Request — all templates except whole cuts */}
          {templateSuffix !== "whole-cuts" && templateSuffix !== "abu-dhabi-10kg-aus" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="special-request" className="text-sm font-semibold text-foreground">
                {t("product.special_request")}
              </label>
              <textarea
                id="special-request"
                rows={2}
                value={specialRequest}
                onChange={(e) => setSpecialRequest(e.target.value)}
                placeholder={t("product.special_request_ph")}
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/20"
              />
            </div>
          )}

          {/* ATC sentinel — IntersectionObserver watches this */}
          <div ref={atcSentinelRef} aria-hidden />

          {/* Quantity + ATC / Back in stock */}
          {variant?.availableForSale ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-lg border border-border">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-10 w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"><Minus className="h-4 w-4" /></button>
                <span className="w-8 text-center text-sm font-semibold">{qty}</span>
                <button type="button" onClick={() => setQty((q) => q + 1)} className="grid h-10 w-10 place-items-center text-muted-foreground transition-colors hover:text-foreground"><Plus className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={handleAddToCart} disabled={isAdding}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-crimson px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-crimson-foreground transition-colors hover:bg-rich-red disabled:opacity-50 sm:px-6 sm:py-3 sm:text-sm">
                {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : t("product.add_to_cart")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <button type="button" disabled className="w-full rounded-lg bg-muted py-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("product.out_of_stock")}</button>
              <BackInStock productHandle={product.handle} variantId={variant?.id ?? ""} />
            </div>
          )}

          {/* Trust badge image — set badge_image in product_page_settings metaobject to show */}
          {pageSettings?.badgeImage && (
            <img
              src={pageSettings.badgeImage}
              alt="Trust badges"
              className="mx-auto w-4/5 h-auto object-contain"
              loading="lazy"
            />
          )}

          {/* Pickup availability — shown below ATC */}
          {(() => {
            const allStores: StoreNode[] = (variant as any)?.storeAvailability?.nodes ?? [];
            const firstAvailable = allStores.find((s) => s.available);
            if (!firstAvailable) return null;
            return (
              <div className="rounded-lg border border-green-200 bg-green-50/50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-green-500" />
                  <p className="text-sm font-semibold text-green-800">
                    {t("product.pickup_at")} {firstAvailable.location.name}
                  </p>
                </div>
                <p className="mt-0.5 ps-4 text-xs text-green-700">
                  {firstAvailable.pickUpTime ?? t("product.usually_ready")}
                </p>
                <button
                  type="button"
                  onClick={() => setPickupDrawerOpen(true)}
                  className="mt-1.5 ps-4 text-xs font-semibold text-crimson underline-offset-2 hover:underline"
                >
                  {t("product.check_other_stores")}
                </button>
              </div>
            );
          })()}

          {/* Icon badges — driven by "icon_with_text" metaobject, falls back to hardcoded if empty */}
          {(() => {
            const ICON_FILTER = "invert(15%) sepia(80%) saturate(400%) hue-rotate(340deg)";
            const FALLBACK_ICONS = [Truck, ShieldCheck, RefreshCw, Leaf];
            const parsed = iconBadges
              .map((node: any, i: number) => {
                const fm = Object.fromEntries((node.fields ?? []).map((f: any) => [f.key, f]));
                let heading = fm["heading"]?.value ?? null;
                const iconUrl = fm["icon"]?.reference?.image?.url ?? null;
                if (!heading) return null;
                // Override delivery badge regardless of what CMS says
                if (/deliver|1.hour|slot/i.test(heading)) {
                  heading = t("product.trust_delivery");
                }
                return { id: node.id ?? String(i), heading, iconUrl, FallbackIcon: FALLBACK_ICONS[i % FALLBACK_ICONS.length] };
              })
              .filter(Boolean) as Array<{ id: string; heading: string; iconUrl: string | null; FallbackIcon: any }>;

            const cols = parsed.length > 0 ? parsed.length : 3;
            const items = parsed.length > 0 ? parsed : [
              { id: "d", heading: t("product.trust_delivery"), iconUrl: null, FallbackIcon: Truck },
              { id: "h", heading: t("product.trust_halal"),    iconUrl: null, FallbackIcon: ShieldCheck },
              { id: "q", heading: t("product.trust_quality"),  iconUrl: null, FallbackIcon: RefreshCw },
            ];

            return (
              <div
                className="gap-2 rounded-xl border border-border p-3 sm:gap-3 sm:p-4"
                style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              >
                {items.map(({ id, heading, iconUrl, FallbackIcon }) => (
                  <div key={id} className="flex flex-col items-center gap-1 text-center">
                    {iconUrl ? (
                      <img src={iconUrl} alt={heading} className="h-5 w-5 object-contain sm:h-6 sm:w-6" style={{ filter: ICON_FILTER }} />
                    ) : (
                      <FallbackIcon className="h-5 w-5 text-crimson sm:h-6 sm:w-6" />
                    )}
                    <span className="text-[10px] font-medium leading-snug text-muted-foreground sm:text-xs">{heading}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Description + Free Returns + Customer Support */}
          <div className="border-t border-border">
            <AccordionItem title={t("product.description")} defaultOpen>
              {product.descriptionHtml
                ? <DescriptionWithToggle html={product.descriptionHtml} />
                : <p>{t("product.no_desc")}</p>}
            </AccordionItem>
            <AccordionItem title={pageSettings?.freeReturnsTitle ?? t("product.free_returns_title")}>
              <div className="divide-y divide-border/50">
                {(pageSettings?.freeReturns ?? [
                  "Drop a WhatsApp message or send us an email within 24 hours after delivery.",
                  "We will exchange the product and deliver it again to your door, or you can pick it up if you want.",
                  "You will receive the product or a refund. Refunds will be processed within 14 working days.",
                ]).map((line, i) => (
                  <p key={i} className="py-2 text-xs leading-relaxed text-muted-foreground sm:py-2.5 sm:text-[13px]">
                    {line}
                  </p>
                ))}
              </div>
            </AccordionItem>
            <AccordionItem title={pageSettings?.supportTitle ?? t("product.support_title")}>
              <ul className="space-y-1.5 text-xs text-muted-foreground sm:space-y-2 sm:text-sm">
                {(pageSettings?.supportContent
                  ? pageSettings.supportContent.split("\n").filter(Boolean)
                  : ["Call or WhatsApp: +96892423242", "Support available 9 AM – 9 PM daily.", "Email: contactus@mls.om", "Hassle-free returns within 24 hours of delivery."]
                ).map((line, i) => (
                  <li key={i}><LinkifyLine text={line} /></li>
                ))}
              </ul>
            </AccordionItem>
          </div>

        </div>
      </div>

      {/* ── Info tabs: Understanding Rubs / Nutrition / Delivery & Support ── */}
      <InfoTabs
        extraSections={
          accordionSections.length > 0
            ? <>{accordionSections.map(s => <AccordionItem key={s.value} title={s.label}>{s.content}</AccordionItem>)}{extraSections}</>
            : extraSections
        }
        extraSectionTitle={extraSectionTitle}
        pageSettings={pageSettings}
        variant={variant}
        product={product}
      />

      {/* ── Sticky Add to Cart bar ── */}
      <div className={`fixed bottom-0 left-0 right-0 z-30 overflow-hidden border-t border-border bg-background shadow-[0_-4px_20px_rgba(0,0,0,0.08)] transition-transform duration-300 ${stickyVisible ? "translate-y-0" : "translate-y-full"}`}>

        {/* ── Expandable panel: variants + subscription ── */}
        <div className={`transition-all duration-300 ease-in-out ${stickyExpanded ? "max-h-[65vh] overflow-y-auto" : "max-h-0 overflow-hidden"}`}>
          <div className="container mx-auto space-y-4 px-4 pb-4 pt-5" style={{ maxHeight: "65vh" }}>

            {/* Variant options */}
            {hasOptions && (
              <div className="space-y-3">
                {product.options.map((option: any) => {
                  if (option.values.length === 1 && option.values[0] === "Default Title") return null;
                  // The exact variant a value would select, given the CURRENT choice of the other options.
                  const baseSel: Record<string, string> = Object.fromEntries(
                    (variant?.selectedOptions ?? []).map((o: any) => [o.name, o.value])
                  );
                  const exactFor = (value: any) => {
                    const desired: Record<string, string> = { ...baseSel, [option.name]: value };
                    return variants.find((v: any) => v.selectedOptions.every((o: any) => desired[o.name] === o.value));
                  };
                  // Hide values out of stock for the current selection; keep them all (disabled) if
                  // none are available, so the option never renders empty.
                  const availableValues = option.values.filter((val: any) => exactFor(val)?.availableForSale);
                  const hideUnavailable = availableValues.length > 0;
                  return (
                    <div key={option.name}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{option.name}</p>
                      <div className="flex flex-wrap gap-2">
                        {option.values.map((value: any) => {
                          if (hideUnavailable && !availableValues.includes(value)) return null;
                          const mv =
                            exactFor(value) ??
                            variants.find((v: any) =>
                              v.selectedOptions.some((o: any) => o.name === option.name && o.value === value)
                            );
                          const active = variant?.selectedOptions.some((o: any) => o.name === option.name && o.value === value);
                          return (
                            <button key={value} type="button"
                              onClick={() => { mv && setSelectedVariantId(mv.id); }}
                              disabled={!mv?.availableForSale}
                              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${active ? "border-crimson bg-crimson text-crimson-foreground" : "border-border bg-card hover:border-crimson"} disabled:opacity-40`}>
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Subscription selector */}
            {sellingPlanGroups.length > 0 && (
              <SubscriptionSelector
                groups={sellingPlanGroups}
                selectedPlanId={selectedPlanId}
                onSelect={setSelectedPlanId}
                regularPrice={variant?.price.amount ?? "0"}
                currency={currency}
              />
            )}

            {/* Special request in sticky bar — same state as main form */}
            {templateSuffix !== "whole-cuts" && templateSuffix !== "abu-dhabi-10kg-aus" && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">{t("product.special_request")}</label>
                <textarea
                  rows={2}
                  value={specialRequest}
                  onChange={(e) => setSpecialRequest(e.target.value)}
                  placeholder={t("product.special_request_ph")}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-crimson focus:outline-none focus:ring-2 focus:ring-crimson/20"
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Main ATC row ── */}
        <div className="flex w-full items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold leading-tight">{product.title}</p>
            {variant?.title && variant.title !== "Default Title" && (
              <p className="truncate text-[10px] text-muted-foreground leading-tight">{variant.title}</p>
            )}
            <p className="text-sm font-bold text-crimson leading-tight">{formatPrice(displayPrice?.amount ?? "0", currency)}</p>
          </div>

          {/* Expand toggle */}
          {(hasOptions || sellingPlanGroups.length > 0) && (
            <button
              type="button"
              onClick={() => setStickyExpanded((e) => !e)}
              className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-crimson/60 bg-crimson/5 px-2 py-1.5 text-[11px] font-semibold text-crimson transition-colors hover:bg-crimson/10 sm:px-2.5 sm:py-2 sm:text-xs"
            >
              {stickyExpanded ? <ChevronDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <ChevronUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
              <span>{stickyExpanded ? t("common.close") : t("product.options")}</span>
            </button>
          )}

          {variant?.availableForSale ? (
            <div className="flex flex-shrink-0 items-center gap-1.5">
              {/* Qty — hidden on very small screens, always visible on sm+ */}
              <div className="hidden items-center rounded-lg border border-border sm:flex">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-9 w-8 place-items-center text-muted-foreground hover:text-foreground"><Minus className="h-3 w-3" /></button>
                <span className="w-5 text-center text-xs font-semibold">{qty}</span>
                <button type="button" onClick={() => setQty((q) => q + 1)} className="grid h-9 w-8 place-items-center text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /></button>
              </div>
              <button type="button" onClick={handleAddToCart} disabled={isAdding}
                className="flex-shrink-0 rounded-lg bg-crimson px-2.5 py-2 text-[11px] font-bold uppercase tracking-normal text-crimson-foreground transition-colors hover:bg-rich-red disabled:opacity-50 sm:px-3 sm:py-2.5 sm:text-xs sm:tracking-wide">
                {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("product.add_to_cart")}
              </button>
            </div>
          ) : (
            <span className="flex-shrink-0 rounded-lg bg-muted px-2.5 py-2 text-[11px] font-bold uppercase text-muted-foreground sm:px-3 sm:py-2.5 sm:text-xs">{t("product.out_of_stock")}</span>
          )}
        </div>
      </div>

      {/* Recommended products */}
      {recommendations.length > 0 && (
        <div className="container mx-auto px-4 pt-8 pb-4">
          <div className="mb-3 md:mb-5">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-crimson md:mb-1 md:text-[11px]">{t("product.you_might_like")}</p>
            <h2 className="font-display text-base font-bold leading-snug tracking-tight md:text-xl">{t("product.recommended")}</h2>
          </div>
          <HScroller>
            {recommendations.map((p) => (
              <div key={p.node.id} className="w-[44%] flex-shrink-0 snap-start sm:w-[32%] lg:w-[23%] xl:w-[19%]">
                <ProductCard product={p} />
              </div>
            ))}
          </HScroller>
        </div>
      )}

      {/* Recently viewed */}
      <RecentlyViewed excludeHandle={product.handle} />

      {/* Reviews — Judge.me CDN widget (shows all reviews including historical ones) */}
      <div id="reviews" className="container mx-auto px-4 pb-6">
        {externalId ? (
          <JudgemeWidgetEmbed
            externalId={externalId}
            shopDomain="muscat-livestock.myshopify.com"
          />
        ) : (
          <JudgemeReviews reviews={reviews} rating={rating} totalCount={reviewsTotalCount} handle={product.handle} externalId={undefined} />
        )}
      </div>

      {/* Store pickup drawer */}
      <PickupDrawer
        open={pickupDrawerOpen}
        onClose={() => setPickupDrawerOpen(false)}
        productTitle={product.title}
        variantTitle={variant?.title ?? ""}
        stores={(variant as any)?.storeAvailability?.nodes ?? []}
      />
    </div>
  );
}

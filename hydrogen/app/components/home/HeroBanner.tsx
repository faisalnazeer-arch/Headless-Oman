import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shopifyImageUrl } from "@/lib/shopify";

// ── Types ──────────────────────────────────────────────────────────────────

interface ShopifyImage {
  url: string;
  altText: string | null;
  width?: number;
  height?: number;
}

interface HeroSlide {
  id: string;
  desktopImage: ShopifyImage | null;
  mobileImage: ShopifyImage | null;
  tabletImage: ShopifyImage | null;
  content: string | null;
  buttonText: string | null;
  buttonUrl: string | null;
  sortOrder: number;
}

interface RawMetaobjectNode {
  id: string;
  fields: Array<{
    key: string;
    value: string | null;
    type: string;
    reference?: { image?: ShopifyImage } | null;
  }>;
}

// ── Parser ─────────────────────────────────────────────────────────────────

function parseSlides(nodes: RawMetaobjectNode[]): HeroSlide[] {
  return nodes
    .map((node, idx) => {
      const fieldMap = Object.fromEntries(node.fields.map((f) => [f.key, f]));

      const desktopImage = fieldMap["desktop_image"]?.reference?.image ?? null;
      const mobileImage  = fieldMap["mobile_image"]?.reference?.image  ?? null;
      const tabletImage  = fieldMap["tablet_image"]?.reference?.image  ?? null;

      if (!desktopImage && !mobileImage && !tabletImage) return null;

      let buttonUrl: string | null = null;
      const rawUrl = fieldMap["button_url"]?.value ?? null;
      if (rawUrl) {
        try {
          const parsed = JSON.parse(rawUrl);
          buttonUrl = parsed.url ?? rawUrl;
        } catch {
          buttonUrl = rawUrl;
        }
      }

      // Slide display order from the metaobject's "sort_order" field. Blank/invalid → shown last,
      // preserving the original (creation) order among those without a value.
      const rawOrder = fieldMap["sort_order"]?.value;
      const parsedOrder = rawOrder != null && rawOrder !== "" ? parseInt(rawOrder, 10) : NaN;

      return {
        id: node.id,
        desktopImage,
        mobileImage,
        tabletImage,
        content:    fieldMap["content"]?.value      ?? null,
        buttonText: fieldMap["button_text"]?.value  ?? null,
        buttonUrl,
        sortOrder: Number.isFinite(parsedOrder) ? parsedOrder : Number.MAX_SAFE_INTEGER,
        _idx: idx,
      };
    })
    .filter((s): s is HeroSlide & { _idx: number } => s !== null)
    // Lower sort_order first; ties (and blanks) keep their original order.
    .sort((a, b) => a.sortOrder - b.sortOrder || a._idx - b._idx)
    .map(({ _idx, ...slide }) => slide);
}

// ── Main component ─────────────────────────────────────────────────────────

interface HeroBannerProps {
  slides?: RawMetaobjectNode[];
}

const AUTOPLAY_MS = 5000;

export function HeroBanner({ slides: rawSlides = [] }: HeroBannerProps) {
  const parsed = parseSlides(rawSlides);
  if (parsed.length === 0) return null;
  const slides = parsed;
  const count = slides.length;
  const isSingle = count === 1;

  const [current, setCurrent] = useState(0);

  const goPrev = () => setCurrent((c) => (c - 1 + count) % count);
  const goNext = () => setCurrent((c) => (c + 1) % count);
  const goTo = (i: number) => setCurrent(i);

  // Stable ref so interval never re-creates
  const goNextRef = useRef(goNext);
  goNextRef.current = goNext;

  useEffect(() => {
    if (isSingle) return;
    const id = setInterval(() => goNextRef.current(), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [isSingle]);

  return (
    // dir="ltr" overrides the page-level dir="rtl" so the flex carousel always
    // stacks left-to-right and translateX(-N%) clips correctly.
    <section className="relative bg-charcoal" dir="ltr">
      <div className="overflow-hidden">
        <div
          className="flex"
          style={{
            transform: `translateX(-${current * 100}%)`,
            transition: "transform 500ms ease-in-out",
            willChange: "transform",
          }}
        >
          {slides.map((slide, i) => (
            <SlideItem key={slide.id} slide={slide} active={i === current} priority={i === 0} />
          ))}
        </div>
      </div>

      {/* ── Arrows ── */}
      {!isSingle && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white transition-all hover:bg-black/80 hover:scale-110 active:scale-95 sm:h-10 sm:w-10"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 grid h-9 w-9 cursor-pointer place-items-center rounded-full bg-black/60 text-white transition-all hover:bg-black/80 hover:scale-110 active:scale-95 sm:h-10 sm:w-10"
          >
            <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </>
      )}

      {/* ── Dot indicators ── */}
      {!isSingle && (
        <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
              className={cn(
                "cursor-pointer rounded-full transition-all duration-300 ease-out",
                i === current
                  ? "h-2.5 w-7 bg-white shadow-md"
                  : "h-2 w-2 bg-white/50 hover:bg-white/80",
              )}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Slide ──────────────────────────────────────────────────────────────────

function SlideItem({ slide, active, priority }: { slide: HeroSlide; active: boolean; priority?: boolean }) {
  const hasContent = slide.content || slide.buttonText;
  // Responsive hero: a single <picture> so only the viewport's image downloads (no mobile +
  // desktop double-fetch), and resized via the Shopify CDN so mobile gets a small image — the
  // hero is the LCP element, so this is the biggest mobile-speed win.
  // Desktop is the base/fallback: if mobile or tablet isn't set, desktop is used for them.
  const desk = slide.desktopImage ?? slide.mobileImage ?? slide.tabletImage;
  const tab  = slide.tabletImage  ?? desk;
  const mob  = slide.mobileImage  ?? desk;
  const primary = mob;
  const inner = (
    <div className="relative w-full" style={{ flexShrink: 0 }}>
      {primary && desk && (
        <picture>
          {/* Desktop ≥1024px, Tablet 768–1023px, Mobile <768px (the <img> fallback). Only the
              matching viewport's image downloads. Each falls back to the desktop image. */}
          <source
            media="(min-width: 1024px)"
            srcSet={shopifyImageUrl(desk.url, 1600)}
            width={desk.width}
            height={desk.height}
          />
          <source
            media="(min-width: 768px)"
            srcSet={shopifyImageUrl(tab.url, 1200)}
            width={tab.width}
            height={tab.height}
          />
          {/* width/height reserve the aspect-ratio box so the image can't shift content as it
              loads (CLS); `h-auto w-full` keeps it scaling responsively. */}
          <img
            src={shopifyImageUrl(primary.url, 828)}
            width={primary.width}
            height={primary.height}
            alt={primary.altText ?? ""}
            draggable={false}
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "low"}
            className="pointer-events-none block h-auto w-full select-none"
          />
        </picture>
      )}

      {/* Overlay */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          hasContent
            ? "bg-gradient-to-r from-charcoal/80 via-charcoal/40 to-transparent"
            : "bg-black/10",
        )}
      />

      {/* Content */}
      <div className="pointer-events-none absolute inset-0">
        {hasContent ? <DynamicContent slide={slide} active={active} /> : null}
      </div>
    </div>
  );

  if (slide.buttonUrl) {
    return (
      <Link
        to={slide.buttonUrl}
        className="block cursor-pointer"
        style={{ flexShrink: 0, width: "100%" }}
        draggable={false}
      >
        {inner}
      </Link>
    );
  }

  return inner;
}

// ── Dynamic metaobject content ─────────────────────────────────────────────
// Uses CSS keyframe animations instead of framer-motion to avoid SSR inline-style
// mismatches that cause React hydration errors.

function DynamicContent({ slide, active }: { slide: HeroSlide; active: boolean }) {
  const parts = slide.content?.split(/\s*—\s*/) ?? [];
  const eyebrow = parts.length > 1 ? parts[0] : null;
  const headline = parts.length > 1 ? parts.slice(1).join(" — ") : parts[0] ?? null;

  return (
    <div className="flex h-full items-center">
      <style dangerouslySetInnerHTML={{ __html: `@keyframes hero-in{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}@keyframes hero-out{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(28px)}}.hero-active{animation:hero-in 0.6s cubic-bezier(0.22,1,0.36,1) both}.hero-active .hero-eyebrow{animation:hero-in 0.5s ease-out 0.1s both}.hero-active .hero-headline{animation:hero-in 0.6s cubic-bezier(0.22,1,0.36,1) 0.15s both}.hero-active .hero-cta{animation:hero-in 0.5s ease-out 0.25s both}.hero-inactive{opacity:0;transform:translateY(28px)}` }} />
      <div className="container mx-auto px-4">
        <div className={cn("max-w-2xl", active ? "hero-active" : "hero-inactive")}>
          {eyebrow && (
            <span className="hero-eyebrow mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-off-white backdrop-blur-sm">
              <span className="h-1 w-1 rounded-full bg-crimson" />
              {eyebrow}
            </span>
          )}
          {headline && (
            <h1 className="hero-headline font-display text-2xl font-bold leading-[1.15] tracking-tight text-off-white drop-shadow-lg md:text-4xl lg:text-5xl">
              {headline}
            </h1>
          )}
          {slide.buttonText && slide.buttonUrl && (
            <div className="hero-cta pointer-events-auto mt-8">
              <Link to={slide.buttonUrl}>
                <Button
                  size="lg"
                  className="h-12 rounded-full bg-crimson px-8 text-base font-bold text-crimson-foreground shadow-lg transition-all duration-200 hover:bg-rich-red hover:scale-105 hover:shadow-xl"
                >
                  {slide.buttonText}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

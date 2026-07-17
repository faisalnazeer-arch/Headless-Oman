import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import { useLocalePath } from "@/stores/localeStore";
import { useT } from "@/i18n/strings";
import { Play, X, Volume2, VolumeX } from "lucide-react";
import { formatPrice, shopifyImageUrl, type ReelProduct } from "@/lib/shopify";
import { HScroller } from "./HScroller";


export function ReelsCarousel({ reels, label, heading }: { reels: ReelProduct[]; label?: string; heading?: string }) {
  const t = useT();
  const resolvedLabel = label ?? t("home.reels_sub");
  const resolvedHeading = heading ?? t("home.reels");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Start with original order (same on server + client) then shuffle after hydration
  const [shuffled, setShuffled] = useState<ReelProduct[]>(reels);

  useEffect(() => {
    const arr = [...reels];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setShuffled(arr);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (shuffled.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-3 md:py-6">
      <div className="mb-3 text-center md:mb-4">
        <div className="mb-1.5 flex items-center justify-center gap-3">
          <span className="h-px w-6 rounded-full bg-gradient-brand" />
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">{resolvedLabel}</p>
          <span className="h-px w-6 rounded-full bg-gradient-brand" />
        </div>
        <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">{resolvedHeading}</h2>
      </div>

      <HScroller>
        {shuffled.map((r, i) => (
          <ReelCard key={r.id} reel={r} onOpen={() => setActiveIndex(i)} />
        ))}
      </HScroller>

      {activeIndex !== null && (
        <ReelsPlayer
          reels={shuffled}
          startIndex={activeIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </section>
  );
}

function ReelCard({ reel: r, onOpen }: { reel: ReelProduct; onOpen: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
  };

  return (
    <button
      onClick={onOpen}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative aspect-[3/4] w-[76vw] flex-shrink-0 snap-start overflow-hidden rounded-xl bg-muted transition-transform hover:-translate-y-1 md:aspect-[9/16] md:w-[260px]"
    >
      {/* Poster image */}
      {r.poster && (
        <img
          src={shopifyImageUrl(r.poster, 400)}
          alt={r.title || "MLS reel"}
          loading="lazy"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${r.videoUrl ? "group-hover:opacity-0" : ""}`}
        />
      )}
      {/* Hover video */}
      {r.videoUrl && (
        <video
          ref={videoRef}
          src={r.videoUrl}
          muted
          playsInline
          loop
          preload="none"
          className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-charcoal/70 via-charcoal/10 to-transparent" />
      {r.handle && (
        <div className="absolute inset-x-2 top-2 text-left">
          <div className="line-clamp-2 text-[11px] font-semibold leading-tight text-off-white">{r.title}</div>
          <div className="mt-0.5 text-[10px] font-bold text-crimson-foreground">
            {formatPrice(r.price.amount, r.price.currencyCode)}
          </div>
        </div>
      )}
      <div className="absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-off-white/90 text-charcoal shadow-md transition-all duration-300 group-hover:scale-110 group-hover:opacity-0">
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        </span>
      </div>
    </button>
  );
}

// ── Full-screen TikTok-style player ──────────────────────────────────────────
function ReelsPlayer({
  reels,
  startIndex,
  onClose,
}: {
  reels: ReelProduct[];
  startIndex: number;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(reels[startIndex]?.id ?? null);

  // Jump to the opened reel, lock body scroll, ESC to close.
  useEffect(() => {
    const el = containerRef.current?.children[startIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: "auto" });
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black animate-[fadeIn_0.2s_ease]" onClick={onClose}>
      {/* Global controls */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-off-white/15 text-off-white backdrop-blur transition-colors hover:bg-off-white/25"
      >
        <X className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
        className="absolute right-4 top-16 z-20 grid h-10 w-10 place-items-center rounded-full bg-off-white/15 text-off-white backdrop-blur transition-colors hover:bg-off-white/25"
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {/* Vertical snap scroller — swipe up/down between reels (TikTok-style) */}
      <div
        ref={containerRef}
        className="h-full w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {reels.map((reel) => (
          <ReelSlide
            key={reel.id}
            reel={reel}
            muted={muted}
            active={activeId === reel.id}
            onActive={() => setActiveId(reel.id)}
            onClose={onClose}
          />
        ))}
      </div>
    </div>
  );
}

function ReelSlide({
  reel,
  muted,
  active,
  onActive,
  onClose,
}: {
  reel: ReelProduct;
  muted: boolean;
  active: boolean;
  onActive: () => void;
  onClose: () => void;
}) {
  const lp = useLocalePath();
  const t = useT();
  const slideRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Become active when this slide is the one in view.
  useEffect(() => {
    const el = slideRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && e.intersectionRatio >= 0.6) onActive(); },
      { threshold: [0.6] }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the active slide plays.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) { v.currentTime = 0; v.play().catch(() => {}); }
    else v.pause();
  }, [active]);

  const thumb = reel.productImage ?? reel.poster;

  return (
    <div ref={slideRef} className="relative flex h-full w-full snap-start snap-always items-center justify-center">
      <div
        className="relative h-full w-full overflow-hidden bg-black md:aspect-[9/16] md:w-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {reel.videoUrl ? (
          <video
            ref={videoRef}
            src={reel.videoUrl}
            poster={reel.poster ?? undefined}
            playsInline
            loop
            muted={muted}
            className="h-full w-full object-cover"
          />
        ) : reel.embedUrl ? (
          <iframe
            src={`${reel.embedUrl}?autoplay=${active ? 1 : 0}&mute=${muted ? 1 : 0}&controls=0&loop=1`}
            allow="autoplay; encrypted-media"
            className="h-full w-full"
          />
        ) : reel.poster ? (
          <img src={reel.poster} alt={reel.title || "MLS reel"} className="h-full w-full object-cover" />
        ) : null}

        {/* Bottom gradient for legibility */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/80 to-transparent" />

        {/* Product card — only when the reel is linked to a product */}
        {reel.handle && (
          <div className="absolute inset-x-3 bottom-4 flex items-center gap-3 rounded-2xl bg-white/95 p-2.5 shadow-xl backdrop-blur">
            {thumb && (
              <img
                src={shopifyImageUrl(thumb, 120)}
                alt={reel.title || "MLS reel"}
                className="h-14 w-14 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-[13px] font-semibold leading-tight text-charcoal">{reel.title}</p>
              <p className="mt-0.5 text-[14px] font-extrabold text-crimson">
                {formatPrice(reel.price.amount, reel.price.currencyCode)}
              </p>
            </div>
            <Link
              to={lp(`/products/${reel.handle}`)}
              onClick={onClose}
              className="shrink-0 rounded-xl bg-crimson px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide !text-white shadow transition-colors hover:bg-rich-red"
            >
              {t("common.shop_this")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

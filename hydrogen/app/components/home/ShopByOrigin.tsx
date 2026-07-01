import { useState } from "react";
import { Link } from "react-router";
import { useLocalePath } from "@/stores/localeStore";
import { HScroller } from "./HScroller";

function OriginFlag({
  imageUrl,
  imageAlt,
  countryCode,
}: {
  imageUrl: string | null;
  imageAlt: string;
  countryCode: string;
}) {
  const flagSrc = countryCode
    ? `https://hatscripts.github.io/circle-flags/flags/${countryCode.toLowerCase()}.svg`
    : null;

  const src = imageUrl ?? flagSrc;

  if (src) {
    return (
      <div className="relative h-14 w-14 md:h-16 md:w-16 transition-transform duration-300 group-hover:scale-105">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-crimson/20 to-crimson/5 ring-2 ring-crimson/30 shadow-md" />
        <img
          src={src}
          alt={imageAlt}
          className="relative z-10 h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-full bg-gradient-to-br from-crimson/10 to-bone shadow-md ring-2 ring-crimson/30 transition-transform duration-300 group-hover:scale-105">
      <svg viewBox="0 0 64 64" className="h-8 w-8 text-crimson/60" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="32" cy="32" r="18" />
        <path d="M32 14 C20 20 20 44 32 50 C44 44 44 20 32 14Z" />
        <line x1="14" y1="32" x2="50" y2="32" />
      </svg>
    </div>
  );
}

export interface OriginItem {
  id: string;
  heading: string;
  link: string;
  imageUrl: string | null;
  imageAlt: string;
  category: string;
  countryCode: string;
}

export interface OriginSectionData {
  eyebrow: string;
  heading: string;
  items: OriginItem[];
}

interface Props {
  section?: OriginSectionData | null;
}

export function ShopByOrigin({ section }: Props) {
  const lp = useLocalePath();
  const categories = Array.from(
    new Set((section?.items ?? []).map((i) => i.category).filter(Boolean))
  );

  const [activeTab, setActiveTab] = useState(categories[0] ?? "");

  if (!section || section.items.length === 0) return null;

  const activeItems =
    categories.length > 0
      ? section.items.filter((i) => i.category === activeTab)
      : section.items;

  return (
    <section className="bg-bone py-3 md:py-6">
      <div className="container mx-auto px-4">

        {/* Header */}
        <div className="mb-3 text-center md:mb-4">
          <div className="mb-1.5 flex items-center justify-center gap-3">
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">
              {section.eyebrow}
            </span>
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
          </div>
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">
            {section.heading}
          </h2>
        </div>

        {/* Tabs */}
        {categories.length > 1 && (
          <div className="mb-2 flex justify-center md:mb-3">
            <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={[
                      "shrink-0 whitespace-nowrap capitalize rounded-full px-5 py-2 text-[12px] font-semibold transition-all duration-200 md:px-8 md:py-2.5 md:text-sm",
                      isActive
                        ? "bg-crimson text-white shadow-[0_4px_14px_rgba(185,28,28,0.28)]"
                        : "bg-foreground/[0.06] text-foreground/60 hover:bg-foreground/[0.11] hover:text-foreground",
                    ].join(" ")}
                  >
                    {tab}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Carousel — keyed by tab so it resets scroll position on tab change */}
        <HScroller key={activeTab} innerClassName="md:[justify-content:safe_center]">
          {activeItems.map((item) => (
            <Link
              key={item.id}
              to={lp(item.link)}
              className="group flex w-[112px] shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border border-border bg-card p-3 md:w-[148px] md:gap-3 md:p-5 transition-all duration-200 hover:-translate-y-1 hover:border-crimson hover:shadow-[var(--shadow-card)]"
            >
              <OriginFlag
                imageUrl={item.imageUrl}
                imageAlt={item.imageAlt || item.heading}
                countryCode={item.countryCode}
              />
              <span className="text-center text-[12px] font-semibold leading-tight">
                {item.heading}
              </span>
            </Link>
          ))}
        </HScroller>

      </div>
    </section>
  );
}

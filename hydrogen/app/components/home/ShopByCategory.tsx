import { Link } from "react-router";
import { HScroller } from "./HScroller";
import { useLocalePath } from "@/stores/localeStore";
import { shopifyImageUrl } from "@/lib/shopify";

export interface CategoryItem {
  id: string;
  heading: string;
  link: string;
  imageUrl: string | null;
  imageAlt: string;
}

export interface CategorySectionData {
  eyebrow: string;
  heading: string;
  items: CategoryItem[];
}

interface Props {
  section?: CategorySectionData | null;
}

const EMOJI_MAP: Record<string, string> = {
  beef: "🐄", lamb: "🐑", mutton: "🐏", wagyu: "🥩",
  veal: "🐄", ostrich: "🦤", poultry: "🍗", chicken: "🍗",
  sausages: "🌭", venison: "🦌", "value boxes": "📦",
  boxes: "📦", "whole carcass": "🥩",
};

function getEmoji(h: string) {
  return EMOJI_MAP[h.toLowerCase()] ?? "🥩";
}

export function ShopByCategory({ section }: Props) {
  if (!section || section.items.length === 0) return null;

  return (
    <section className="py-3 md:py-6">
      <div className="container mx-auto px-4">

        <div className="mb-3 text-center md:mb-4">
          <div className="mb-1.5 flex items-center justify-center gap-3">
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">
              {section.eyebrow}
            </span>
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
          </div>
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight text-gradient-brand md:text-3xl">
            {section.heading}
          </h2>
        </div>

        {/* Mobile: scroll */}
        <div className="md:hidden">
          <HScroller>
            {section.items.map((item) => (
              <CategoryCard key={item.id} item={item} mobile />
            ))}
          </HScroller>
        </div>

        {/* Desktop: 4-col grid (matches UAE) */}
        <div className="hidden md:grid md:grid-cols-4 md:gap-3 lg:gap-4">
          {section.items.map((item) => (
            <CategoryCard key={item.id} item={item} />
          ))}
        </div>

      </div>
    </section>
  );
}

function CategoryCard({ item, mobile }: { item: CategoryItem; mobile?: boolean }) {
  const lp = useLocalePath();
  const emoji = getEmoji(item.heading);

  if (mobile) {
    return (
      <Link
        to={lp(item.link)}
        prefetch="intent"
        className="group flex w-[72px] shrink-0 snap-start flex-col items-center gap-2.5"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-foreground/[0.05] transition-all duration-200 group-hover:bg-crimson/10 group-hover:shadow-[0_4px_12px_rgba(185,28,28,0.15)]">
          {item.imageUrl ? (
            <img
              src={shopifyImageUrl(item.imageUrl, 96)}
              alt={item.imageAlt || item.heading}
              className="h-9 w-9 object-contain transition-transform duration-200 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <span className="text-2xl transition-transform duration-200 group-hover:scale-110 select-none">
              {emoji}
            </span>
          )}
        </div>
        <span className="text-center text-[10px] font-semibold leading-tight text-foreground/60 transition-colors group-hover:text-crimson">
          {item.heading}
        </span>
      </Link>
    );
  }

  return (
    <Link
      to={lp(item.link)}
      prefetch="intent"
      className="group relative flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-background px-3 py-5 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-crimson/35 hover:shadow-[0_8px_24px_rgba(185,28,28,0.10)]"
    >
      {/* Inner icon box */}
      <div className="relative flex h-[60px] w-[60px] items-center justify-center rounded-xl bg-foreground/[0.05] transition-all duration-200 group-hover:bg-crimson/8">
        {item.imageUrl ? (
          <img
            src={shopifyImageUrl(item.imageUrl, 400)}
            alt={item.imageAlt || item.heading}
            className="h-[68%] w-[68%] object-contain transition-transform duration-300 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <span className="select-none text-2xl transition-transform duration-300 group-hover:scale-110">
            {emoji}
          </span>
        )}
      </div>

      <span className="relative text-[11px] font-semibold leading-tight text-foreground/60 transition-colors duration-200 group-hover:text-crimson">
        {item.heading}
      </span>

      <span className="absolute bottom-0 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full bg-crimson transition-all duration-300 group-hover:w-7" />
    </Link>
  );
}

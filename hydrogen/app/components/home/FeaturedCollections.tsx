import { Link } from "react-router";
import { HScroller } from "./HScroller";
import { useLocalePath } from "@/stores/localeStore";
import { shopifyImageUrl } from "@/lib/shopify";

export interface FeaturedCollectionCard {
  id: string;
  heading: string;
  subHeading: string;
  url: string;
  imageUrl?: string | null;
  imageAlt?: string;
  emoji?: string;
}

interface FeaturedCollectionsProps {
  cards?: FeaturedCollectionCard[];
  title?: string;
  subtitle?: string;
}

export function FeaturedCollections({ cards, title, subtitle }: FeaturedCollectionsProps) {
  const lp = useLocalePath();
  if (!cards || cards.length === 0) return null;

  return (
    <section className="container mx-auto px-4 py-3 md:py-6">
      {(title || subtitle) && <SectionHeader title={title ?? ""} subtitle={subtitle} />}
      <HScroller>
        {cards.map((c) => (
          <Link
            key={c.id}
            to={lp(c.url)}
            className="group relative aspect-[3/4] w-40 flex-shrink-0 snap-start overflow-hidden rounded-2xl bg-charcoal sm:w-52"
          >
            {c.imageUrl ? (
              <img
                src={shopifyImageUrl(c.imageUrl, 450)}
                alt={c.imageAlt ?? c.heading}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-crimson/30 to-charcoal">
                <span className="text-5xl">{c.emoji ?? "🛒"}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
              <div className="font-display text-sm font-bold leading-tight text-off-white sm:text-[15px]">
                {c.heading}
              </div>
              {c.subHeading && (
                <div className="mt-0.5 text-[10px] uppercase tracking-wider text-off-white/60">
                  {c.subHeading}
                </div>
              )}
            </div>
            <div className="absolute inset-0 ring-1 ring-inset ring-white/0 transition-all duration-300 group-hover:ring-crimson/60 rounded-2xl" />
          </Link>
        ))}
      </HScroller>
    </section>
  );
}

export function SectionHeader({
  title,
  subtitle,
  actionHref,
  actionLabel,
}: {
  title: string;
  subtitle?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 md:mb-5">
      <div>
        {subtitle && (
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-px w-5 rounded-full bg-crimson" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">
              {subtitle}
            </span>
          </div>
        )}
        <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">{title}</h2>
      </div>
      {actionHref && (
        <a
          href={actionHref}
          className="hidden shrink-0 text-sm font-semibold text-crimson hover:underline underline-offset-2 sm:inline"
        >
          {actionLabel ?? "View all →"}
        </a>
      )}
    </div>
  );
}

import { Link } from "react-router";
import { HScroller } from "./HScroller";
import { useLocalePath } from "@/stores/localeStore";
import { shopifyImageUrl } from "@/lib/shopify";
import type { CutsSectionData } from "~/routes/_index";

interface Props {
  section?: CutsSectionData | null;
}

export function ShopByCuts({ section }: Props) {
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
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">
            {section.heading}
          </h2>
        </div>

        {/* Slider — all screen sizes */}
        <HScroller>
          {section.items.map((c) => (
            <CutCard key={c.id} cut={c} />
          ))}
        </HScroller>

      </div>
    </section>
  );
}

function CutCard({ cut }: { cut: CutsSectionData["items"][0] }) {
  const lp = useLocalePath();
  return (
    <Link
      to={lp(cut.url)}
      prefetch="intent"
      className="group flex w-[72px] shrink-0 snap-start flex-col items-center gap-3 md:w-32"
    >
      {/* Circle avatar */}
      <div
        className={[
          "relative aspect-square w-full overflow-hidden rounded-full transition-all duration-300",
          "ring-2 ring-transparent group-hover:ring-crimson/50 group-hover:shadow-[0_6px_20px_rgba(185,28,28,0.18)]",
          cut.imageUrl ? "bg-white" : "bg-crimson/8 group-hover:bg-crimson/14",
        ].join(" ")}
      >
        {cut.imageUrl ? (
          <img
            src={shopifyImageUrl(cut.imageUrl, 400)}
            alt={cut.label}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-3xl transition-transform duration-300 group-hover:scale-110 md:text-4xl">
            {cut.emoji}
          </div>
        )}
      </div>

      {/* Label */}
      <span className="text-center text-[10px] font-bold uppercase tracking-wider text-foreground/70 transition-colors duration-200 group-hover:text-crimson md:text-[11px]">
        {cut.label}
      </span>
    </Link>
  );
}

import { Link } from "react-router";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PriceTile {
  id: string;
  priceAmount: string;
  priceLabel: string;
  linkUrl: string;
  backgroundImageUrl: string | null;
  backgroundImageAlt: string | null;
}

export interface PriceRangeSectionData {
  heading: string;
  subHeading: string;
  allBoxesUrl?: string | null;
}

// ── Parsers ────────────────────────────────────────────────────────────────

export function parsePriceRangeSection(nodes: any[]): PriceRangeSectionData {
  const node = nodes[0];
  if (!node) return { heading: "Shop by Price", subHeading: "Every Budget · Premier Quality" };
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  return {
    heading:     f["heading"]?.value     ?? "Shop by Price",
    subHeading:  f["sub_heading"]?.value ?? "Every Budget · Premier Quality",
    allBoxesUrl: f["all_boxes_url"]?.value ?? null,
  };
}

export function parsePriceTiles(nodes: any[]): PriceTile[] {
  return nodes
    .map((node: any) => {
      const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
      const amount = f["price_amount"]?.value;
      if (!amount) return null;

      const collectionHandle = f["collection"]?.reference?.handle;
      const fallbackUrl = f["link_url"]?.value ?? "";
      const url = collectionHandle ? `/collections/${collectionHandle}` : fallbackUrl;
      if (!url) return null;

      return {
        id:                 node.id as string,
        priceAmount:        amount as string,
        priceLabel:         (f["price_label"]?.value ?? "") as string,
        linkUrl:            url as string,
        backgroundImageUrl: f["background_image"]?.reference?.image?.url ?? null,
        backgroundImageAlt: f["background_image"]?.reference?.image?.altText ?? null,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => parseFloat(a.priceAmount) - parseFloat(b.priceAmount)) as PriceTile[];
}

// ── Component ──────────────────────────────────────────────────────────────

interface PriceRangeShopProps {
  section?: PriceRangeSectionData | null;
  tiles?: PriceTile[];
}

export function PriceRangeShop({ section, tiles = [] }: PriceRangeShopProps) {
  if (tiles.length === 0) return null;

  const heading    = section?.heading    ?? "Shop by Price";
  const subHeading = section?.subHeading ?? "Every Budget · Premier Quality";

  return (
    <section className="border-t border-border/50 bg-bone py-6 md:py-8">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-6xl">

          {/* ── Centered header — consistent with other sections ── */}
          <div className="mb-3 text-center md:mb-4">
            <div className="mb-1.5 flex items-center justify-center gap-3">
              <span className="h-px w-6 rounded-full bg-crimson" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">
                {subHeading}
              </span>
              <span className="h-px w-6 rounded-full bg-crimson" />
            </div>
            <h2 className="font-display text-2xl font-bold leading-snug tracking-tight text-foreground md:text-3xl">
              {heading}
            </h2>
          </div>

          {/* ── Mobile: horizontal slider ── */}
          <div className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:hidden">
            {tiles.map((tile) => (
              <div key={tile.id} className="w-[38vw] shrink-0 snap-start">
                <PriceTileCard tile={tile} />
              </div>
            ))}
          </div>

          {/* ── Desktop: single row grid — columns match tile count so they stay centered ── */}
          <div
            className="hidden md:grid md:gap-3"
            style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
          >
            {tiles.map((tile) => (
              <PriceTileCard key={tile.id} tile={tile} />
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

// ── Tile card ──────────────────────────────────────────────────────────────

function PriceTileCard({ tile }: { tile: PriceTile }) {
  return (
    <Link
      to={tile.linkUrl}
      prefetch="intent"
      className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-3 transition-all duration-300 hover:-translate-y-1.5 hover:border-crimson/50 hover:shadow-[0_12px_32px_rgba(185,28,28,0.12)] md:rounded-2xl md:p-5"
    >
      {/* Crimson fill that rises from the bottom on hover */}
      <div className="absolute inset-x-0 bottom-0 h-0 bg-crimson transition-all duration-300 group-hover:h-full" />

      {/* All content sits above the fill */}
      <div className="relative z-10 flex flex-col">

        {/* Price number */}
        <div className="flex items-baseline gap-0.5">
          <span className="text-xl font-black leading-none tracking-tight text-foreground transition-colors duration-300 group-hover:text-white md:text-3xl">
            {tile.priceAmount}
          </span>
          <span className="ml-0.5 text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/50 transition-colors duration-300 group-hover:text-white/60 md:text-[9px]">
            OMR
          </span>
        </div>

        {/* & under */}
        <span className="mt-0.5 text-[9px] font-medium text-muted-foreground/50 transition-colors duration-300 group-hover:text-white/60 md:text-[11px]">
          &amp; under
        </span>

        {/* Accent dash */}
        <div className="mt-3 h-[2px] w-4 rounded-full bg-crimson/25 transition-all duration-300 group-hover:w-7 group-hover:bg-white/60 md:mt-4" />

      </div>
    </Link>
  );
}

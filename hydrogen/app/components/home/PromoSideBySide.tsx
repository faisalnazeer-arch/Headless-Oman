import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { shopifyImageUrl } from "@/lib/shopify";

export interface PromoSideBySideData {
  badgeText: string | null;
  heading: string;
  bodyText: string | null;
  buttonLabel: string | null;
  buttonUrl: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
}

export function parsePromoSideBySide(nodes: any[]): PromoSideBySideData | null {
  const node = nodes[0];
  if (!node) return null;
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  const heading = f["heading"]?.value;
  if (!heading) return null;
  return {
    badgeText:   f["badge_text"]?.value   ?? null,
    heading,
    bodyText:    f["body_text"]?.value    ?? null,
    buttonLabel: f["button_label"]?.value ?? null,
    buttonUrl:   f["button_url"]?.value   ?? null,
    imageUrl:    f["image"]?.reference?.image?.url    ?? null,
    imageAlt:    f["image"]?.reference?.image?.altText ?? null,
  };
}

interface PromoSideBySideProps {
  promo?: PromoSideBySideData | null;
}

export function PromoSideBySide({ promo }: PromoSideBySideProps) {
  if (!promo) return null;

  return (
    <section className="container mx-auto px-4 py-3 md:py-6">
      <div className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] md:grid-cols-2">
        {/* Image side — left on desktop, below text on mobile */}
        {promo.imageUrl && (
          <div className="relative order-last min-h-[260px] overflow-hidden bg-charcoal md:order-first md:min-h-[340px]">
            <img
              src={shopifyImageUrl(promo.imageUrl, 1000)}
              alt={promo.imageAlt ?? promo.heading}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-charcoal/20 via-transparent to-transparent" />
          </div>
        )}

        {/* Text side — right on desktop */}
        <div className="flex flex-col justify-center gap-3 p-6 md:gap-4 md:p-10">
          {promo.badgeText && (
            <span className="w-fit rounded-full bg-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
              {promo.badgeText}
            </span>
          )}
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">
            {promo.heading}
          </h2>
          {promo.bodyText && (
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
              {promo.bodyText}
            </p>
          )}
          {promo.buttonLabel && promo.buttonUrl && (
            <div className="pt-1">
              <Link to={promo.buttonUrl}>
                <Button
                  size="lg"
                  className="rounded-full bg-crimson px-7 text-crimson-foreground hover:bg-rich-red"
                >
                  {promo.buttonLabel}
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

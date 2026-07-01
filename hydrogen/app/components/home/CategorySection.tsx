import { useState } from "react";
import { Link } from "react-router";
import { useLocalePath } from "@/stores/localeStore";
import { useT } from "@/i18n/strings";
import type { ShopifyProduct } from "@/lib/shopify";
import { ProductCard } from "@/components/product/ProductCard";
import { HScroller } from "./HScroller";

interface TabData {
  label: string;
  handle: string;
  products: ShopifyProduct[];
}

interface CategorySectionProps {
  handle: string;
  title: string;
  subtitle?: string;
  products?: ShopifyProduct[];
  tabs?: TabData[];
}

export function CategorySection({
  handle,
  title,
  subtitle,
  products = [],
  tabs,
}: CategorySectionProps) {
  const lp = useLocalePath();
  const t = useT();
  const [activeIdx, setActiveIdx] = useState(0);

  const hasTabs = tabs && tabs.length > 1;
  const activeTab = hasTabs ? tabs[activeIdx] : null;
  const visibleProducts = activeTab ? activeTab.products : products;
  const viewAllHandle = activeTab ? activeTab.handle : handle;

  return (
    <section className="container mx-auto px-4 py-3 md:py-6">
      {/* Header */}
      <div className="text-center">
        {subtitle && (
          <div className="mb-1.5 flex items-center justify-center gap-3">
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">
              {subtitle}
            </span>
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
          </div>
        )}
        <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">{title}</h2>
      </div>

      {/* Tabs */}
      {hasTabs && (
        <div className="mb-1.5 flex justify-center md:mb-2">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tab, idx) => {
              const isActive = idx === activeIdx;
              return (
                <button
                  key={tab.handle}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className={[
                    "shrink-0 whitespace-nowrap rounded-full px-5 py-2 text-[12px] font-semibold transition-all duration-200 md:px-8 md:py-2.5 md:text-sm",
                    isActive
                      ? "bg-crimson text-white shadow-[0_4px_14px_rgba(185,28,28,0.28)]"
                      : "bg-foreground/[0.06] text-foreground/60 hover:bg-foreground/[0.11] hover:text-foreground",
                  ].join(" ")}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* View all */}
      <div className="mb-2 text-center">
        <Link
          to={lp(`/collections/${viewAllHandle}`)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-crimson underline-offset-2 hover:underline md:text-sm"
        >
          {t("collection.view_all")}
        </Link>
      </div>

      {/* Products */}
      {visibleProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-muted-foreground">
          {t("collection.no_products_tab")}
        </div>
      ) : (
        <HScroller>
          {visibleProducts.map((p) => (
            <div
              key={p.node.id}
              className="w-[44%] flex-shrink-0 snap-start sm:w-[32%] lg:w-[23%] xl:w-[19%]"
            >
              <ProductCard product={p} />
            </div>
          ))}
        </HScroller>
      )}
    </section>
  );
}

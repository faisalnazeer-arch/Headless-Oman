import { Link } from "react-router";
import { Calendar, ArrowRight } from "lucide-react";
import { HScroller } from "./HScroller";
import { useT } from "@/i18n/strings";
import { useLocalePath } from "@/stores/localeStore";
import { shopifyImageUrl } from "@/lib/shopify";

export interface BlogArticle {
  id: string;
  handle: string;
  title: string;
  publishedAt: string;
  excerpt: string | null;
  imageUrl: string | null;
  imageAlt: string;
  blogHandle: string;
}

function BlogCard({ article }: { article: BlogArticle }) {
  const t = useT();
  const lp = useLocalePath();
  return (
    <Link
      to={lp(`/blogs/${article.blogHandle}/${article.handle}`)}
      className="group flex w-72 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:w-80"
    >
      {article.imageUrl ? (
        <div className="aspect-[16/9] overflow-hidden bg-muted w-full">
          <img
            src={shopifyImageUrl(article.imageUrl, 700)}
            alt={article.imageAlt}
            className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-[16/9] w-full bg-gradient-to-br from-charcoal/10 to-crimson/10" />
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          {new Date(article.publishedAt).toLocaleDateString("en-AE", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
        <h3 className="mb-2 font-display text-base font-bold leading-snug">{article.title}</h3>
        {article.excerpt && (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p>
        )}
        <div className="mt-auto flex items-center gap-1 pt-4 text-sm font-semibold text-crimson">
          {t("blog.read_more")} <ArrowRight className="h-3.5 w-3.5" />
        </div>
      </div>
    </Link>
  );
}

export function HomeBlogSection({ articles }: { articles: BlogArticle[] }) {
  const t = useT();
  const lp = useLocalePath();
  if (!articles.length) return null;
  return (
    <section className="py-3 md:py-6">
      <div className="container mx-auto px-4">
        <div className="mb-3 text-center md:mb-4">
          <div className="mb-1.5 flex items-center justify-center gap-3">
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">{t("blog.from_kitchen")}</span>
            <span className="h-px w-6 rounded-full bg-gradient-brand" />
          </div>
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight md:text-3xl">{t("blog.tips")}</h2>
        </div>

        <HScroller>
          {articles.map((article) => (
            <BlogCard key={article.id} article={article} />
          ))}
        </HScroller>

        <div className="mt-5 flex justify-center">
          <Link
            to={lp("/blogs/all")}
            className="flex items-center gap-1.5 text-sm font-semibold text-crimson transition-colors hover:text-rich-red"
          >
            {t("blog.view_all")} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

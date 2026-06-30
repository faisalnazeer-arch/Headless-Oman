import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, Link } from "react-router";
import { Calendar, ArrowLeft, Tag } from "lucide-react";

const ARTICLE_QUERY = `#graphql
  query Article($blogHandle: String!, $articleHandle: String!, $language: LanguageCode)
  @inContext(language: $language) {
    blog(handle: $blogHandle) {
      handle title
      articleByHandle(handle: $articleHandle) {
        handle title contentHtml publishedAt tags
        excerpt
        author { name }
        image { url altText width height }
        seo { title description }
      }
    }
  }
` as const;

export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const { blogHandle, articleHandle } = params;
  if (!blogHandle || !articleHandle) throw new Response("Not found", { status: 404 });

  const lang = request.headers.get("Cookie")?.match(/(?:^|;\s*)lang=([a-z]{2})/)?.[1];
  const language = (lang === "ar" ? "AR" : "EN") as "AR" | "EN";

  const { blog } = await context.storefront.query(ARTICLE_QUERY, {
    variables: { blogHandle, articleHandle, language },
  });

  if (!blog?.articleByHandle) throw new Response("Article not found", { status: 404 });
  return { blog, article: blog.articleByHandle };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.article?.seo?.title ?? data?.article?.title ?? "Article";
  const description = data?.article?.seo?.description ?? data?.article?.excerpt ?? "";
  const image = data?.article?.image?.url;
  const url = `https://mls.om/blogs/${data?.blog?.handle ?? "news"}/${data?.article?.handle ?? ""}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url,
    datePublished: data?.article?.publishedAt ?? "",
    author: { "@type": "Organization", name: "MLS Oman", url: "https://mls.om" },
    publisher: {
      "@type": "Organization",
      name: "MLS Oman",
      url: "https://mls.om",
      logo: { "@type": "ImageObject", url: "https://mls.om/cdn/shop/files/logo_97c8d848-b3ec-4a82-a68e-dcedc161529c.png?v=1711022728" },
    },
    ...(image ? { image: [image] } : {}),
  };
  return [
    { title: `${title} — MLS Oman` },
    { name: "description", content: description },
    { property: "og:type", content: "article" },
    { property: "og:url", content: url },
    ...(image ? [{ property: "og:image", content: image }] : []),
    { tagName: "link", rel: "canonical", href: url },
    { "script:ld+json": jsonLd },
  ];
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", { year: "numeric", month: "long", day: "numeric" });
}

export default function ArticlePage() {
  const { blog, article } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">

      {/* Hero — image with title overlaid at bottom on desktop */}
      {article.image && (
        <div className="relative overflow-hidden bg-muted" style={{ height: "clamp(220px, 45vw, 480px)" }}>
          <img
            src={article.image.url}
            alt={article.image.altText ?? article.title}
            className="h-full w-full object-cover object-top"
          />
          {/* Gradient + title overlay — desktop only */}
          <div className="absolute inset-0 hidden flex-col justify-end bg-gradient-to-t from-black/75 via-black/30 to-transparent p-8 md:flex">
            <div className="mx-auto w-full max-w-3xl">
              {article.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <span key={tag} className="flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                      <Tag className="h-2.5 w-2.5" /> {tag}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="font-display text-3xl font-extrabold leading-tight text-white lg:text-4xl xl:text-5xl">
                {article.title}
              </h1>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-white/70">
                <Calendar className="h-4 w-4" />
                {formatDate(article.publishedAt)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="mx-auto max-w-3xl">

          {/* Back link */}
          <Link
            to={`/blogs/${blog.handle}`}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-crimson transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Back to {blog.title}
          </Link>

          {/* Mobile-only: tags + title + date (desktop shows these in the hero overlay) */}
          <div className="md:hidden">
            {article.tags.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {article.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-1 rounded-full bg-crimson/10 px-3 py-1 text-[11px] font-semibold text-crimson">
                    <Tag className="h-2.5 w-2.5" /> {tag}
                  </span>
                ))}
              </div>
            )}
            <h1 className="font-display text-2xl font-extrabold leading-tight text-foreground">
              {article.title}
            </h1>
            <div className="mt-3 mb-6 flex items-center gap-1.5 border-b border-border pb-6 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {formatDate(article.publishedAt)}
            </div>
          </div>

          {/* Desktop: spacer below hero before body */}
          <div className="hidden md:block mb-8 border-b border-border pb-2" />

          {/* Article body */}
          <div
            className="prose prose-base max-w-none
              prose-headings:font-display prose-headings:font-bold prose-headings:text-foreground
              prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
              prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
              prose-p:text-neutral-600 prose-p:leading-relaxed
              prose-strong:text-foreground prose-strong:font-semibold
              prose-a:text-crimson prose-a:no-underline hover:prose-a:underline
              prose-li:text-neutral-600 prose-li:leading-relaxed
              prose-img:rounded-xl prose-img:shadow-md prose-img:w-full prose-img:h-auto prose-img:object-cover
              prose-blockquote:border-crimson prose-blockquote:text-neutral-500
              prose-hr:border-border"
            dangerouslySetInnerHTML={{ __html: article.contentHtml }}
          />

          {/* Footer */}
          <div className="mt-12 flex items-center justify-between border-t border-border pt-8">
            <Link
              to={`/blogs/${blog.handle}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:border-crimson hover:text-crimson"
            >
              <ArrowLeft className="h-4 w-4" /> More articles
            </Link>
            <Link
              to="/collections/all"
              className="inline-flex items-center gap-2 rounded-lg bg-crimson px-5 py-2.5 text-sm font-bold transition-all hover:bg-rich-red"
              style={{ color: '#fff' }}
            >
              Shop Now
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

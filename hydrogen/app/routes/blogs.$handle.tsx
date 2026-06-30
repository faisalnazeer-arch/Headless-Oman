import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, Link } from "react-router";
import { Calendar, ArrowRight } from "lucide-react";

const BLOG_QUERY = `#graphql
  query Blog($handle: String!, $first: Int!, $after: String, $language: LanguageCode)
  @inContext(language: $language) {
    blog(handle: $handle) {
      handle
      title
      articles(first: $first, after: $after, sortKey: PUBLISHED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes {
          handle title excerpt publishedAt tags
          author { name }
          image { url altText width height }
        }
      }
    }
  }
` as const;

export async function loader({ params, context, request }: LoaderFunctionArgs) {
  const { handle } = params;
  if (!handle) throw new Response("Not found", { status: 404 });

  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const lang = request.headers.get("Cookie")?.match(/(?:^|;\s*)lang=([a-z]{2})/)?.[1];
  const language = (lang === "ar" ? "AR" : "EN") as "AR" | "EN";

  const { blog } = await context.storefront.query(BLOG_QUERY, {
    variables: { handle, first: 12, after: cursor, language },
  });

  if (!blog) throw new Response(`Blog "${handle}" not found`, { status: 404 });
  return { blog };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.blog?.title ?? "Blog"} — MLS Oman` },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AE", { year: "numeric", month: "short", day: "numeric" });
}

export default function BlogPage() {
  const { blog } = useLoaderData<typeof loader>();
  const articles = blog.articles.nodes;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-muted/30 py-10 md:py-14 text-center">
        <div className="container mx-auto px-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-crimson">MLS Blog</p>
          <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">{blog.title}</h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10 md:py-14">
        {articles.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">No articles yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {articles.map((article) => (
              <Link
                key={article.handle}
                to={`/blogs/${blog.handle}/${article.handle}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="relative w-full overflow-hidden bg-muted" style={{ paddingTop: "56.25%" }}>
                  {article.image ? (
                    <img
                      src={article.image.url}
                      alt={article.image.altText ?? article.title}
                      className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-crimson/10 to-crimson/5">
                      <span className="text-4xl">🥩</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-3 sm:p-5">
                  {article.tags.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      {article.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-full bg-crimson/10 px-2 py-0.5 text-[10px] font-semibold text-crimson">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <h2 className="font-display text-base font-bold leading-snug text-foreground group-hover:text-crimson transition-colors md:text-lg line-clamp-2">
                    {article.title}
                  </h2>
                  {article.excerpt && (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2 flex-1">
                      {article.excerpt}
                    </p>
                  )}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" /> {formatDate(article.publishedAt)}
                    </span>
                    <span className="flex items-center gap-1 text-xs font-semibold text-crimson">
                      Read <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {blog.articles.pageInfo.hasNextPage && (
          <div className="mt-10 text-center">
            <Link
              to={`?cursor=${blog.articles.pageInfo.endCursor}`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-3 text-sm font-semibold text-foreground transition-all hover:border-crimson hover:text-crimson"
            >
              Load more articles <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

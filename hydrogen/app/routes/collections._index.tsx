import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, Link } from "react-router";

export const meta: MetaFunction = () => [
  { title: "All Collections — MLS Oman" },
  { name: "description", content: "Browse all meat collections at MLS Oman — beef, lamb, wagyu, burgers and more." },
];

const COLLECTIONS_QUERY = `#graphql
  query Collections($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    collections(first: 250, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        image {
          url
          altText
          width
          height
        }
        description
      }
    }
  }
` as const;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const lang = request.headers.get("Cookie")?.match(/(?:^|;\s*)lang=([a-z]{2})/)?.[1];
  const language = (lang === "ar" ? "AR" : "EN") as "AR" | "EN";

  const { collections } = await context.storefront.query(COLLECTIONS_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheShort(),
  });

  return { collections: collections.nodes };
}

export default function CollectionsIndex() {
  const { collections } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-muted/30 py-10 text-center md:py-14">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl font-extrabold text-foreground md:text-4xl">All Collections</h1>
          <p className="mt-2 text-sm text-muted-foreground">{collections.length} collections</p>
        </div>
      </div>
      <div className="container mx-auto px-4 py-10 md:py-14">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {collections.map((col) => (
            <Link
              key={col.id}
              to={`/collections/${col.handle}`}
              prefetch="intent"
              className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative w-full overflow-hidden bg-muted" style={{ paddingTop: "75%" }}>
                {col.image ? (
                  <img
                    src={col.image.url}
                    alt={col.image.altText ?? col.title}
                    className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-crimson/10 to-crimson/5">
                    <span className="text-4xl">🥩</span>
                  </div>
                )}
              </div>
              <div className="p-3">
                <h2 className="font-display text-sm font-bold leading-snug text-foreground group-hover:text-crimson transition-colors line-clamp-2">
                  {col.title}
                </h2>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

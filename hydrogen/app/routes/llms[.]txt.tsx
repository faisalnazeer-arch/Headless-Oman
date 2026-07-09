import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

// Dynamic llms.txt — an overview of the storefront for LLM consumption, mirroring the
// Yoast-generated file from the Shopify theme but built live from the Storefront API so it
// never goes stale. Lists pages, recent blog posts, blogs, products and collections.
const SITE_URL = "https://mls.om";
const TITLE = "MLS Premium Meat supplier in Oman | Order Online Butcher";
const DESCRIPTION =
  "Fresh premium meat delivered within 1–2 hours across Muscat. Order halal beef, lamb, chicken & more with fast, hygienic doorstep delivery.";

const QUERY = `#graphql
  query LlmsTxt {
    products(first: 50, sortKey: BEST_SELLING) {
      nodes { handle title }
    }
    collections(first: 30, sortKey: UPDATED_AT) {
      nodes { handle title }
    }
    pages(first: 100) {
      nodes { handle title }
    }
    blogs(first: 50) {
      nodes {
        handle
        title
        articles(first: 10, sortKey: PUBLISHED_AT, reverse: true) {
          nodes { handle title publishedAt }
        }
      }
    }
  }
` as const;

const EXCLUDED_PAGES = new Set(["404", "password", "checkout", "account", "cart", "search"]);

function link(title: string, path: string) {
  return `- [${title}](${SITE_URL}${path})`;
}

export async function loader({ context }: LoaderFunctionArgs) {
  const data = (await context.storefront.query(QUERY).catch(() => null)) as any;

  const products = data?.products?.nodes ?? [];
  const collections = data?.collections?.nodes ?? [];
  const pages = (data?.pages?.nodes ?? []).filter((p: any) => !EXCLUDED_PAGES.has(p.handle));
  const blogs = data?.blogs?.nodes ?? [];

  // Newest blog posts across all blogs.
  const posts = blogs
    .flatMap((b: any) => (b.articles?.nodes ?? []).map((a: any) => ({ ...a, blogHandle: b.handle })))
    .sort((a: any, b: any) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, 25);

  const out: string[] = [
    `# ${TITLE}`,
    "",
    `> ${DESCRIPTION}`,
    "",
    "This is an llms.txt file, meant for consumption by LLMs.",
    "",
    "## Site Information",
    "- Brand Name: Muscat Livestock",
    `- Website: ${SITE_URL}`,
    "- Primary Market: Oman",
    "- Language: English",
    "- Currency: OMR",
    "- Contact Email: contactus@mls.om",
    "- Primary Products: beef, lamb, mutton, poultry, camel, seasoned & sauces, value boxes, gift cards",
    "- Key Product Attributes: fresh and frozen halal meats, grass-fed options, wagyu beef, black angus beef, bone-in and boneless cuts, burger patties, mishkak & fondue cubes, whole carcass, dry-aged, one-hour delivery across Muscat",
    "- Target Audience: home shoppers buying meat online, customers seeking halal red meat, buyers looking for fresh meat delivery in Muscat, customers purchasing beef and lamb cuts for cooking, customers looking for premium wagyu or angus beef",
  ];

  if (pages.length) out.push("", "## Pages", ...pages.map((p: any) => link(p.title, `/pages/${p.handle}`)));
  if (posts.length) out.push("", "## Blog posts", ...posts.map((a: any) => link(a.title, `/blogs/${a.blogHandle}/${a.handle}`)));
  if (blogs.length) out.push("", "## Blogs", ...blogs.map((b: any) => link(b.title, `/blogs/${b.handle}`)));
  if (products.length) out.push("", "## Products", ...products.map((p: any) => link(p.title, `/products/${p.handle}`)));
  if (collections.length) out.push("", "## Collections", ...collections.map((c: any) => link(c.title, `/collections/${c.handle}`)));
  out.push("", "## Optional", link("Sitemap index", "/sitemap.xml"), "");

  return new Response(out.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

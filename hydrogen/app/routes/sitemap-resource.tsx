import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

// Shared generator for the per-resource child sitemaps. Registered in routes.ts under
// /sitemap_<type>.xml and /ar/sitemap_<type>.xml; it reads the path to decide the locale
// (en/ar) and resource type (products | collections | pages | blogs). AR product/collection/
// blog URLs use the same handles under the /ar prefix (Hydrogen serves them via @inContext).
const SITE_URL = "https://mls.om";

const PRODUCTS_QUERY = `#graphql
  query SitemapProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { handle updatedAt }
    }
  }
` as const;

const COLLECTIONS_QUERY = `#graphql
  query SitemapCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes { handle updatedAt }
    }
  }
` as const;

const PAGES_QUERY = `#graphql
  query SitemapPages($first: Int!, $after: String) {
    pages(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { handle updatedAt }
    }
  }
` as const;

const BLOGS_QUERY = `#graphql
  query SitemapBlogs($first: Int!) {
    blogs(first: $first) {
      nodes { handle articles(first: 250) { nodes { handle publishedAt } } }
    }
  }
` as const;

async function paginate<T>(
  fetcher: (after: string | null) => Promise<{ pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: T[] }>,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  do {
    const r = await fetcher(after);
    all.push(...r.nodes);
    if (!r.pageInfo.hasNextPage) break;
    after = r.pageInfo.endCursor;
  } while (true);
  return all;
}

function urlEntry(path: string, lastmod?: string, changefreq = "weekly", priority = "0.7") {
  return [
    "  <url>",
    `    <loc>${SITE_URL}${path}</loc>`,
    lastmod ? `    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

const EXCLUDED_PAGES = new Set(["404", "password", "checkout", "account", "cart", "search"]);

export async function loader({ context, request }: LoaderFunctionArgs) {
  const { pathname } = new URL(request.url);
  const prefix = pathname.startsWith("/ar/") ? "/ar" : "";
  const type = pathname.match(/sitemap_([a-z]+)\.xml/)?.[1] ?? "";
  const { storefront } = context;

  const entries: string[] = [];

  if (type === "products") {
    const products = await paginate<{ handle: string; updatedAt: string }>((after) =>
      storefront.query(PRODUCTS_QUERY, { variables: { first: 250, after } }).then((d: any) => d.products),
    );
    for (const p of products) entries.push(urlEntry(`${prefix}/products/${p.handle}`, p.updatedAt, "weekly", "0.8"));
  } else if (type === "collections") {
    const collections = await paginate<{ handle: string; updatedAt: string }>((after) =>
      storefront.query(COLLECTIONS_QUERY, { variables: { first: 250, after } }).then((d: any) => d.collections),
    );
    // Homepage lives here so it's covered for both locales (this child runs for en + ar).
    entries.push(urlEntry(`${prefix}/`, undefined, "daily", "1.0"));
    for (const c of collections) entries.push(urlEntry(`${prefix}/collections/${c.handle}`, c.updatedAt, "weekly", "0.7"));
  } else if (type === "pages") {
    const pages = await paginate<{ handle: string; updatedAt: string }>((after) =>
      storefront.query(PAGES_QUERY, { variables: { first: 250, after } }).then((d: any) => d.pages),
    );
    for (const p of pages) {
      if (EXCLUDED_PAGES.has(p.handle)) continue;
      entries.push(urlEntry(`${prefix}/pages/${p.handle}`, p.updatedAt, "monthly", "0.5"));
    }
  } else if (type === "blogs") {
    const blogs = await storefront.query(BLOGS_QUERY, { variables: { first: 50 } }).then((d: any) => d.blogs?.nodes ?? []);
    entries.push(urlEntry(`${prefix}/blogs/all`, undefined, "daily", "0.8"));
    for (const b of blogs) {
      entries.push(urlEntry(`${prefix}/blogs/${b.handle}`, undefined, "weekly", "0.6"));
      for (const a of b.articles?.nodes ?? []) {
        entries.push(urlEntry(`${prefix}/blogs/${b.handle}/${a.handle}`, a.publishedAt, "monthly", "0.6"));
      }
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

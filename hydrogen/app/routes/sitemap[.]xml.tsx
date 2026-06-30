import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

// Parent sitemap index — links to the per-resource child sitemaps (EN + AR), mirroring the
// Shopify theme's structure. Each child is generated live by routes/sitemap-resource.tsx.
const SITE_URL = "https://mls.om";

const CHILD_SITEMAPS = [
  "/sitemap_products.xml",
  "/sitemap_collections.xml",
  "/sitemap_pages.xml",
  "/sitemap_blogs.xml",
  "/ar/sitemap_products.xml",
  "/ar/sitemap_collections.xml",
  "/ar/sitemap_blogs.xml",
];

export async function loader(_args: LoaderFunctionArgs) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...CHILD_SITEMAPS.map((p) => `  <sitemap><loc>${SITE_URL}${p}</loc></sitemap>`),
    "</sitemapindex>",
  ].join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

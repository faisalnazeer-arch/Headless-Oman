import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

// AI-agent instructions file (part of Shopify's Agentic Commerce discovery, alongside
// sitemap_agentic_discovery.xml). Mirror Shopify's live copy on the primary domain so agents that
// crawl mls.om can read it. Served as-is — the checkout.mls.om references inside are Shopify's
// canonical agentic-commerce endpoints and must not be rewritten.
const SOURCE = "https://checkout.mls.om/agents.md";

export async function loader(_args: LoaderFunctionArgs) {
  try {
    const res = await fetch(SOURCE, { headers: { "User-Agent": "MLS-Hydrogen" } });
    if (!res.ok) return new Response("Not found", { status: 404 });
    const md = await res.text();
    return new Response(md, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

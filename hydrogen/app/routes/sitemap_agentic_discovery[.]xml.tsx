import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

// Shopify auto-generates the "Agentic Discovery" sitemap (for AI shopping agents) on its own
// managed domain; a headless storefront doesn't serve it on the primary domain. Mirror it on
// mls.om by proxying Shopify's live copy so it stays in sync, and repoint the agents.md URL at
// mls.om so the whole discovery chain stays on the primary domain.
const SOURCE = "https://muscat-livestock.myshopify.com/sitemap_agentic_discovery.xml";

export async function loader(_args: LoaderFunctionArgs) {
  try {
    const res = await fetch(SOURCE, { headers: { "User-Agent": "MLS-Hydrogen" } });
    if (!res.ok) return new Response("Not found", { status: 404 });
    let xml = await res.text();
    xml = xml.replace(/https:\/\/checkout\.mls\.om\/agents\.md/g, "https://mls.om/agents.md");
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

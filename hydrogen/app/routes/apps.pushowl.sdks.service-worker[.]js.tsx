import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

// Proxy PushOwl service worker from Shopify app proxy so web push works in headless.
// PushOwl registers the SW at /apps/pushowl/sdks/service-worker.js; Shopify app proxy
// routes that path to PushOwl's servers. In headless Oxygen we replicate the proxy here.
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const upstream = `https://muscat-livestock.myshopify.com/apps/pushowl/sdks/service-worker.js${url.search}`;

  try {
    const res = await fetch(upstream, {
      headers: { Accept: "application/javascript" },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.ok ? 200 : res.status,
      headers: {
        "Content-Type": "application/javascript",
        "Service-Worker-Allowed": "/",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch {
    return new Response("/* pushowl service worker unavailable */", {
      status: 200,
      headers: {
        "Content-Type": "application/javascript",
        "Service-Worker-Allowed": "/",
      },
    });
  }
}

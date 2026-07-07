import type { AppLoadContext, EntryContext } from "@shopify/remix-oxygen";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
// @ts-expect-error no types for browser subpath
import { renderToReadableStream } from "react-dom/server.browser";
import { createContentSecurityPolicy } from "@shopify/hydrogen";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
  context: AppLoadContext
) {
  // We use createContentSecurityPolicy only to get the nonce + NonceProvider
  // so that useNonce() in root.tsx works correctly. We do NOT use the generated
  // CSP header because React Router v7 streaming scripts don't receive nonces,
  // which blocks hydration. Instead we use a permissive CSP with 'unsafe-inline'.
  const { nonce, NonceProvider } = createContentSecurityPolicy(
    context.env
      ? {
          shop: {
            checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN,
            storeDomain: context.env.PUBLIC_STORE_DOMAIN,
          },
        }
      : {}
  );

  const body = await renderToReadableStream(
    <NonceProvider>
      <ServerRouter context={remixContext} url={request.url} />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error: unknown) {
        console.error(error);
        responseStatusCode = 500;
      },
    }
  );

  if (isbot(request.headers.get("user-agent") ?? "")) {
    await body.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");

  // Use 'unsafe-inline' so React Router streaming hydration scripts are not
  // blocked by CSP. A nonce-based policy would block them because those inline
  // scripts are injected without nonces by React Router's streaming layer.
  responseHeaders.set(
    "Content-Security-Policy",
    [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.shopify.com https://shopify.com http://localhost:* ws://localhost:* wss://localhost:* https://*.yotpo.com http://*.yotpo.com https://*.yotpo.xyz https://cdn.judge.me https://*.judge.me https://cdn.richpanel.com https://*.richpanel.com https://a.klaviyo.com https://*.klaviyo.com https://static.klaviyo.com https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://www.clarity.ms https://*.clarity.ms https://*.pushowl.com https://*.brevo.com https://*.sendinblue.com https://www.redditstatic.com https://*.reddit.com https://*.cloudfront.net https://*.doubleclick.net https://connect.facebook.net https://www.facebook.com https://*.merchant-center-analytics.goog https://*.sentry.io https://analytics.tiktok.com https://*.tiktok.com https://sc-static.net https://*.snapchat.com https://*.uppromote.com https://pixel.uppromote.com https://affiliate.mls.om",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.shopify.com https://shopify.com https://*.yotpo.com http://*.yotpo.com https://*.yotpo.xyz https://cdn.judge.me https://*.judge.me https://cdn.richpanel.com https://*.richpanel.com https://a.klaviyo.com https://*.klaviyo.com https://static.klaviyo.com https://www.googletagmanager.com https://*.googletagmanager.com https://www.google-analytics.com https://ssl.google-analytics.com https://www.clarity.ms https://*.clarity.ms https://*.pushowl.com https://*.brevo.com https://www.redditstatic.com https://*.reddit.com https://*.cloudfront.net https://*.doubleclick.net https://connect.facebook.net https://analytics.tiktok.com https://sc-static.net https://*.snapchat.com https://*.uppromote.com https://pixel.uppromote.com",
      "worker-src blob: 'self' https://*.yotpo.com http://*.yotpo.com https://*.yotpo.xyz https://*.pushowl.com",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: https: http: blob:",
      "media-src 'self' https: blob:",
      "connect-src 'self' https://cdn.shopify.com https://shopify.com https://*.myshopify.com http://localhost:* ws://localhost:* wss://localhost:* https://*.yotpo.com http://*.yotpo.com https://*.yotpo.xyz https://*.judge.me https://review-images.judge.me https://judgeme-public-images.imgix.net https://*.imgix.net https://cdn.richpanel.com https://*.richpanel.com https://a.klaviyo.com https://*.klaviyo.com https://static.klaviyo.com https://www.google-analytics.com https://ssl.google-analytics.com https://region1.google-analytics.com https://analytics.google.com https://stats.g.doubleclick.net https://*.doubleclick.net https://www.googletagmanager.com https://*.googletagmanager.com https://www.clarity.ms https://*.clarity.ms https://*.pushowl.com https://*.brevo.com https://*.sendinblue.com https://www.reddit.com https://alb.reddit.com https://*.reddit.com https://*.cloudfront.net https://www.facebook.com https://graph.facebook.com https://*.merchant-center-analytics.goog https://*.sentry.io https://*.google.com https://analytics.tiktok.com https://*.tiktok.com https://*.tiktok.us https://tr.snapchat.com https://*.snapchat.com https://*.uppromote.com https://pixel.uppromote.com https://affiliate.mls.om",
      "font-src 'self' https: data:",
      "frame-src https://www.youtube.com https://player.vimeo.com https://shopify.com https://*.yotpo.com http://*.yotpo.com https://*.yotpo.xyz https://maps.google.com https://www.google.com https://www.googletagmanager.com https://*.pushowl.com https://*.brevo.com https://*.doubleclick.net https://www.facebook.com",
    ].join("; ")
  );

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}

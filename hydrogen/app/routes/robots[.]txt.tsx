import type { LoaderFunctionArgs } from "@shopify/remix-oxygen";

const PRODUCTION_HOST = "mls.om";

const PRODUCTION_ROBOTS = `# MLS Oman headless storefront

User-agent: *
Disallow: /a/downloads/-/*
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account
Disallow: /82102026556/checkouts
Disallow: /82102026556/orders
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: */collections/*filter*&*filter*
Allow: /blogs/*+*
Allow: /blogs/*%2B*
Allow: /blogs/*%2b*
Allow: /*/blogs/*+*
Allow: /*/blogs/*%2B*
Allow: /*/blogs/*%2b*
Disallow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*
Disallow: /policies/
Disallow: /*/policies/
Disallow: /*/*?*ls=*&ls=*
Disallow: /*/*?*ls%3D*%3Fls%3D*
Disallow: /*/*?*ls%3d*%3fls%3d*
Disallow: /search
Disallow: /apple-app-site-association
Disallow: /.well-known/shopify/monorail
Disallow: /cdn/wpm/*.js
Disallow: /recommendations/products
Disallow: /*/recommendations/products
Disallow: /apps/
Disallow: /api/
Sitemap: https://mls.om/sitemap.xml

User-agent: adsbot-google
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /orders
Disallow: /82102026556/checkouts
Disallow: /82102026556/orders
Disallow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*
Disallow: /cdn/wpm/*.js

User-agent: Nutch
Disallow: /

User-agent: AhrefsBot
Crawl-delay: 10
Disallow: /a/downloads/-/*
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: */collections/*filter*&*filter*
Allow: /blogs/*+*
Allow: /blogs/*%2B*
Allow: /blogs/*%2b*
Allow: /*/blogs/*+*
Allow: /*/blogs/*%2B*
Allow: /*/blogs/*%2b*
Disallow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*
Disallow: /policies/
Disallow: /*/policies/
Disallow: /*/*?*ls=*&ls=*
Disallow: /*/*?*ls%3D*%3Fls%3D*
Disallow: /*/*?*ls%3d*%3fls%3d*
Disallow: /search
Disallow: /apple-app-site-association
Disallow: /.well-known/shopify/monorail
Disallow: /cdn/wpm/*.js
Sitemap: https://mls.om/sitemap.xml

User-agent: AhrefsSiteAudit
Crawl-delay: 10
Disallow: /a/downloads/-/*
Disallow: /admin
Disallow: /cart
Disallow: /orders
Disallow: /checkouts/
Disallow: /checkout
Disallow: /carts
Disallow: /account
Disallow: /collections/*sort_by*
Disallow: /*/collections/*sort_by*
Disallow: /collections/*+*
Disallow: /collections/*%2B*
Disallow: /collections/*%2b*
Disallow: /*/collections/*+*
Disallow: /*/collections/*%2B*
Disallow: /*/collections/*%2b*
Disallow: */collections/*filter*&*filter*
Allow: /blogs/*+*
Allow: /blogs/*%2B*
Allow: /blogs/*%2b*
Allow: /*/blogs/*+*
Allow: /*/blogs/*%2B*
Allow: /*/blogs/*%2b*
Allow: /*?*oseid=*
Disallow: /*preview_theme_id*
Disallow: /*preview_script_id*
Disallow: /policies/
Disallow: /*/policies/
Disallow: /*/*?*ls=*&ls=*
Disallow: /*/*?*ls%3D*%3Fls%3D*
Disallow: /*/*?*ls%3d*%3fls%3d*
Disallow: /search
Disallow: /apple-app-site-association
Disallow: /.well-known/shopify/monorail
Disallow: /cdn/wpm/*.js
Sitemap: https://mls.om/sitemap.xml

User-agent: MJ12bot
Crawl-delay: 10

User-agent: Pinterest
Crawl-delay: 1

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Claude-Web
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Anthropic-AI
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: YouBot
Allow: /

User-agent: cohere-ai
Allow: /

User-agent: Omgilibot
Allow: /

User-agent: FacebookBot
Allow: /

User-agent: Applebot
Allow: /

User-agent: Amazonbot
Allow: /

User-agent: Google-Extended
Allow: /
`;

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const isProduction = url.hostname === PRODUCTION_HOST || process.env.NODE_ENV === 'production';

  const body = isProduction
    ? PRODUCTION_ROBOTS
    : "User-agent: *\nDisallow: /";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}

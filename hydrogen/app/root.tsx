import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useNavigation,
  useLocation,
  useRouteError,
  useRouteLoaderData,
  isRouteErrorResponse,
} from "react-router";
import type { LinksFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { useEffect, useRef, lazy, Suspense } from "react";
import {
  useNonce,
  Analytics,
  getShopAnalytics,
  useAnalytics,
  sendShopifyAnalytics,
  AnalyticsEventName,
  getClientBrowserParameters,
  useShopifyCookies,
} from "@shopify/hydrogen";
import styles from "./styles.css?url";
import { pushDataLayer } from "./lib/dataLayer";
import mlsLogo from "./assets/mls-logo.png";
import mlsFavicon from "./assets/mls-favicon.png";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Header } from "./components/layout/Header";
const Footer = lazy(() => import("./components/layout/Footer").then((m) => ({ default: m.Footer })));
const CartDrawer = lazy(() => import("./components/layout/CartDrawer").then((m) => ({ default: m.CartDrawer })));
import { AnnouncementBar } from "./components/layout/AnnouncementBar";
// Lazy: the Quick Buy drawer is an overlay opened only on click, so code-splitting it keeps its
// JS out of the initial bundle (lower TBT) with no SSR/CLS impact — it's hidden until opened.
const QuickBuyDrawer = lazy(() =>
  import("./components/product/QuickBuyDrawer").then((m) => ({ default: m.QuickBuyDrawer })),
);
import { Toaster } from "./components/ui/sonner";
import { useCartSync } from "./hooks/useCartSync";
import { useCartStore } from "./stores/cartStore";
import { klaviyoAddedToCart, KlaviyoIdentify } from "./lib/klaviyo";
import { ShopifyPageView } from "./lib/shopifyAnalytics";
import { useLocaleStore, dirFor } from "./stores/localeStore";
import { detectLanguage } from "./lib/locale";
import { applyArImages } from "./lib/arImages";

const DEFAULT_FAVICON = "https://cdn.shopify.com/s/files/1/0821/0202/6556/files/MLS-favicon.png?v=1693298131";

export const links: LinksFunction = (args?: any) => {
  const favicon = args?.data?.faviconUrl || DEFAULT_FAVICON;
  return [
    { rel: "icon", type: "image/png", href: favicon },
    { rel: "apple-touch-icon", href: favicon },
  ];
};

// ── Nav types ────────────────────────────────────────────────────────────────
export interface NavLink {
  label: string;
  url: string;
  imageUrl?: string | null;
}

export interface NavColumn {
  title: string;
  url?: string | null;
  imageUrl?: string | null;
  links: NavLink[];
}

export interface NavEntry {
  id: string;
  label: string;
  url: string | null;
  imageUrl?: string | null;
  menu: string;
  position: number;
  columns: NavColumn[];
}

// ── Footer types ─────────────────────────────────────────────────────────────
export interface FooterLink {
  label: string;
  url: string;
}

export interface FooterSettings {
  companyName: string;
  brandText: string;
  instagramUrl: string;
  facebookUrl: string;
  twitterUrl: string;
  tiktokUrl: string;
  whatsappUrl: string;
  linkedinUrl: string;
  contactHeading: string;
  address: string;
  phone: string;
  email: string;
  copyright: string;
  bottomTagline: string;
  newsletterTitle: string;
  newsletterSubtitle: string;
  faviconUrl: string | null;
}

// ── GraphQL ───────────────────────────────────────────────────────────────────
const LAYOUT_QUERY = `#graphql
  fragment MenuFields on MenuItem {
    id title url type
    resource {
      ... on Collection {
        image { url altText }
      }
      ... on Product {
        featuredImage { url altText }
      }
    }
    items {
      id title url type
      resource {
        ... on Collection {
          image { url altText }
        }
        ... on Product {
          featuredImage { url altText }
        }
      }
      items {
        id title url type
        resource {
          ... on Collection {
            image { url altText }
          }
          ... on Product {
            featuredImage { url altText }
          }
        }
      }
    }
  }
  query LayoutData($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {

    # Row 1 = hydrogen-desktop: Hydrogen-owned menu (5 clean categories — Beef, Lamb & Mutton,
    # Poultry & Camel, Seasoned & Sauce, Value Boxes — each with full 2nd/3rd-level dropdowns
    # sourced from live). Editing this never affects the live mls.om theme (main-menu-1).
    mainMenu: menu(handle: "hydrogen-desktop") {
      items { ...MenuFields }
    }

    # Row 2 = secondary-menu (Customer Reviews, MLS Rewards, Refer a Friend, Make Money with MLS).
    secondaryMenu: menu(handle: "secondary-menu") {
      items { ...MenuFields }
    }

    mobileMenu: menu(handle: "mls-mobile-menu") {
      items { ...MenuFields }
    }

    # Mobile "Categories" tab = the same hydrogen-desktop menu, rendered as an accordion.
    mobileCategoriesMenu: menu(handle: "hydrogen-desktop") {
      items { ...MenuFields }
    }

    footerShop: menu(handle: "about-mls") {
      id title items { id title url }
    }

    footerHelp: menu(handle: "customer-care") {
      id title items { id title url }
    }

    navItemImages: metaobjects(type: "mls_nav_item_image", first: 50) {
      nodes {
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image { url altText }
            }
          }
        }
      }
    }

    mobileBanners: metaobjects(type: "mls_mobile_banner", first: 2) {
      nodes {
        id
        fields {
          key
          value
          reference {
            ... on MediaImage {
              image { url altText }
            }
          }
        }
      }
    }

  }
` as const;

const ADMIN_FOOTER_QUERY = `
  query {
    footerSettings: metaobjects(type: "mls_footer_settings", first: 1) {
      nodes {
        id
        fields {
          key value
          reference { ... on MediaImage { image { url } } }
        }
      }
    }
    announcementBar: metaobjects(type: "mls_announcement_bar", first: 1) {
      nodes { id fields { key value } }
    }
    cartDrawer: metaobjects(type: "mls_cart_drawer_config", first: 1) {
      nodes { id fields { key value } }
    }
    freeGiftRules: metaobjects(type: "mls_free_gift_rule", first: 20) {
      nodes { id fields { key value } }
    }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
const INTERNAL_HOSTS = new Set([
  'muscat-livestock.myshopify.com',
  'mls.om',
  'www.mls.om',
  'oman-stagging-8b5e8acd30e934a51e57.o2.myshopify.dev', // Oman Oxygen (staging/production) host
]);
function toPath(u: string): string {
  try {
    const parsed = new URL(u);
    if (!INTERNAL_HOSTS.has(parsed.hostname)) return u;
    // Shopify prepends a locale prefix (e.g. /ar/, /en/) when the admin menu is
    // fetched in a non-default language. Strip it — our routes have no locale prefix.
    const path = (parsed.pathname || "/").replace(/^\/[a-z]{2}(-[a-z]{2})?(\/|$)/i, "/");
    return path || "/";
  } catch { return u || "/"; }
}

// ── Nav parser — native Shopify Menu API ──────────────────────────────────────
// Level 1 → NavEntry  (top nav item, url, columns)
// Level 2 → NavColumn (mega-menu column header, links)  if it has children
//         → flat link added to a single unnamed column   if no children
// Level 3 → NavLink   (link inside column)
function parseShopifyMenu(menu: any, menuName = "main"): NavEntry[] {
  if (!menu?.items?.length) return [];
  return (menu.items as any[]).map((item: any, idx: number): NavEntry => {
    const hasColumns = item.items?.some((c: any) => c.items?.length > 0);
    let columns: NavColumn[] = [];
    if (hasColumns) {
      columns = item.items.map((col: any) => ({
        title: col.title,
        url: toPath(col.url) || null,
        imageUrl: col.resource?.image?.url ?? col.resource?.featuredImage?.url ?? null,
        links: (col.items ?? []).map((lk: any): NavLink => ({
          label: lk.title,
          url: toPath(lk.url),
          imageUrl: lk.resource?.image?.url ?? lk.resource?.featuredImage?.url ?? null,
        })),
      }));
    } else if (item.items?.length > 0) {
      columns = [{ title: "", url: null, imageUrl: null, links: item.items.map((lk: any): NavLink => ({
        label: lk.title,
        url: toPath(lk.url),
        imageUrl: lk.resource?.image?.url ?? lk.resource?.featuredImage?.url ?? null,
      })) }];
    }
    const imageUrl = item.resource?.image?.url ?? item.resource?.featuredImage?.url ?? null;
    return { id: item.id, label: item.title, url: toPath(item.url), imageUrl, menu: menuName, position: idx, columns };
  });
}

// ── Footer parsers ────────────────────────────────────────────────────────────
function parseFooterSettings(nodes: any[]): FooterSettings | null {
  const node = nodes[0];
  if (!node) return null;
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  return {
    companyName:    f.company_name?.value     ?? "",
    brandText:      f.brand_text?.value       ?? "",
    instagramUrl:   f.instagram_url?.value    ?? "",
    facebookUrl:    f.facebook_url?.value    ?? "",
    twitterUrl:     f.twitter_url?.value     ?? "",
    tiktokUrl:      f.tiktok_url?.value      ?? "",
    whatsappUrl:    f.whatsapp_url?.value    ?? "",
    linkedinUrl:    f.linkedin_url?.value    ?? "",
    contactHeading: f.contact_heading?.value ?? "",
    address:        f.address?.value         ?? "",
    phone:          f.phone?.value           ?? "",
    email:          f.email?.value           ?? "",
    copyright:      f.copyright?.value       ?? "",
    bottomTagline:  f.bottom_tagline?.value  ?? "",
    newsletterTitle:    f.newsletter_title?.value    ?? "Want discounts?",
    newsletterSubtitle: f.newsletter_subtitle?.value ?? "Subscribe to our newsletter and get 10% off your first purchase!",
    faviconUrl:     f.favicon?.reference?.image?.url ?? null,
  };
}

function parseCartDrawerConfig(nodes: any[]) {
  const node = nodes[0];
  if (!node) return { freeShippingThreshold: 350, deliveryItems: [], freeGiftSubVariantId: "", freeGiftCarVariantId: "" };
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  return {
    freeShippingThreshold: parseInt(f.free_shipping_threshold?.value ?? "350", 10) || 350,
    deliveryItems: [
      f.delivery_item_1?.value, f.delivery_item_2?.value, f.delivery_item_3?.value,
      f.delivery_item_4?.value, f.delivery_item_5?.value, f.delivery_item_6?.value,
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0),
    freeGiftSubVariantId: f.free_gift_subscription_variant_id?.value ?? "",
    freeGiftCarVariantId: f.free_gift_carcass_variant_id?.value ?? "",
  };
}

// Parse mls_free_gift_rule metaobjects into the cart's free-gift rule engine input.
function parseFreeGiftRules(nodes: any[]) {
  return (nodes ?? [])
    .map((n: any) => {
      const f = Object.fromEntries((n.fields ?? []).map((x: any) => [x.key, x.value]));
      if (f.enabled !== "true") return null;
      const variantId = (f.free_variant ?? "") as string;
      if (!variantId) return null;
      const scope =
        f.subtotal_scope === "matched_items" || f.subtotal_scope === "subscription_items"
          ? f.subtotal_scope
          : "cart_total";
      return {
        variantId,
        // Both match_titles and match_variants are newline-separated substrings (lowercased). A line
        // item qualifies when its product title contains a matchTitles entry OR its variant title / ID
        // matches a matchVariants entry.
        matchTitles: ((f.match_titles ?? "") as string)
          .split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean),
        matchVariants: ((f.match_variants ?? "") as string)
          .split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean),
        minSubtotal: parseFloat(f.min_subtotal ?? "0") || 0,
        subtotalScope: scope as "cart_total" | "matched_items" | "subscription_items",
        requireSubscription: f.require_subscription === "true",
      };
    })
    .filter(Boolean);
}

function parseAnnouncementMessages(nodes: any[]): { messages: string[]; scrollSeconds: number | null } {
  const node = nodes[0];
  if (!node) return { messages: [], scrollSeconds: null };
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
  const messages = [
    f.message_1?.value, f.message_2?.value, f.message_3?.value,
    f.message_4?.value, f.message_5?.value,
  ].filter((m): m is string => typeof m === "string" && m.trim().length > 0);
  // scroll_seconds: higher = slower. Clamp to a sane range; null = use the CSS default (25s).
  const raw = parseInt(f.scroll_seconds?.value ?? "", 10);
  const scrollSeconds = Number.isFinite(raw) && raw > 0 ? Math.min(120, Math.max(5, raw)) : null;
  return { messages, scrollSeconds };
}

export interface MobileMenuSubItem {
  id: string;
  title: string;
  url: string;
}

export interface MobileMenuItem {
  id: string;
  title: string;
  url: string;
  imageUrl: string | null;
  subItems: MobileMenuSubItem[];
}

export interface MobileMenuTab {
  label: string;
  // Language-stable English label, populated in AR so tab identity (e.g. "Categories")
  // can be detected without depending on the translated `label`.
  enLabel?: string;
  items: MobileMenuItem[];
}

function parseMobileMenu(menuData: any): MobileMenuTab[] {
  if (!menuData?.items?.length) return [];
  return menuData.items.map((tab: any) => ({
    label: tab.title as string,
    items: (tab.items ?? []).map((item: any) => ({
      id: item.id as string,
      title: item.title as string,
      url: toPath(item.url),
      imageUrl: (item.resource?.image?.url ?? null) as string | null,
      subItems: (item.items ?? []).map((sub: any) => ({
        id: sub.id as string,
        title: sub.title as string,
        url: toPath(sub.url),
      })),
    })),
  }));
}

export interface MobileBanner {
  id: string;
  imageUrl: string;
  url: string;
  altText: string;
  heading: string;
  highlight: string;
  ctaText: string;
}

function parseMobileBanners(nodes: any[]): MobileBanner[] {
  return nodes
    .map((node: any) => {
      const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));
      const imageUrl: string | undefined = f.image?.reference?.image?.url;
      if (!imageUrl) return null;
      return {
        id: node.id as string,
        imageUrl,
        url: (f.url?.value ?? "/") as string,
        altText: (f.image?.reference?.image?.altText ?? "") as string,
        heading: (f.heading?.value ?? "") as string,
        highlight: (f.highlight?.value ?? "") as string,
        ctaText: (f.cta_text?.value ?? "Shop Now") as string,
      };
    })
    .filter((b): b is MobileBanner => b !== null);
}

function parseNavItemImages(nodes: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const node of nodes ?? []) {
    const fields = Object.fromEntries((node.fields ?? []).map((f: any) => [f.key, f]));
    const label: string = fields.nav_label?.value?.trim();
    const imageUrl: string | undefined = fields.image?.reference?.image?.url;
    if (label && imageUrl) map[label] = imageUrl;
  }
  return map;
}

// English-context helper: nav menus and nav-image metaobjects are translated
// independently, so their Arabic strings don't match for the label-based image lookup.
// Menu item IDs are stable across languages, so in AR we fetch the English labels +
// images here and resolve each top-level entry's image by ID. EN-only need, see loader.
const NAV_EN_HELPER_QUERY = `#graphql
  query NavEnHelper($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    mobileCategoriesMenu: menu(handle: "hydrogen-desktop") {
      items { id title }
    }
    mobileMenu: menu(handle: "mls-mobile-menu") {
      items { id title items { id title } }
    }
    navItemImages: metaobjects(type: "mls_nav_item_image", first: 50) {
      nodes { fields { key value reference { ... on MediaImage { image { url altText } } } } }
    }
  }
` as const;

// Skip re-fetching root layout data on every client navigation.
// Menus, footer, and announcement bar rarely change — initial data is reused for the session.
export function shouldRevalidate({ currentUrl, nextUrl }: ShouldRevalidateFunctionArgs) {
  // Only revalidate when navigating back to the root itself (e.g. after a form action)
  return currentUrl.pathname === nextUrl.pathname;
}

// ── Loader ────────────────────────────────────────────────────────────────────
export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);

  // Shopify storefront analytics — WITHOUT this <Analytics.Provider> feed, Shopify's own
  // dashboards (sessions, online-store conversion, traffic sources) stay empty on a headless
  // store because nothing sends page_view/product_view to Shopify's Monorail endpoint. Both are
  // returned in the success AND catch paths so analytics survives a menu/query failure. `shop` is
  // a promise (streamed); the provider awaits it. This is independent of the GTM/ad-pixel setup.
  const shop = getShopAnalytics({
    storefront: context.storefront,
    publicStorefrontId: context.env.PUBLIC_STOREFRONT_ID,
  });
  // The Customer Privacy API writes the visitor-consent cookie on the ROOT of checkoutDomain.
  // The env value (muscat-livestock.myshopify.com) has root .myshopify.com, which the live site
  // (mls.om) can't read back — so the API reports "failed" and analytics runs degraded. On the
  // production domain the Shopify-served checkout is checkout.mls.om (root .mls.om, shared with the
  // storefront), so consent persists correctly. Fall back to the env value on staging/preview.
  const reqHost = new URL(request.url).hostname;
  const consentCheckoutDomain = /(^|\.)mls\.om$/i.test(reqHost)
    ? "checkout.mls.om"
    : context.env.PUBLIC_CHECKOUT_DOMAIN;
  const consent = {
    checkoutDomain: consentCheckoutDomain,
    storefrontAccessToken: context.env.PUBLIC_STOREFRONT_API_TOKEN,
    // Docs default + recommended for headless (Shopify useCustomerPrivacy reference). Loads
    // Shopify's native consent script. With privacy-settings automation ON in admin, Shopify
    // auto-grants consent where no banner is required (Oman) and fires visitorConsentCollected —
    // which is what flips the analytics subscriber "ready" so page_view/product_view actually
    // flush to Monorail. Previously false, which relied on an onReady path that never fired on the
    // custom domain → zero beacons.
    withPrivacyBanner: true,
    // mls.om is a custom domain, NOT a Shopify Storefront-API proxy, so force the consent API to
    // use the checkout domain (checkout.mls.om) rather than same-origin (which hits Oxygen → fails).
    sameDomainForStorefrontApi: false,
    country: "OM" as const,
    language,
  };

  try {
    const [data, adminData] = await Promise.all([
      context.storefront.query(LAYOUT_QUERY, {
        variables: { language, country: "OM" as const },
        cache: context.storefront.CacheShort(),
      }),
      context.adminFetch(ADMIN_FOOTER_QUERY),
    ]);
    // In Arabic, swap any image field for its `*_ar` counterpart where set (mobile banners,
    // nav images, etc.). English is untouched; empty `*_ar` falls back to the default image.
    if (language === "AR") { applyArImages(data); applyArImages(adminData); }
    // Header draws two rows: mainMenu (row 1, category dropdowns) + secondaryMenu (row 2, links).
    const mainMenu               = parseShopifyMenu(data?.mainMenu,              "main");
    const secondaryMenu          = parseShopifyMenu(data?.secondaryMenu,         "secondary");
    const mobileCategoriesMenu   = parseShopifyMenu(data?.mobileCategoriesMenu,  "mobile-cat");
    const footerSettings = parseFooterSettings(adminData?.footerSettings?.nodes ?? []);
    const announcement = parseAnnouncementMessages(adminData?.announcementBar?.nodes ?? []);
    const announcementMessages = announcement.messages;
    const announcementScrollSeconds = announcement.scrollSeconds;
    const cartDrawerConfig = {
      ...parseCartDrawerConfig(adminData?.cartDrawer?.nodes ?? []),
      freeGiftRules: parseFreeGiftRules(adminData?.freeGiftRules?.nodes ?? []),
    };

    function menuToCol(menu: any): { heading: string; links: FooterLink[] } | null {
      if (!menu?.items?.length) return null;
      const heading = (menu.title as string).replace(/^footer\s+/i, "").trim();
      return {
        heading,
        links: menu.items.map((item: any) => ({ label: item.title, url: toPath(item.url) })),
      };
    }

    const footerMenuCols = [
      menuToCol(data?.footerShop),
      menuToCol(data?.footerHelp),
    ].filter((c): c is { heading: string; links: FooterLink[] } => c !== null);

    const navItemImages = parseNavItemImages(data?.navItemImages?.nodes ?? []);
    const mobileBanners = parseMobileBanners(data?.mobileBanners?.nodes ?? []);
    const mobileMenu = parseMobileMenu(data?.mobileMenu);

    // In Arabic, nav-image labels and menu titles are translated independently and don't
    // match, so the label-based image lookup fails. Resolve top-level entry images by the
    // language-stable menu item ID via the English labels instead. Non-fatal.
    if (language === "AR") {
      try {
        const en = await context.storefront.query(NAV_EN_HELPER_QUERY, {
          variables: { language: "EN" as const, country: "OM" as const },
          cache: context.storefront.CacheShort(),
        });
        const idToEnLabel: Record<string, string> = {};
        for (const it of (en as any)?.mobileCategoriesMenu?.items ?? []) idToEnLabel[it.id] = it.title;
        for (const tab of (en as any)?.mobileMenu?.items ?? [])
          for (const it of tab.items ?? []) idToEnLabel[it.id] = it.title;
        // Tag each tab with its English label (same menu, same order across languages)
        // so the UI can identify the Categories tab regardless of translation.
        const enTabs: any[] = (en as any)?.mobileMenu?.items ?? [];
        mobileMenu.forEach((tab, i) => { tab.enLabel = enTabs[i]?.title; });
        const enNavImages = parseNavItemImages((en as any)?.navItemImages?.nodes ?? []);
        const imgFor = (id: string): string | null => enNavImages[idToEnLabel[id]] ?? null;
        for (const entry of mobileCategoriesMenu) {
          const img = imgFor(entry.id);
          if (img) entry.imageUrl = img;
        }
        for (const tab of mobileMenu)
          for (const item of tab.items) {
            const img = imgFor(item.id);
            if (img) item.imageUrl = img;
          }
      } catch (e) {
        console.error("[root loader] AR nav image resolve failed", e);
      }
    }

    const faviconUrl = footerSettings?.faviconUrl ?? null;
    return { mainMenu, secondaryMenu, mobileMenu, mobileCategoriesMenu, footerSettings, footerMenuCols, announcementMessages, announcementScrollSeconds, cartDrawerConfig, navItemImages, mobileBanners, faviconUrl, locale: (language === "AR" ? "ar" : "en") as "ar" | "en", shop, consent };
  } catch (e) {
    console.error("[root loader]", e);
    return {
      mainMenu: [] as NavEntry[],
      secondaryMenu: [] as NavEntry[],
      footerSettings: null as FooterSettings | null,
      footerMenuCols: [] as { heading: string; links: FooterLink[] }[],
      announcementMessages: [] as string[],
      announcementScrollSeconds: null as number | null,
      cartDrawerConfig: { freeShippingThreshold: 350, deliveryItems: [], freeGiftSubVariantId: "", freeGiftCarVariantId: "", freeGiftRules: [] },
      navItemImages: {} as Record<string, string>,
      mobileBanners: [] as MobileBanner[],
      mobileMenu: [] as MobileMenuTab[],
      mobileCategoriesMenu: [] as NavEntry[],
      faviconUrl: null as string | null,
      locale: "en" as "ar" | "en",
      shop,
      consent,
    };
  }
}

// ── App shell ─────────────────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
});

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useNonce();
  const loaderData = useRouteLoaderData<typeof loader>("root");
  const locale = loaderData?.locale ?? "en";
  const dir = locale === "ar" ? "rtl" : "ltr";

  // hreflang alternates for every page — English at /path, Arabic at /ar/path, so Google serves
  // the right language per market. Computed from the current path (query strings stripped).
  const location = useLocation();
  const basePath = (location.pathname || "/").replace(/^\/ar(?=\/|$)/, "") || "/";
  const enHref = `https://mls.om${basePath}`;
  const arHref = `https://mls.om/ar${basePath === "/" ? "" : basePath}`;
  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        {/* charset + viewport FIRST (within the first 1KB of HTML) so the browser never re-parses */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {/* Connect early to the CDNs the page depends on: images, and the web fonts a 3rd-party
            app injects (those show up in the critical path, so a preconnect speeds them up) */}
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="anonymous" />
        {/* Critical CSS — inlined before external stylesheet so variables apply on first paint */}
        <style dangerouslySetInnerHTML={{ __html: `
          :root{--radius:.5rem;--crimson:oklch(0.36 0.18 27);--rich-red:oklch(0.52 0.21 28);--off-white:oklch(0.985 0.005 80);--bone:oklch(0.96 0.008 80);--charcoal:oklch(0.18 0.005 240);--charcoal-foreground:oklch(0.985 0.005 60);--gold:oklch(0.74 0.11 80);--background:var(--off-white);--foreground:var(--charcoal);--card:oklch(1 0 0);--card-foreground:var(--charcoal);--border:oklch(0.9 0.008 80);--muted:oklch(0.94 0.006 80);--muted-foreground:oklch(0.45 0.01 60);}
          *,::before,::after{box-sizing:border-box}
          body{margin:0;background-color:var(--background);color:var(--foreground);font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
          a{color:inherit;text-decoration:none}
        ` }} />
        {/* Stylesheet via direct <link> with suppressHydrationWarning — prevents Vite dev-mode
            from adding a ?t= timestamp that mismatches the SSR-rendered href and triggers a
            full hydration failure + client re-render cascade */}
        <link rel="preload" as="style" href={styles} suppressHydrationWarning />
        <link rel="stylesheet" href={styles} suppressHydrationWarning />
        {/* Inline script — sets lang/dir from cookie before React paints, eliminating Arabic flash */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)lang=([a-z]{2})/);if(m&&m[1]==='ar'){document.documentElement.lang='ar';document.documentElement.dir='rtl';}}catch(e){}})();` }} />
        {/* No hardcoded <meta name="description"> here — each route's meta owns it (a static
            one would duplicate and override the per-page description for SEO). */}
        {/* Site-wide social tags (match the live site). The real page title and per-page
            og:title/description/image come from each route's meta via <Meta/> below.
            (No hardcoded <title> here — it would duplicate the route title.) */}
        <meta property="og:site_name" content="MLS Oman" />
        <meta property="og:locale" content={locale === "ar" ? "ar_AR" : "en_US"} />
        <meta name="twitter:card" content="summary_large_image" />
        {/* hreflang alternates (site-wide) */}
        <link rel="alternate" hrefLang="en" href={enHref} />
        <link rel="alternate" hrefLang="ar" href={arHref} />
        <link rel="alternate" hrefLang="x-default" href={enHref} />
        <Meta />
        {/* ── EARLY SESSION BEACON ──────────────────────────────────────────────────
            Shopify counts a Session from trekkie_storefront_page_view. Hydrogen's SDK only
            sends it AFTER React hydrates — measured ~4.3s on this store — so every visitor
            who leaves before that was NEVER counted. The old Liquid theme pinged instantly
            from HTML, which is why it recorded 2,983 sessions/day (10.22% conv) vs Hydrogen's
            225 (28.88% conv) — a ~3x undercount, confirmed by that same-store comparison.

            This fires the SAME two events the SDK sends (payload copied verbatim from a live
            SDK request), from the <head>, in ~200ms — so bounces are counted like on the theme.
            <ShopifyPageView/> then SKIPS this page (window.__mlsEarlyPV) to avoid a double, but
            still fires if this ever fails (fetch .catch clears the flag) → a session can't be lost,
            and it keeps handling SPA navigations.
            PLACEMENT IS LOAD-BEARING: it must stay AFTER <Meta/> (needs document.title) and
            BEFORE <Links/>. Browsers block inline-script execution until preceding stylesheets
            load — with this after <Links/> the beacon fired at 3.4s instead of ~0.2s, which
            defeats the whole point. Do not move it below <Links/>.
            Speed: ~2KB inline, runs <1ms, fetch is async + keepalive → no render blocking. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{
var Y='_shopify_y',S='_shopify_s';
function ht(){var d=new Date().getTime()>>>0,p=0;try{p=performance.now()>>>0}catch(e){}return Math.abs(d+p).toString(16).toLowerCase().padStart(8,'0')}
function uuid(){var t='xxxx-4xxx-xxxx-xxxxxxxxxxxx',h='';try{var a=new Uint16Array(31);window.crypto.getRandomValues(a);var i=0;h=t.replace(/[x]/g,function(c){var r=a[i]%16,v=c==='x'?r:(r&3|8);i++;return v.toString(16)}).toUpperCase()}catch(e){h=t.replace(/[x]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16)}).toUpperCase()}return ht()+'-'+h}
function gc(n){var c=document.cookie.split('; ');for(var i=0;i<c.length;i++){if(c[i].indexOf(n+'=')===0)return decodeURIComponent(c[i].slice(n.length+1))}return ''}
var host=location.hostname,dom=(host==='mls.om'||host.slice(-7)==='.mls.om')?'; domain=.mls.om':'';
function sc(n,v,a){document.cookie=n+'='+v+'; path=/; max-age='+a+dom+'; samesite=lax'+(location.protocol==='https:'?'; secure':'')}
var y=gc(Y)||uuid(),s=gc(S)||uuid();
sc(Y,y,31536000);sc(S,s,1800);
function pt(p){if(p==='/ar'||p.indexOf('/ar/')===0){p=p.slice(3)||'/'}
if(p==='/')return 'index';
if(p.indexOf('/products/')===0)return 'product';
if(p==='/collections')return 'list-collections';
if(p.indexOf('/collections/')===0)return 'collection';
if(p.indexOf('/search')===0)return 'search';
var g=p.split('/');var seg=[];for(var i=0;i<g.length;i++){if(g[i])seg.push(g[i])}
if(seg[0]==='blogs')return seg.length>=3?'article':'blog';
if(p==='/cart')return 'cart';
if(p.indexOf('/policies/')===0)return 'policy';
if(p.indexOf('/account')===0)return 'customers/account';
return 'page'}
var now=Date.now(),u=location.href,ref=document.referrer||'';
var body={events:[
{schema_id:'trekkie_storefront_page_view/1.4',payload:{appClientId:'6167201',isMerchantRequest:false,hydrogenSubchannelId:'1000153258',isPersistentCookie:true,uniqToken:y,visitToken:s,microSessionId:uuid(),microSessionCount:1,url:u,path:location.pathname,search:location.search,referrer:ref,title:document.title||'',shopId:28537323629,currency:'OMR',contentLanguage:'${locale === "ar" ? "AR" : "EN"}',pageType:pt(location.pathname)},metadata:{event_created_at_ms:now}},
{schema_id:'custom_storefront_customer_tracking/1.2',payload:{source:'hydrogen',asset_version_id:'2026.4.2',hydrogenSubchannelId:'1000153258',is_persistent_cookie:true,deprecated_visit_token:s,unique_token:y,event_time:now,event_id:uuid(),event_source_url:u,referrer:ref,user_agent:navigator.userAgent,navigation_type:'navigate',navigation_api:'PerformanceNavigationTiming',shop_id:28537323629,currency:'OMR',ccpa_enforced:false,gdpr_enforced:false,gdpr_enforced_as_string:'false',analytics_allowed:true,marketing_allowed:true,sale_of_data_allowed:true,event_name:'page_rendered',canonical_url:u},metadata:{event_created_at_ms:now}}
],metadata:{event_sent_at_ms:now}};
window.__mlsEarlyPV=location.pathname+location.search;
fetch('https://monorail-edge.shopifysvc.com/unstable/produce_batch',{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body),keepalive:true}).then(function(r){if(!r||!r.ok){window.__mlsEarlyPV=null;return}return r.text().then(function(t){if(t&&(t.indexOf('"status":4')>-1||t.indexOf('"status":5')>-1))window.__mlsEarlyPV=null}).catch(function(){})}).catch(function(){window.__mlsEarlyPV=null});
}catch(e){}})();` }} />
        <Links />
        {/* Google Tag Manager */}
        {/* GTM — dataLayer queue is created immediately (events are never lost), but the heavy
            gtm.js loads on first interaction OR a 4s fallback (guaranteed), keeping it off the
            critical path. The Meta/TikTok/Snapchat ad pixels below are NOT deferred. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(w,d){w.dataLayer=w.dataLayer||[];w.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});var done=false,t;function L(){var j=d.createElement('script');j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id=GTM-MNFBCW5';d.head.appendChild(j);}var evts=['scroll','touchstart','mousedown','keydown','mousemove'];function R(){if(done)return;done=true;clearTimeout(t);evts.forEach(function(e){w.removeEventListener(e,R)});L();}evts.forEach(function(e){w.addEventListener(e,R,{passive:true})});t=setTimeout(R,15000);})(window,document);` }} />
        {/* GA4 ecommerce — headless storefront. GTM (above) sends page_view to GA4 (G-TMJJERF7PS)
            but has no ecommerce event tags, so view_item/add_to_cart never reached GA4. We load an
            ISOLATED gtag (its own dataLayer 'mlsGa4dl', send_page_view:false so it can NOT double the
            GTM page_view) and forward the ecommerce events to it from dataLayer.ts (fireGA4). Shares
            the _ga cookie with GTM's GA4 → same session, no split. Exposed as window.__mlsGtag. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){window.mlsGa4dl=window.mlsGa4dl||[];function gtag(){window.mlsGa4dl.push(arguments);}window.__mlsGtag=gtag;gtag('js',new Date());gtag('config','G-TMJJERF7PS',{send_page_view:false});var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=G-TMJJERF7PS&l=mlsGa4dl';document.head.appendChild(s);})();` }} />
        {/* ── Ad pixels (Meta / TikTok / Snapchat) ──────────────────────────────────
             Now wired via the <MarketingPixels/> component (injected after hydration, like the
             UAE site). At go-live, just fill the Oman IDs in the PIXEL_IDS constant near App() —
             each pixel stays OFF until its ID is set (no UAE IDs are used). ── */}
        {/* Klaviyo — proxy stub so klaviyo.push() is safe before SDK loads */}
        <script dangerouslySetInnerHTML={{ __html: `!function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise((function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();` }} />
        {/* Klaviyo Onsite JS — load on interaction (8s fallback) */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function L(){var s=document.createElement("script");s.async=true;s.src="https://static.klaviyo.com/onsite/js/SC5Mtp/klaviyo.js";document.head.appendChild(s);}var done=false;function run(){if(done)return;done=true;EVTS.forEach(function(e){window.removeEventListener(e,run)});clearTimeout(t);L();}var EVTS=["scroll","touchstart","mousedown","keydown","mousemove"];EVTS.forEach(function(e){window.addEventListener(e,run,{passive:true,once:true})});var t=setTimeout(run,8000);})();` }} />
        {/* Microsoft Clarity (Oman project w4bzbv3psg) — load on interaction (10s fallback) */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function L(){(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","w4bzbv3psg");}var done=false;function run(){if(done)return;done=true;EVTS.forEach(function(e){window.removeEventListener(e,run)});clearTimeout(t);L();}var EVTS=["scroll","touchstart","mousedown","keydown","mousemove"];EVTS.forEach(function(e){window.addEventListener(e,run,{passive:true,once:true})});var t=setTimeout(run,10000);})();` }} />
        {/* PushOwl + Brevo — web push notifications */}
        {/* Shim window.Shopify so PushOwl can identify the store in headless mode */}
        <script dangerouslySetInnerHTML={{ __html: `window.Shopify=window.Shopify||{};window.Shopify.shop=window.Shopify.shop||'muscat-livestock.myshopify.com';` }} />
        {/* PushOwl/Brevo — load on interaction (12s fallback) */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function L(){var s=document.createElement("script");s.async=true;s.src="https://cdn.shopify.com/extensions/019ef94d-e41a-7e61-9259-faf6609a0254/pushowl-306/assets/pushowl-shopify.js";document.head.appendChild(s);}var done=false;function run(){if(done)return;done=true;EVTS.forEach(function(e){window.removeEventListener(e,run)});clearTimeout(t);L();}var EVTS=["scroll","touchstart","mousedown","keydown","mousemove"];EVTS.forEach(function(e){window.addEventListener(e,run,{passive:true,once:true})});var t=setTimeout(run,12000);})();` }} />
        {/* UpPromote Affiliate (by Secomapp) — the Oman store's affiliate/referral app.
            Replaces Social Snowball (which was the UAE store's app). Referral param: sca_ref. */}
        {/* Customer-referral widget (theme-app-extension asset the live mls.om theme uses). */}
        <link rel="stylesheet" href="https://cdn.shopify.com/extensions/019f02b6-22fe-7246-a7bb-fa2e477ed7f6/affliate-by-secomapp-119/assets/customer-referral.css" />
        <script defer src="https://cdn.shopify.com/extensions/019f02b6-22fe-7246-a7bb-fa2e477ed7f6/affliate-by-secomapp-119/assets/customer-referral.js" />
        {/* Affiliate conversion pixel — reads the sca_ref referral and attributes orders. */}
        <script async src="https://pixel.uppromote.com/collect/v1/collect?shop=muscat-livestock.myshopify.com" />
      </head>
      <body>
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MNFBCW5"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="GTM"
          />
        </noscript>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

function CartSyncWrapper() {
  useCartSync();
  return null;
}

function loadOnInteraction(fn: () => void, fallbackMs: number) {
  let done = false;
  function run() {
    if (done) return;
    done = true;
    EVTS.forEach((e) => window.removeEventListener(e, run));
    clearTimeout(t);
    fn();
  }
  const EVTS = ["scroll", "touchstart", "mousedown", "keydown", "mousemove"] as const;
  EVTS.forEach((e) => window.addEventListener(e, run, { passive: true, once: true }));
  const t = setTimeout(run, fallbackMs);
}

function RichpanelWidget() {
  useEffect(() => {
    if ((window as any).richpanel?.loaded) return;
    const w = window as any;
    w.richpanel = w.richpanel || [];
    w.richpanel.q = [];
    const methods = ["track", "debug", "atr"];
    const stub = (m: string) => (...args: any[]) => w.richpanel.q.push([m, ...args]);
    methods.forEach((m) => { w.richpanel[m] = stub(m); });
    w.richpanel.load = (clientId: string) => {
      const s = document.createElement("script");
      s.type = "text/javascript";
      s.async = true;
      s.src = `https://cdn.richpanel.com/js/richpanel-root.js?appClientId=${clientId}`;
      document.head.appendChild(s);
    };
    w.richpanel.ensure_rpuid = "";
    function load() {
      w.richpanel.load("mlslive1881");
      w.richpanel.loaded = true;
    }
    loadOnInteraction(load, 10000);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.id = "rp-hide-style";
    // Hide when footer is visible
    // Hide when any drawer/sheet overlay is open (data-state=open on the radix overlay or sheet)
    style.textContent = `
      .rp-hide-near-footer #richpanel-root,
      .rp-hide-near-footer #rp-messenger-container,
      .rp-hide-near-footer [id^="richpanel"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transition: opacity 0.2s;
      }
      body.rp-drawer-open #richpanel-root,
      body.rp-drawer-open #rp-messenger-container,
      body.rp-drawer-open [id^="richpanel"],
      body.rp-drawer-open iframe[src*="richpanel"],
      body.rp-drawer-open iframe[id*="richpanel"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // Hide on footer scroll
    const onScroll = () => {
      const footer = document.querySelector("footer");
      if (!footer) return;
      const footerTop = footer.getBoundingClientRect().top;
      document.body.classList.toggle("rp-hide-near-footer", footerTop < window.innerHeight * 0.85);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Hide when any drawer/sheet is open — watch for radix data-state attribute changes
    const mo = new MutationObserver(() => {
      const drawerOpen = !!document.querySelector(
        '[role="dialog"][data-state="open"], [data-radix-dialog-content][data-state="open"]'
      );
      document.body.classList.toggle("rp-drawer-open", drawerOpen);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });

    return () => {
      window.removeEventListener("scroll", onScroll);
      mo.disconnect();
      style.remove();
    };
  }, []);

  return null;
}

function PageLoader() {
  const navigation = useNavigation();
  const { faviconUrl, locale } = useLoaderData<typeof loader>();
  const loading = navigation.state !== "idle";
  const iconSrc = faviconUrl || DEFAULT_FAVICON;
  const isAr = locale === "ar";

  return (
    <>
      <style>{`
        @keyframes _mls-drop {
          0%   { opacity: 0; transform: translateY(-48px) scale(1.4); }
          55%  { opacity: 1; transform: translateY(6px)  scale(0.96); }
          75%  { transform: translateY(-3px) scale(1.01); }
          100% { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes _mls-bar {
          0%   { transform: scaleX(0); opacity: 0; transform-origin: left; }
          100% { transform: scaleX(1); opacity: 1; transform-origin: left; }
        }
        @keyframes _mls-tag {
          0%   { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes _mls-logo {
          0%   { opacity: 0; transform: scale(0.7); }
          60%  { transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes _mls-dot {
          0%, 80%, 100% { transform: scale(0.55); opacity: 0.3; }
          40%           { transform: scale(1);    opacity: 1; }
        }
      `}</style>
      <div
        aria-hidden
        className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center transition-opacity ${
          loading ? "opacity-100 duration-150" : "opacity-0 duration-300 pointer-events-none"
        }`}
        style={{ background: "rgba(255,255,255,0.97)", backdropFilter: "blur(18px)" }}
      >
        {/* Logo */}
        <div style={{ animation: "_mls-logo 0.4s ease-out 0s both", marginBottom: 28 }}>
          <img src={iconSrc} alt="" style={{ height: 104, width: "auto", objectFit: "contain" }} />
        </div>

        {isAr ? (
          /* Arabic: مسقط → للمواشي sequential drop-bounce */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, lineHeight: 1.15, direction: "rtl" }}>
            {(["مسقط", "للمواشي"] as const).map((word, i) => (
              <span
                key={word}
                style={{
                  display: "block",
                  fontSize: i === 0 ? 72 : 52,
                  fontWeight: 900,
                  color: "oklch(0.18 0.005 240)",
                  fontFamily: "var(--font-display, 'Georgia', serif)",
                  animation: `_mls-drop 0.48s cubic-bezier(0.22,1,0.36,1) ${0.12 + i * 0.28}s both`,
                }}
              >{word}</span>
            ))}
          </div>
        ) : (
          /* English: M → L → S sequential drop-bounce */
          <div style={{ display: "flex", alignItems: "baseline", gap: 2, lineHeight: 1 }}>
            {(["M", "L", "S"] as const).map((letter, i) => (
              <span
                key={letter}
                style={{
                  display: "block",
                  fontSize: 88,
                  fontWeight: 900,
                  letterSpacing: "-0.05em",
                  color: "oklch(0.18 0.005 240)",
                  fontFamily: "var(--font-display, 'Georgia', serif)",
                  animation: `_mls-drop 0.48s cubic-bezier(0.22,1,0.36,1) ${0.12 + i * 0.28}s both`,
              }}
            >{letter}</span>
            ))}
          </div>
        )}

        {/* Crimson line sweeps after last item lands */}
        <div style={{
          height: 3,
          width: isAr ? 168 : 110,
          background: "oklch(0.36 0.18 27)",
          borderRadius: 9999,
          transformOrigin: "left center",
          marginTop: 8,
          animation: `_mls-bar 0.35s ease-out ${isAr ? "0.84s" : "1.0s"} both`,
        }} />

        {/* Tagline */}
        <p style={{
          marginTop: 12,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: isAr ? "0.08em" : "0.32em",
          color: "oklch(0.18 0.005 240 / 0.35)",
          textTransform: isAr ? "none" : "uppercase",
          direction: isAr ? "rtl" : "ltr",
          animation: `_mls-tag 0.35s ease-out ${isAr ? "1.04s" : "1.2s"} both`,
        }}>{isAr ? "100% طازج وحلال" : "100% Fresh & Halal"}</p>

        {/* Staggered crimson dots */}
        <div style={{ display: "flex", gap: 7, marginTop: 40 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{
              display: "block",
              width: 7, height: 7,
              borderRadius: "50%",
              background: "oklch(0.36 0.18 27)",
              animation: `_mls-dot 1.3s ease-in-out ${i * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>
    </>
  );
}

function LocaleSync() {
  const { locale } = useLoaderData<typeof loader>();
  const syncLocale = useLocaleStore((s) => s._syncLocale);

  // After hydration: sync the Zustand locale store from the server-detected
  // locale (from root loader) so all components using useLocaleStore stay
  // consistent without causing a server/client hydration mismatch.
  useEffect(() => {
    syncLocale(locale);
    const html = document.documentElement;
    html.lang = locale;
    html.dir = dirFor(locale);
  }, [locale, syncLocale]);

  return null;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  const is500 = isRouteErrorResponse(error) && error.status >= 500;

  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{is404 ? "Page Not Found — MLS Oman" : "Something went wrong — MLS Oman"}</title>
        <link rel="stylesheet" href={styles} />
        <Links />
        {/* Restore lang/dir from cookie so Arabic users see RTL even on error pages */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)lang=([a-z]{2})/);if(m&&m[1]==='ar'){document.documentElement.lang='ar';document.documentElement.dir='rtl';}}catch(e){}})();` }} />
      </head>
      <body style={{ margin: 0, background: "#FAF9F6", fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 480 }}>
          <p style={{ fontSize: 72, margin: "0 0 8px", fontWeight: 900, color: "#8B0000" }}>
            {is404 ? "404" : is500 ? "500" : "!"}
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 12px", color: "#1A1A1A" }}>
            {is404 ? "Page not found" : "Something went wrong"}
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 28px", lineHeight: 1.6 }}>
            {is404
              ? "The page you're looking for doesn't exist or has been moved."
              : "We hit an unexpected error. Our team has been notified."}
          </p>
          <a href="/" style={{ display: "inline-block", background: "#8B0000", color: "#fff", borderRadius: 8, padding: "12px 28px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Back to Home
          </a>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

// GTM dataLayer — page_view on SPA route changes. The first page load is captured by GTM's
// own load trigger, so we skip the initial render to avoid double-counting.
function DataLayerRouteTracker() {
  const location = useLocation();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pushDataLayer("page_view", { page_path: location.pathname + location.search });
  }, [location.pathname, location.search]);
  return null;
}

// ── Ad pixels (Meta / TikTok / Snapchat) ──────────────────────────────────────
// Structure ported from the (working) UAE site. IDs below are BLANK placeholders — add the OMAN
// account IDs at go-live and that pixel activates automatically. Any pixel left blank is skipped
// (its script never loads → NO wrong/UAE tracking). dataLayer.ts already forwards ecommerce events
// (PageView / ViewContent / AddToCart / Purchase …) to fbq / ttq / snaptr once these globals exist,
// so filling in an ID below is the ONLY change needed at go-live.
const PIXEL_IDS = {
  meta: "251581732573542",      // Meta (Facebook) Pixel ID (Oman — "Muscat Livestock")
  tiktok: "",    // TikTok Pixel ID            — e.g. "CXXXXXXXXXXXXXXXXXXX"
  snapchat: "087693df-9e2f-4a99-83a1-fd395c452b1d",  // Snapchat Pixel ID (Oman)
};

// Vendor install snippets (verbatim), parameterized by ID. Only built for pixels that have an ID.
function buildPixelSnippets(): string[] {
  const out: string[] = [];
  if (PIXEL_IDS.meta) {
    out.push(`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_IDS.meta}');fbq('track','PageView');`);
  }
  if (PIXEL_IDS.tiktok) {
    out.push(`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var a=document.createElement("script");a.type="text/javascript",a.async=!0,a.src=i+"?sdkid="+e+"&lib="+t;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(a,s)};ttq.load('${PIXEL_IDS.tiktok}');ttq.page();}(window,document,'ttq');`);
  }
  if (PIXEL_IDS.snapchat) {
    out.push(`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${PIXEL_IDS.snapchat}');snaptr('track','PAGE_VIEW');`);
  }
  return out;
}

// Injects the ad pixels in a single client effect AFTER hydration (SSR-ing them mutates <head>
// before hydration and causes a fatal hydration mismatch — hence a post-hydration effect).
// No-op until at least one PIXEL_IDS entry is filled.
function MarketingPixels() {
  useEffect(() => {
    const w = window as unknown as { __mlsPixelsLoaded?: boolean };
    if (w.__mlsPixelsLoaded) return;
    const snippets = buildPixelSnippets();
    if (snippets.length === 0) return;
    w.__mlsPixelsLoaded = true;
    for (const js of snippets) {
      const s = document.createElement("script");
      s.textContent = js;
      document.head.appendChild(s);
    }
  }, []);
  return null;
}

// Sends Shopify's product_added_to_cart DIRECTLY to Monorail, bypassing Hydrogen's event pipeline.
//
// Why: sendShopifyAnalytics() begins with `if (!payload.hasUserConsent) return` — a SILENT no-op.
// Hydrogen derives hasUserConsent from customerPrivacy.analyticsProcessingAllowed(), which is false
// on this store (Oman needs no consent banner, so consent is never explicitly granted). That single
// line is why NO Hydrogen analytics event ever reached Monorail — no beacon, no error. Sessions come
// from the consent script's own separate telemetry, not Hydrogen.
//
// We call sendShopifyAnalytics ourselves with hasUserConsent: true (lawful here — Oman has no
// cookie-consent requirement). The provider keeps cart={null} so Hydrogen's own CartAnalytics can't
// also fire this event and double-count. Read-only w.r.t. the cart; gifts (price 0) and pending
// lines are skipped, and the initial hydration pass is ignored.
function CartAddDirectAnalytics() {
  const items = useCartStore((s) => s.items);
  const cartId = useCartStore((s) => s.cartId);
  const checkoutUrl = useCartStore((s) => s.checkoutUrl);
  const { shop } = useAnalytics();
  const prevQtyRef = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    const cur = new Map<string, number>();
    for (const i of items) {
      if (i.lineId && !i.isPending && parseFloat(i.price?.amount ?? "0") > 0) cur.set(i.lineId, i.quantity);
    }
    const prev = prevQtyRef.current;
    prevQtyRef.current = cur;

    const s = shop as { shopId?: string } | null;
    if (prev === null || !cartId || !s?.shopId) return; // skip initial hydration / not ready

    // Cart-wide values for the Klaviyo "Added to Cart" payload.
    const cartTotal = items.reduce(
      (sum, it) => sum + parseFloat(it.price?.amount ?? "0") * it.quantity,
      0,
    );
    const itemNames = items
      .filter((it) => parseFloat(it.price?.amount ?? "0") > 0)
      .map((it) => (it.product?.node as any)?.title ?? "")
      .filter(Boolean);

    for (const i of items) {
      if (!i.lineId || i.isPending) continue;
      const unitPrice = parseFloat(i.price?.amount ?? "0");
      if (unitPrice <= 0) continue; // skip free gifts
      const added = i.quantity - (prev.get(i.lineId) ?? 0);
      if (added <= 0) continue; // only adds / quantity increases

      const node = (i.product?.node ?? {}) as any;
      try {
        void sendShopifyAnalytics({
          eventName: AnalyticsEventName.ADD_TO_CART,
          payload: {
            ...(s as object),
            shopifySalesChannel: "hydrogen",
            hasUserConsent: true,
            ...getClientBrowserParameters(),
            cartId,
            totalValue: unitPrice * added,
            products: [
              {
                productGid: node.id ?? "",
                variantGid: i.variantId,
                name: node.title ?? "",
                variantName: i.variantTitle ?? "",
                brand: node.vendor ?? "",
                price: i.price?.amount ?? "0",
                quantity: added,
                category: node.productType ?? "",
              },
            ],
          } as never,
        });
      } catch {
        /* analytics must never affect the cart */
      }

      // Klaviyo "Added to Cart" (headless — not auto-tracked). Separate pipeline from Shopify.
      try {
        const handle = node.handle ?? "";
        klaviyoAddedToCart({
          addedName: node.title ?? "",
          addedProductId: node.id ?? "",
          addedPrice: unitPrice,
          addedQuantity: added,
          addedImageUrl:
            node.images?.edges?.[0]?.node?.url ?? node.images?.nodes?.[0]?.url ?? "",
          addedUrl:
            handle && typeof window !== "undefined"
              ? `${window.location.origin}/products/${handle}`
              : "",
          addedBrand: node.vendor ?? "",
          addedCategory: node.productType ?? "",
          cartTotal,
          itemNames,
          checkoutUrl: checkoutUrl ?? "",
        });
      } catch {
        /* Klaviyo tracking must never affect the cart */
      }
    }
  }, [items, cartId, checkoutUrl, shop]);

  return null;
}

// Oman has no cookie-consent legal requirement, so Shopify shows no banner and auto-resolves
// consent WITHOUT firing `visitorConsentCollected`. Hydrogen's analytics subscriber waits for that
// event before sending ANY event to Monorail — so without this, nothing from Hydrogen fires (only
// the consent script's own telemetry reaches Shopify, which is why sessions worked but funnel events
// didn't). Explicitly grant tracking consent once the Customer Privacy API loads → fires the event →
// unblocks page_view / product / collection / cart analytics.
function GrantTrackingConsent() {
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      const cp = (window as unknown as { Shopify?: { customerPrivacy?: any } }).Shopify?.customerPrivacy;
      if (cp?.setTrackingConsent) {
        clearInterval(id);
        try {
          const c = cp.currentVisitorConsent?.();
          const alreadyGranted = c && c.analytics === true;
          if (!alreadyGranted) {
            cp.setTrackingConsent(
              { analytics: true, marketing: true, preferences: true, sale_of_data: true },
              () => {},
            );
          }
        } catch {
          /* ignore — never break the page */
        }
      } else if (++tries > 60) {
        clearInterval(id); // give up after ~12s
      }
    }, 200);
    return () => clearInterval(id);
  }, []);
  return null;
}

// Sets the _shopify_y (visitor, 1yr) and _shopify_s (session, 30min) cookies. WITHOUT this,
// getClientBrowserParameters() reads EMPTY uniqToken/visitToken, so every Shopify analytics beacon
// goes out with no visitor/session id — Shopify can't group page-views into sessions and MASSIVELY
// under-counts Sessions (which inflates the Conversion Rate = orders / sessions). hasUserConsent:true
// because Oman shows no consent banner (lawful; same basis as our other direct sends).
function SetShopifyCookies() {
  useShopifyCookies({ hasUserConsent: true });
  return null;
}

export default function App() {
  const data = useLoaderData<typeof loader>();
  const { mainMenu, secondaryMenu, mobileMenu, mobileCategoriesMenu, footerSettings, footerMenuCols, announcementMessages, announcementScrollSeconds, navItemImages, mobileBanners } = data;
  return (
    // cart={null}: add-to-cart is sent directly by <CartAddDirectAnalytics/> (Hydrogen's own cart
    // analytics can't send — see the hasUserConsent gate documented there), so leaving cart null
    // prevents any chance of double-counting.
    <Analytics.Provider cart={null} shop={data.shop} consent={data.consent} canTrack={() => true}>
      <QueryClientProvider client={queryClient}>
        <SetShopifyCookies />
        <PageLoader />
        <LocaleSync />
        <DataLayerRouteTracker />
        <MarketingPixels />
        <GrantTrackingConsent />
        <ShopifyPageView />
        <KlaviyoIdentify />
        <CartAddDirectAnalytics />
        <CartSyncWrapper />
        <RichpanelWidget />
        <div className="flex min-h-screen flex-col">
          <AnnouncementBar messages={announcementMessages} scrollSeconds={announcementScrollSeconds ?? undefined} />
          <Header mainMenu={mainMenu} secondaryMenu={secondaryMenu} navItemImages={navItemImages} mobileBanners={mobileBanners} mobileMenu={mobileMenu} mobileCategoriesMenu={mobileCategoriesMenu} />
          <main className="flex-1">
            <Outlet />
          </main>
          <Suspense fallback={null}><Footer settings={footerSettings} menuCols={footerMenuCols} /></Suspense>
        </div>
        <Suspense fallback={null}><CartDrawer /></Suspense>
        <Suspense fallback={null}><QuickBuyDrawer /></Suspense>
        <Toaster position="top-center" />
      </QueryClientProvider>
    </Analytics.Provider>
  );
}

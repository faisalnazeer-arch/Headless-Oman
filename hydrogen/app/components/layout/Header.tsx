import { useState, useRef, useEffect, type ReactNode } from "react";
import { Link, useMatches } from "react-router";
import {
  ShoppingBag,
  User,
  Menu,
  ChevronDown,
  ChevronRight,
  Beef,
  Drumstick,
  Star,
  Tag,
  Flame,
  Sandwich,
  Package,
  Boxes,
  Info,
  Compass,
  Globe,
  MapPin,
  Crown,
  Gift,
  Percent,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { Button } from "@/components/ui/button";
import { MegaMenu } from "./MegaMenu";
import { SearchAutosuggest } from "./SearchAutosuggest";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useLocaleStore, dirFor, useLocalePath } from "@/stores/localeStore";
import { useT } from "@/i18n/strings";
import logo from "@/assets/mls-logo.png";
import type { NavEntry, MobileBanner } from "~/root";

function pickIcon(title: string, url: string): LucideIcon {
  const s = `${title} ${url}`.toLowerCase();
  if (/beef|steak|wagyu|angus/.test(s)) return Beef;
  if (/lamb|mutton/.test(s)) return Drumstick;
  if (/review/.test(s)) return Star;
  if (/offer|sale|deal|redeem/.test(s)) return Percent;
  if (/bbq|grill|mishkak/.test(s)) return Flame;
  if (/burger|sandwich/.test(s)) return Sandwich;
  if (/box|bundle/.test(s)) return Boxes;
  if (/build|package/.test(s)) return Package;
  if (/about|info/.test(s)) return Info;
  if (/location|store/.test(s)) return MapPin;
  if (/subscription|subscribe/.test(s)) return Crown;
  if (/reward|loyalty/.test(s)) return Gift;
  return Compass;
}

interface HeaderProps {
  mainMenu?: NavEntry[];
  secondaryMenu?: NavEntry[];
  mobileCategoriesMenu?: NavEntry[];
  navItemImages?: Record<string, string>;
  mobileBanners?: MobileBanner[];
  mobileMenu?: import("~/root").MobileMenuTab[];
}

export function Header({ mainMenu = [], secondaryMenu = [], mobileCategoriesMenu = [], navItemImages = {}, mobileBanners = [], mobileMenu = [] }: HeaderProps) {
  const totalItems = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const setCartOpen = useCartStore((s) => s.setOpen);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Cart count is from localStorage (Zustand persist) — server always renders 0.
  // Use mounted flag so the badge only appears after hydration, preventing a
  // structural mismatch (element appears/disappears) that breaks hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useT();
  const drawerSide = dirFor(locale) === "rtl" ? "right" : "left";
  const closeMobile = () => setMobileNavOpen(false);

  // When on a product page, pass the canonical EN handle to setLocale so switching
  // from AR → EN navigates to the same product, not home.
  const matches = useMatches();
  const productRouteData = matches.find(
    (m) => m.id === "routes/products.$handle" || m.id === "ar-products-handle"
  )?.data as { canonicalHandle?: string } | undefined;
  const canonicalProductPath = productRouteData?.canonicalHandle
    ? `/products/${productRouteData.canonicalHandle}`
    : undefined;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      {/* Top bar */}
      <div className="container relative mx-auto flex items-center gap-3 px-4 py-3">
        {/* Mobile menu */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("nav.menu")}>
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          {/* [&>button:first-child]:hidden hides Sheet's built-in close button — we have our own */}
          <SheetContent side={drawerSide} className="w-[320px] p-0 flex flex-col [&>button:first-child]:hidden data-[state=open]:!duration-300 data-[state=closed]:!duration-250">
            <MobileMenuDrawer
              mainMenu={mainMenu}
              mobileCategoriesMenu={mobileCategoriesMenu}
              secondaryMenu={secondaryMenu}
              navItemImages={navItemImages}
              mobileBanners={mobileBanners}
              mobileMenu={mobileMenu}
              onClose={closeMobile}
            />
          </SheetContent>
        </Sheet>

        <Link
          to={locale === "ar" ? "/ar" : "/"}
          aria-label="MLS — Muscat Livestock Store"
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center lg:static lg:translate-x-0 lg:translate-y-0"
        >
          <img
            src={logo}
            alt="Muscat Livestock Store"
            className="h-10 w-auto sm:h-12"
          />
        </Link>

        <div className="ms-4 hidden flex-1 lg:block">
          <div className="mx-auto max-w-xl">
            <SearchAutosuggest />
          </div>
        </div>

        <div className="ms-auto flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-0.5 rounded-full border border-border px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
            <Globe className="ms-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            <button
              type="button"
              onClick={() => setLocale("en", canonicalProductPath)}
              data-locale="en"
              className="locale-btn rounded-full px-2 py-0.5 transition-colors hover:text-crimson"
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLocale("ar")}
              data-locale="ar"
              lang="ar"
              className="locale-btn rounded-full px-2 py-0.5 transition-colors hover:text-crimson"
            >
              العربية
            </button>
          </div>
          <a
            href={`/customer_authentication/redirect?locale=${locale}&region_country=AE`}
            aria-label={t("nav.account")}
          >
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </a>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={t("nav.cart")}
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag className="h-5 w-5" />
            {mounted && totalItems > 0 && (
              <span className="absolute -end-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-crimson px-1 text-[10px] font-bold text-crimson-foreground">
                {totalItems}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Mobile search row */}
      <div className="border-t border-border bg-card px-4 py-2 lg:hidden">
        <SearchAutosuggest />
      </div>

      {/* Nav rows (desktop) */}
      <nav className="hidden border-t border-border bg-card lg:block">
        <div className="container relative mx-auto flex items-center justify-center gap-6 px-4 py-2">
          {mainMenu.map((entry) =>
            entry.columns.length > 0 ? (
              <NavItem
                key={entry.id}
                label={entry.label}
                mega={entry.columns}
              />
            ) : (
              <NavLink
                key={entry.id}
                to={entry.url ?? "/"}
                label={entry.label}
              />
            )
          )}
        </div>
        <div className="container relative mx-auto flex items-center justify-center gap-6 border-t border-border/60 px-4 py-2">
          {secondaryMenu.map((entry) =>
            entry.columns.length > 0 ? (
              <SecondaryNavItem
                key={entry.id}
                label={entry.label}
                mega={entry.columns}
              />
            ) : (
              <SecondaryNavLink
                key={entry.id}
                to={entry.url ?? "/"}
                label={entry.label}
              />
            )
          )}
        </div>
      </nav>
    </header>
  );
}

function NavItem({
  label,
  mega,
  Icon,
}: {
  label: string;
  mega: any[];
  Icon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };

  const handleClose = () => {
    timer.current = setTimeout(() => setOpen(false), 150);
  };

  const isMega = mega.length > 1 || (mega.length === 1 && !!mega[0].title);

  const handleLinkClick = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <div className={isMega ? undefined : "relative"} onMouseEnter={handleOpen} onMouseLeave={handleClose}>
      <button
        className={`flex items-center gap-1 py-1 text-[13px] font-semibold uppercase tracking-wider transition-colors hover:text-crimson ${open ? "text-crimson" : ""}`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <MegaMenu
          columns={mega}
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
          onLinkClick={handleLinkClick}
        />
      )}
    </div>
  );
}

function NavLink({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon?: LucideIcon;
}) {
  const lp = useLocalePath();
  return (
    <Link
      to={lp(to)}
      prefetch="intent"
      className="flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider transition-colors hover:text-crimson"
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </Link>
  );
}

function SecondaryNavItem({
  label,
  mega,
  Icon,
}: {
  label: string;
  mega: any[];
  Icon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMega = mega.length > 1 || (mega.length === 1 && !!mega[0].title);

  const handleOpen = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const handleClose = () => { timer.current = setTimeout(() => setOpen(false), 150); };
  const handleLinkClick = () => { if (timer.current) clearTimeout(timer.current); setOpen(false); };

  return (
    <div className={isMega ? undefined : "relative"} onMouseEnter={handleOpen} onMouseLeave={handleClose}>
      <button className={`flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider transition-colors hover:text-crimson ${open ? "text-crimson" : "text-muted-foreground"}`}>
        {Icon && <Icon className="h-3 w-3" />}
        {label}
        <ChevronDown className={`h-2.5 w-2.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <MegaMenu columns={mega} onMouseEnter={handleOpen} onMouseLeave={handleClose} onLinkClick={handleLinkClick} />
      )}
    </div>
  );
}

function SecondaryNavLink({
  to,
  label,
  Icon,
}: {
  to: string;
  label: string;
  Icon?: LucideIcon;
}) {
  const lp = useLocalePath();
  return (
    <Link
      to={lp(to)}
      prefetch="intent"
      className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-crimson"
    >
      {Icon && <Icon className="h-3 w-3" />}
      <span>{label}</span>
    </Link>
  );
}

// ── Mobile drawer ──────────────────────────────────────────────────────────────

function cdnImg(url: string, w = 120) {
  if (!url) return url;
  return url.includes("?") ? `${url}&width=${w}` : `${url}?width=${w}`;
}

// Smooth accordion wrapper using CSS max-height transition
function AccordionBody({ isOpen, children }: { isOpen: boolean; children: ReactNode }) {
  return (
    <div
      style={{
        maxHeight: isOpen ? "1000px" : "0px",
        overflow: "hidden",
        transition: "max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {children}
    </div>
  );
}

function MobileMenuDrawer({
  mainMenu,
  mobileCategoriesMenu,
  secondaryMenu,
  navItemImages,
  mobileBanners,
  mobileMenu,
  onClose,
}: {
  mainMenu: NavEntry[];
  mobileCategoriesMenu: NavEntry[];
  secondaryMenu: NavEntry[];
  navItemImages: Record<string, string>;
  mobileBanners: MobileBanner[];
  mobileMenu: import("~/root").MobileMenuTab[];
  onClose: () => void;
}) {
  const lp = useLocalePath();
  const [tab1Idx, setTab1Idx]               = useState(0);
  const [openEntries, setOpenEntries]       = useState<Set<string>>(new Set());
  const [openCols, setOpenCols]             = useState<Set<string>>(new Set());
  const [openItems, setOpenItems]           = useState<Set<string>>(new Set());
  const [openSecEntries, setOpenSecEntries] = useState<Set<string>>(new Set());
  const [openSecCols, setOpenSecCols]       = useState<Set<string>>(new Set());

  const locale    = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t         = useT();
  const mobileMatches = useMatches();
  const mobileProductData = mobileMatches.find(
    (m) => m.id === "routes/products.$handle" || m.id === "ar-products-handle"
  )?.data as { canonicalHandle?: string } | undefined;
  const canonicalProductPath = mobileProductData?.canonicalHandle
    ? `/products/${mobileProductData.canonicalHandle}`
    : undefined;

  const tabs             = mobileMenu;
  // Use the language-stable English label (set in AR) so the Categories tab is detected
  // even when its visible label is translated (e.g. "الفئات").
  const isCategories     = (tabs[tab1Idx]?.enLabel ?? tabs[tab1Idx]?.label ?? "").toLowerCase() === "categories";
  // Labels that have their own dedicated top tab (e.g. "Explore Meat"), so we don't ALSO repeat
  // them inside the Categories accordion (which mirrors the desktop nav / hydrogen-desktop).
  const tabLabelSet = new Set(
    tabs.map((tb) => (tb.enLabel ?? tb.label ?? "").trim().toLowerCase()).filter((l) => l && l !== "categories"),
  );
  const mobileCatEntries = (mobileCategoriesMenu.length > 0 ? mobileCategoriesMenu : mainMenu)
    .filter((e) => !tabLabelSet.has((e.label ?? "").trim().toLowerCase()));

  const handleTab1      = (i: number)   => { setTab1Idx(i); setOpenEntries(new Set()); setOpenCols(new Set()); setOpenItems(new Set()); };
  const toggleEntry     = (id: string)  => setOpenEntries((p)    => { const n = new Set(p); n.has(id)  ? n.delete(id)  : n.add(id);  return n; });
  const toggleCol       = (key: string) => setOpenCols((p)       => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleItem      = (id: string)  => setOpenItems((p)      => { const n = new Set(p); n.has(id)  ? n.delete(id)  : n.add(id);  return n; });
  const toggleSecEntry  = (id: string)  => setOpenSecEntries((p) => { const n = new Set(p); n.has(id)  ? n.delete(id)  : n.add(id);  return n; });
  const toggleSecCol    = (key: string) => setOpenSecCols((p)    => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="flex h-full flex-col">
      <SheetTitle className="sr-only">Menu</SheetTitle>

      {/* ── Header ── */}
      <div className="relative flex shrink-0 items-center justify-center border-b border-border py-3 px-12">
        <button type="button" onClick={onClose} aria-label="Close"
          className="group absolute left-4 flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-all duration-200 hover:bg-muted active:scale-95">
          <X className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" />
        </button>
        <img src={logo} alt="MLS" className="h-8 w-auto" />
      </div>

      {/* ── Promo banners ── */}
      {mobileBanners.length > 0 && (
        <div className="flex shrink-0 gap-2 border-b border-border bg-background px-3 py-2.5">
          {mobileBanners.map((banner, idx) => (
            <Link key={banner.id} to={lp(banner.url)} onClick={onClose} prefetch="intent"
              className="relative flex-1 overflow-hidden rounded-xl">
              <img src={cdnImg(banner.imageUrl, 300)} alt={banner.altText || banner.heading || "Muscat Livestock offer"}
                className="h-24 w-full object-cover" loading={idx === 0 ? "eager" : "lazy"} />
              {(banner.heading || banner.highlight) && (
                <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-black/50 to-transparent pl-3 pr-1">
                  {banner.heading   && <span className="text-[11px] font-black leading-tight text-white drop-shadow">{banner.heading}</span>}
                  {banner.highlight && <span className="text-[13px] font-black leading-tight text-crimson drop-shadow">{banner.highlight}</span>}
                  {banner.ctaText   && <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/80 drop-shadow">{banner.ctaText}</span>}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {/* ── Pill tab bar ── */}
      {tabs.length > 0 && (
        <div className="flex shrink-0 gap-1.5 border-b border-border bg-background px-3 py-2.5">
          {tabs.map((tab, i) => (
            <button key={tab.label} type="button" onClick={() => handleTab1(i)}
              className={`flex-1 rounded-lg py-2 text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${
                i === tab1Idx
                  ? "bg-crimson text-white shadow-sm scale-[1.02]"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >{tab.label}</button>
          ))}
        </div>
      )}

      {/* ── Scrollable body with stagger entrance ── */}
      <div className="flex-1 overflow-y-auto">
        <div key={tab1Idx}>

          {isCategories
            ? mobileCatEntries.map((entry) => {
                const thumbUrl    = navItemImages[entry.label] ?? entry.imageUrl ?? null;
                const initial     = (entry.label[0] ?? "•").toUpperCase();
                const hasChildren = entry.columns.length > 0;
                const isOpen      = openEntries.has(entry.id);
                const thumb = thumbUrl
                  ? <img src={cdnImg(thumbUrl, 120)} alt={entry.label} className="h-11 w-[72px] shrink-0 rounded-xl object-cover" loading="lazy" />
                  : <div className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-crimson/15 to-crimson/5">
                      <span className="text-sm font-black text-crimson">{initial}</span>
                    </div>;

                return (
                  <div key={entry.id}>
                    {hasChildren ? (
                      <button type="button" onClick={() => toggleEntry(entry.id)}
                        className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-all duration-150 ${
                          isOpen ? "border-border/40 bg-crimson/5" : "border-border/40 hover:bg-muted/30"
                        }`}
                      >
                        <div className="h-11 w-[72px] shrink-0 overflow-hidden rounded-xl">{thumb}</div>
                        <span className="flex-1 text-[13px] font-semibold text-foreground">{entry.label}</span>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[14px] font-light leading-none transition-colors ${
                          isOpen ? "border-crimson bg-crimson text-white" : "border-border text-muted-foreground"
                        }`}>{isOpen ? "−" : "+"}</span>
                      </button>
                    ) : (
                      <Link to={lp(entry.url ?? "/")} onClick={onClose} prefetch="intent"
                        className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-all duration-150 hover:bg-muted/30"
                      >
                        <div className="h-11 w-[72px] shrink-0 overflow-hidden rounded-xl">{thumb}</div>
                        <span className="flex-1 text-[13px] font-semibold text-foreground">{entry.label}</span>
                      </Link>
                    )}

                    <AccordionBody isOpen={isOpen}>
                      <div className="bg-muted/20">
                        <div className="ml-4 border-l-2 border-crimson/30">
                          {entry.columns.map((col, ci) => {
                            const colKey   = `${entry.id}-${ci}`;
                            const colOpen  = openCols.has(colKey);
                            const hasLinks = col.links.length > 0;
                            const hasTitle = col.title.trim().length > 0;

                            if (!hasTitle) {
                              return (
                                <div key={colKey}>
                                  {hasLinks && col.links.map((link) => (
                                    <Link key={link.url + link.label} to={lp(link.url)} onClick={onClose} prefetch="intent"
                                      className="block border-b border-border/25 py-2.5 pl-4 pr-3 text-[12px] font-medium text-foreground/70 last:border-0 transition-colors hover:text-crimson"
                                    >{link.label}</Link>
                                  ))}
                                  {!hasLinks && col.url && (
                                    <Link to={lp(col.url)} onClick={onClose} prefetch="intent"
                                      className="block border-b border-border/25 py-2.5 pl-4 pr-3 text-[12px] font-medium text-foreground/70 transition-colors hover:text-crimson"
                                    >{col.title}</Link>
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div key={colKey}>
                                {hasLinks ? (
                                  <button type="button" onClick={() => toggleCol(colKey)}
                                    className={`flex w-full items-center gap-2.5 border-b py-2.5 pl-3 pr-3 text-left transition-all duration-150 ${
                                      colOpen ? "bg-crimson/5 border-crimson/20" : "border-border/25 hover:bg-muted/30"
                                    }`}
                                  >
                                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-black transition-colors ${
                                      colOpen ? "bg-crimson text-white" : "bg-crimson/10 text-crimson"
                                    }`}>{col.title[0].toUpperCase()}</span>
                                    <span className="flex-1 text-[12px] font-semibold text-foreground/85">{col.title}</span>
                                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[12px] font-light leading-none transition-colors ${
                                      colOpen ? "border-crimson bg-crimson text-white" : "border-border/60 text-muted-foreground"
                                    }`}>{colOpen ? "−" : "+"}</span>
                                  </button>
                                ) : (
                                  col.url
                                    ? <Link to={lp(col.url)} onClick={onClose} prefetch="intent"
                                        className="flex items-center gap-2.5 border-b border-border/25 py-2.5 pl-3 pr-3 transition-all duration-150 hover:bg-muted/30"
                                      >
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-crimson/10 text-[10px] font-black text-crimson">{col.title[0].toUpperCase()}</span>
                                        <span className="flex-1 text-[12px] font-semibold text-foreground/85">{col.title}</span>
                                      </Link>
                                    : <div className="flex items-center gap-2.5 border-b border-border/25 py-2.5 pl-3 pr-3">
                                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-crimson/10 text-[10px] font-black text-crimson">{col.title[0].toUpperCase()}</span>
                                        <span className="flex-1 text-[12px] font-semibold text-foreground/85">{col.title}</span>
                                      </div>
                                )}
                                <AccordionBody isOpen={colOpen}>
                                  <div className="ml-3 border-l border-crimson/15">
                                    {col.links.map((link) => (
                                      <Link key={link.url + link.label} to={lp(link.url)} onClick={onClose} prefetch="intent"
                                        className="block border-b border-border/25 py-2 pl-4 pr-3 text-[12px] text-foreground/60 last:border-0 transition-colors hover:text-crimson"
                                      >{link.label}</Link>
                                    ))}
                                  </div>
                                </AccordionBody>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </AccordionBody>
                  </div>
                );
              })

            : (tabs[tab1Idx]?.items ?? []).map((item) => {
                const thumbUrl    = navItemImages[item.title] ?? item.imageUrl ?? null;
                const initial     = (item.title[0] ?? "•").toUpperCase();
                const isOpen      = openItems.has(item.id);
                const mainEntry   = mainMenu.find((e) => e.url === item.url);
                const fallbackSubs = mainEntry
                  ? mainEntry.columns.flatMap((col) =>
                      col.links.map((lnk) => ({ id: lnk.url, title: lnk.label, url: lnk.url }))
                    )
                  : [];
                const subItems    = item.subItems.length > 0 ? item.subItems : fallbackSubs;
                const hasChildren = subItems.length > 0;
                const thumb = thumbUrl
                  ? <img src={cdnImg(thumbUrl, 120)} alt={item.title} className="h-11 w-[72px] shrink-0 rounded-xl object-cover" loading="lazy" />
                  : <div className="flex h-11 w-[72px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-crimson/15 to-crimson/5">
                      <span className="text-sm font-black text-crimson">{initial}</span>
                    </div>;

                return (
                  <div key={item.id}>
                    {hasChildren ? (
                      <button type="button" onClick={() => toggleItem(item.id)}
                        className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-all duration-150 ${
                          isOpen ? "border-border/40 bg-crimson/5" : "border-border/40 hover:bg-muted/30"
                        }`}
                      >
                        <div className="h-11 w-[72px] shrink-0 overflow-hidden rounded-xl">{thumb}</div>
                        <span className="flex-1 text-[13px] font-semibold text-foreground">{item.title}</span>
                        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[14px] font-light leading-none transition-colors ${
                          isOpen ? "border-crimson bg-crimson text-white" : "border-border text-muted-foreground"
                        }`}>{isOpen ? "−" : "+"}</span>
                      </button>
                    ) : (
                      <Link to={lp(item.url)} onClick={onClose} prefetch="intent"
                        className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-all duration-150 hover:bg-muted/30"
                      >
                        <div className="h-11 w-[72px] shrink-0 overflow-hidden rounded-xl">{thumb}</div>
                        <span className="flex-1 text-[13px] font-semibold text-foreground">{item.title}</span>
                      </Link>
                    )}
                    <AccordionBody isOpen={isOpen}>
                      <div className="ml-4 border-l-2 border-crimson/30 bg-muted/20">
                        {subItems.map((sub) => (
                          <Link key={sub.id} to={lp(sub.url)} onClick={onClose} prefetch="intent"
                            className="block border-b border-border/25 py-2.5 pl-4 pr-4 text-[12px] font-medium text-foreground/70 last:border-0 transition-colors hover:text-crimson"
                          >{sub.title}</Link>
                        ))}
                      </div>
                    </AccordionBody>
                  </div>
                );
              })
          }

          {/* ── Secondary menu ── */}
          <div className="my-1 border-t border-border/60" />
          {secondaryMenu.map((entry) => {
            const Icon        = pickIcon(entry.label, entry.url ?? "");
            const hasChildren = entry.columns.length > 0;
            const isOpen      = openSecEntries.has(entry.id);

            return (
              <div key={entry.id}>
                {hasChildren ? (
                  <button type="button" onClick={() => toggleSecEntry(entry.id)}
                    className={`flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-all duration-150 ${
                      isOpen ? "border-border/40 bg-crimson/5" : "border-border/40 hover:bg-muted/30"
                    }`}
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crimson/10 text-crimson">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="flex-1 text-[13px] font-semibold text-foreground">{entry.label}</span>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[14px] font-light leading-none transition-colors ${
                      isOpen ? "border-crimson bg-crimson text-white" : "border-border text-muted-foreground"
                    }`}>{isOpen ? "−" : "+"}</span>
                  </button>
                ) : (
                  <Link to={lp(entry.url ?? "/")} onClick={onClose} prefetch="intent"
                    className="flex items-center gap-3 border-b border-border/40 px-4 py-2.5 transition-all duration-150 hover:bg-muted/30"
                  >
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-crimson/10 text-crimson">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="flex-1 text-[13px] font-semibold text-foreground">{entry.label}</span>
                  </Link>
                )}

                <AccordionBody isOpen={isOpen}>
                  <div className="bg-muted/20">
                    <div className="ml-4 border-l-2 border-crimson/30">
                      {entry.columns.map((col, ci) => {
                        const colKey   = `sec-${entry.id}-${ci}`;
                        const colOpen  = openSecCols.has(colKey);
                        const hasTitle = col.title.trim().length > 0;

                        if (!hasTitle) {
                          return (
                            <div key={colKey}>
                              {col.links.map((lnk) => (
                                <Link key={lnk.url} to={lp(lnk.url)} onClick={onClose} prefetch="intent"
                                  className="block border-b border-border/25 py-2.5 pl-4 pr-3 text-[12px] font-medium text-foreground/70 last:border-0 transition-colors hover:text-crimson"
                                >{lnk.label}</Link>
                              ))}
                              {col.url && col.links.length === 0 && (
                                <Link to={lp(col.url)} onClick={onClose} prefetch="intent"
                                  className="block border-b border-border/25 py-2.5 pl-4 pr-3 text-[12px] font-medium text-foreground/70 transition-colors hover:text-crimson"
                                >{col.title}</Link>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div key={colKey}>
                            {col.links.length > 0 ? (
                              <button type="button" onClick={() => toggleSecCol(colKey)}
                                className={`flex w-full items-center gap-2.5 border-b py-2.5 pl-3 pr-3 text-left transition-all duration-150 ${
                                  colOpen ? "bg-crimson/5 border-crimson/20" : "border-border/25 hover:bg-muted/30"
                                }`}
                              >
                                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-black transition-colors ${colOpen ? "bg-crimson text-white" : "bg-crimson/10 text-crimson"}`}>
                                  {col.title[0].toUpperCase()}
                                </span>
                                <span className="flex-1 text-[12px] font-semibold text-foreground/85">{col.title}</span>
                                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[12px] font-light leading-none transition-colors ${
                                  colOpen ? "border-crimson bg-crimson text-white" : "border-border/60 text-muted-foreground"
                                }`}>{colOpen ? "−" : "+"}</span>
                              </button>
                            ) : col.url ? (
                              <Link to={lp(col.url)} onClick={onClose} prefetch="intent"
                                className="flex items-center gap-2.5 border-b border-border/25 py-2.5 pl-3 pr-3 transition-all duration-150 hover:bg-muted/30"
                              >
                                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-crimson/10 text-[10px] font-black text-crimson">{col.title[0].toUpperCase()}</span>
                                <span className="flex-1 text-[12px] font-semibold text-foreground/85">{col.title}</span>
                              </Link>
                            ) : null}

                            <AccordionBody isOpen={colOpen}>
                              <div className="ml-3 border-l border-crimson/15">
                                {col.links.map((lnk) => (
                                  <Link key={lnk.url} to={lp(lnk.url)} onClick={onClose} prefetch="intent"
                                    className="block border-b border-border/25 py-2 pl-4 pr-3 text-[12px] text-foreground/60 last:border-0 transition-colors hover:text-crimson"
                                  >{lnk.label}</Link>
                                ))}
                              </div>
                            </AccordionBody>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </AccordionBody>
              </div>
            );
          })}

        </div>
      </div>

      {/* ── Language switcher + Login CTA footer ── */}
      <div className="shrink-0 border-t border-border px-3 pt-3 pb-1">
        <div className="mb-3 flex items-center justify-center gap-1 rounded-lg border border-border py-2">
          <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <button
            type="button"
            onClick={() => setLocale("en", canonicalProductPath)}
            data-locale="en"
            className={`locale-btn rounded-full px-3 py-1 text-[12px] font-semibold uppercase tracking-wider transition-colors ${locale === "en" ? "bg-crimson text-white" : "text-foreground hover:text-crimson"}`}
          >EN</button>
          <span className="text-border">|</span>
          <button
            type="button"
            onClick={() => setLocale("ar")}
            data-locale="ar"
            lang="ar"
            className={`locale-btn rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${locale === "ar" ? "bg-crimson text-white" : "text-foreground hover:text-crimson"}`}
          >العربية</button>
        </div>
      </div>
      <div className="shrink-0 px-3 pb-3">
        <a href={`/customer_authentication/redirect?locale=${locale}&region_country=AE`}
          className="flex w-full items-center justify-center rounded-lg bg-crimson py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors hover:bg-rich-red"
          style={{ color: '#ffffff' }}
        >{t("nav.login_signup")}</a>
      </div>
    </div>
  );
}

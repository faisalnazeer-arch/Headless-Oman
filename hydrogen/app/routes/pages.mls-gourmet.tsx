import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { MapPin, Clock, ExternalLink, Phone } from "lucide-react";
import { useState } from "react";
import { FaqAccordion, parseFaqItems } from "@/components/ui/FaqAccordion";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "MLS Gourmet Butcher Shops — MLS Oman" },
  { name: "description", content: "Visit our premium MLS Gourmet Butcher Shops across Dubai and Abu Dhabi." },
];

const GOURMET_QUERY = `
  query GourmetPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_gourmet_page", first: 1) {
      nodes {
        fields {
          key value
          references(first: 20) {
            nodes {
              ... on Metaobject {
                id
                fields {
                  key value
                  reference { ... on MediaImage { image { url altText } } }
                }
              }
            }
          }
        }
      }
    }
  }
` as const;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  const data = await context.storefront.query(GOURMET_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  if (language === "AR") applyArImages(data);
  const node = data?.metaobjects?.nodes?.[0];
  const f = Object.fromEntries((node?.fields ?? []).map((x: any) => [x.key, x]));

  const stores = (f.store_locations?.references?.nodes ?? []).map((n: any) => {
    const sf = Object.fromEntries(n.fields.map((x: any) => [x.key, x]));
    return {
      id: n.id,
      name:     sf.name?.value ?? "",
      address:  sf.address?.value ?? "",
      hours:    sf.hours?.value ?? "",
      phone:    sf.phone?.value ?? "",
      mapsUrl:  sf.maps_url?.value ?? "",
      embedUrl: sf.embed_url?.value ?? "",
      image:    sf.store_image?.reference?.image?.url ?? null,
      imageAlt: sf.store_image?.reference?.image?.altText ?? "",
    };
  });

  const faqItems = parseFaqItems(f.faq_items?.references?.nodes ?? []);

  return {
    heroTitle:    f.hero_title?.value    ?? "MLS Gourmet Butcher Shops",
    heroSubtitle: f.hero_subtitle?.value ?? "Premium cuts. Expert butchers. Visit us in store.",
    stores,
    faqItems,
  };
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Store = {
  id: string; name: string; address: string; hours: string;
  phone: string; mapsUrl: string; embedUrl: string;
  image: string | null; imageAlt: string;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MlsGourmetPage() {
  const { heroTitle, heroSubtitle, stores, faqItems } = useLoaderData<typeof loader>();
  const [activeStore, setActiveStore] = useState(stores[0]?.id ?? "");
  const current = stores.find((s) => s.id === activeStore) ?? stores[0];

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-charcoal py-14 text-center text-white md:py-20">
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)", backgroundSize: "20px 20px" }} />
        <div className="relative container mx-auto px-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70">Visit Us</p>
          <h1 className="font-display text-3xl font-extrabold md:text-5xl">{heroTitle}</h1>
          <p className="mx-auto mt-3 max-w-lg text-base text-white/65 md:text-lg">{heroSubtitle}</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-2 text-sm text-white/70">
              <MapPin className="h-4 w-4 text-white/70" /> {stores.length} locations across UAE
            </span>
            <span className="flex items-center gap-2 text-sm text-white/70">
              <Clock className="h-4 w-4 text-white/70" /> Open everyday
            </span>
          </div>
        </div>
      </div>

      {/* ── Store selector tabs (mobile horizontal scroll, desktop row) ── */}
      {stores.length > 0 && (
        <div className="border-b border-border bg-card">
          <div className="container mx-auto px-4">
            <div className="flex gap-0 overflow-x-auto">
              {stores.map((s) => (
                <button key={s.id} type="button" onClick={() => setActiveStore(s.id)}
                  className={`shrink-0 border-b-2 px-4 py-3.5 text-xs font-semibold whitespace-nowrap transition-colors sm:text-sm ${
                    activeStore === s.id
                      ? "border-crimson text-crimson"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  {s.name.replace("MLS Gourmet Butchery - ", "").replace("MLS Gourmet - ", "")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Active store detail ── */}
      {current && (
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="grid gap-6 lg:grid-cols-2">

            {/* Left: info */}
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="font-display text-2xl font-extrabold">{current.name}</h2>
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
                    <span className="text-foreground leading-relaxed">{current.address}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 shrink-0 text-crimson" />
                    <span className="text-foreground">{current.hours}</span>
                  </div>
                  {current.phone && (
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="h-4 w-4 shrink-0 text-crimson" />
                      <a href={`tel:${current.phone}`} className="text-foreground hover:text-crimson">{current.phone}</a>
                    </div>
                  )}
                </div>
              </div>

              {/* Store image */}
              {current.image && (
                <div className="aspect-video overflow-hidden rounded-2xl bg-muted">
                  <img src={current.image} alt={current.imageAlt || current.name}
                    className="h-full w-full object-cover" />
                </div>
              )}

              {/* CTAs */}
              <div className="flex flex-wrap gap-3">
                {current.mapsUrl && (
                  <a href={current.mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-crimson px-5 py-2.5 text-sm font-bold transition-colors hover:bg-rich-red" style={{ color: '#fff' }}>
                    <ExternalLink className="h-4 w-4" /> Open in Maps
                  </a>
                )}
                {current.phone && (
                  <a href={`tel:${current.phone}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-crimson px-5 py-2.5 text-sm font-bold transition-colors hover:bg-rich-red" style={{ color: '#fff' }}>
                    <Phone className="h-4 w-4" /> Call Us
                  </a>
                )}
              </div>
            </div>

            {/* Right: map embed */}
            <div className="overflow-hidden rounded-2xl border border-border bg-muted" style={{ minHeight: 360 }}>
              {current.embedUrl ? (
                <iframe title={`Map — ${current.name}`} src={current.embedUrl}
                  className="h-full w-full border-0" style={{ minHeight: 360 }}
                  loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground" style={{ minHeight: 360 }}>
                  Map not available
                </div>
              )}
            </div>
          </div>

          {/* All locations mini list */}
          <div className="mt-10">
            <h3 className="mb-4 font-display text-lg font-bold">All Locations</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {stores.map((s) => (
                <button key={s.id} type="button" onClick={() => { setActiveStore(s.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all hover:border-crimson ${
                    activeStore === s.id ? "border-crimson bg-crimson/5" : "border-border bg-card"
                  }`}>
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
                  <div>
                    <p className="text-sm font-semibold leading-snug">
                      {s.name.replace("MLS Gourmet Butchery - ", "").replace("MLS Gourmet - ", "")}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{s.address}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── FAQs ── */}
      {faqItems.length > 0 && (
        <div className="border-t border-border bg-muted/30">
          <div className="container mx-auto max-w-2xl px-4 py-12 md:py-16">
            <h2 className="mb-8 text-center font-display text-2xl font-bold">FAQs</h2>
            <FaqAccordion items={faqItems} />
          </div>
        </div>
      )}

    </div>
  );
}

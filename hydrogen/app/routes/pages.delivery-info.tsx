import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { useState } from "react";
import { Clock, Truck, MapPin, CheckCircle2, Package, RefreshCw } from "lucide-react";
import { detectLanguage } from "../lib/locale";

export const meta: MetaFunction = () => [
  { title: "Delivery Info — MLS Oman" },
  { name: "description", content: "Same-day delivery across Dubai, Abu Dhabi, Sharjah and Ajman. 1-hour slot delivery until 8:45 PM in Dubai." },
  { tagName: "link", rel: "canonical", href: "https://mls.om/pages/delivery-info" },
  { "script:ld+json": {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "MLS Oman Meat Delivery",
    url: "https://mls.om/pages/delivery-info",
    provider: { "@type": "Organization", name: "MLS Oman", url: "https://mls.om" },
    serviceType: "Food Delivery",
    areaServed: [
      { "@type": "City", name: "Dubai" },
      { "@type": "City", name: "Abu Dhabi" },
      { "@type": "City", name: "Sharjah" },
      { "@type": "City", name: "Ajman" },
    ],
    description: "Fresh delivery within 1 hour across Dubai, 2 hours across Abu Dhabi, same-day across Sharjah and Ajman. Order before 8:45 PM.",
    offers: {
      "@type": "Offer",
      priceCurrency: "OMR",
      price: "0",
      description: "Free delivery on orders above AED 350",
    },
  }},
];

// ─── Storefront metaobject query ──────────────────────────────────────────────

const ADMIN_QUERY = `
  query DeliveryPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_delivery_page", first: 1) {
      nodes {
        fields {
          key value
          references(first: 20) {
            nodes {
              ... on Metaobject {
                id
                fields { key value }
              }
            }
          }
        }
      }
    }
  }
` as const;

// ─── Fallback data (used when metaobjects are not yet created) ────────────────

const FALLBACK_CITIES = [
  {
    id: "dubai",
    label: "Dubai",
    emoji: "🏙️",
    cutoff: "8:45 PM",
    window: "1-hour slots",
    hours: "10 AM – 8:45 PM, all days",
    fee: "AED 15",
    notes: [
      "Delivered in 1-hour slots across all Dubai areas",
      "Order anytime up to 8:45 PM for same-day delivery",
      "No minimum order value",
      "Deliveries continue until 10:30 PM",
    ],
  },
  {
    id: "abudhabi",
    label: "Abu Dhabi",
    emoji: "🌴",
    cutoff: "8:45 PM",
    window: "2 hours",
    hours: "10 AM – 8:45 PM, all days",
    fee: "AED 20",
    notes: [
      "Express 2-hour delivery across Abu Dhabi",
      "Order anytime up to 8:45 PM for same-day delivery",
      "No minimum order value",
      "Deliveries continue until 10:30 PM",
    ],
  },
  {
    id: "sharjah",
    label: "Sharjah & Ajman",
    emoji: "🏡",
    cutoff: "1:00 PM",
    window: "Same day",
    hours: "Confirm before 1:00 PM",
    fee: "AED 15",
    notes: [
      "Same-day delivery when ordered before 1:00 PM",
      "No minimum order value",
      "Order after 1:00 PM = next-day delivery",
      "Delivery across Sharjah and Ajman areas",
    ],
  },
];

const FALLBACK_FAQS = [
  { id: "f1", q: "Is there a minimum order?", a: "No minimum order value. Our standard delivery fee is AED 15. Free delivery on orders above AED 350." },
  { id: "f2", q: "Do I need to tip my driver?", a: "There's no need to tip — we pay our delivery team a living wage that doesn't depend on tips." },
  { id: "f3", q: "How is my meat packaged?", a: "All orders are packed in insulated boxes using sustainable MULTIVAC packaging to maintain freshness during transit." },
  { id: "f4", q: "What if I'm not home?", a: "Our drivers will attempt to call you. You can leave delivery instructions in your order notes or reschedule." },
  { id: "f5", q: "Can I track my order?", a: "Yes — you'll receive an SMS with real-time tracking once your order is out for delivery." },
];

const FALLBACK_RETURNS = [
  "Drop a WhatsApp message or send us an email within 24 hours after delivery.",
  "We will exchange the product and deliver it again to your door, or you can pick it up if you want.",
  "You will receive the product or a refund. Refunds will be processed within 14 working days.",
];

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  const adminData = await context.storefront.query(ADMIN_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });

  const node = adminData?.metaobjects?.nodes?.[0];
  const f = Object.fromEntries((node?.fields ?? []).map((x: any) => [x.key, x]));
  const refs = (key: string) => f[key]?.references?.nodes ?? [];

  const cities = refs("city_items").map((n: any) => {
    const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return {
      id: n.id,
      label: nf.label ?? "",
      emoji: nf.emoji ?? "📦",
      cutoff: nf.cutoff ?? "",
      window: nf.delivery_window ?? "",
      hours: nf.hours ?? "",
      fee: nf.fee ?? "",
      notes: (nf.notes ?? "").split("\n").filter(Boolean),
    };
  });

  const faqs = refs("faq_items").map((n: any) => {
    const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return { id: n.id, q: nf.question ?? "", a: nf.answer ?? "" };
  });

  const returnsItems = (f.returns_items?.value ?? "").split("\n").filter(Boolean);

  return {
    heroSubtitle: f.hero_subtitle?.value ?? "Same-day delivery across the UAE. Fresh, chilled, and on time.",
    returnsTitle: f.returns_title?.value ?? "100% Free Replacements & Returns",
    cities: cities.length > 0 ? cities : FALLBACK_CITIES,
    faqs: faqs.length > 0 ? faqs : FALLBACK_FAQS,
    returnsItems: returnsItems.length > 0 ? returnsItems : FALLBACK_RETURNS,
  };
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="font-display text-sm font-semibold">{q}</span>
        <span className={`text-lg font-light text-muted-foreground transition-transform duration-200 ${open ? "rotate-45" : ""}`}>+</span>
      </button>
      <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: open ? "200px" : "0" }}>
        <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryInfoPage() {
  const { heroSubtitle, returnsTitle, cities, faqs, returnsItems } = useLoaderData<typeof loader>();
  const [activeIdx, setActiveIdx] = useState(0);
  const city = cities[activeIdx] ?? cities[0];

  return (
    <div className="min-h-screen bg-background">

      {/* Hero */}
      <div className="bg-charcoal py-6 text-center text-white md:py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Truck className="h-5 w-5 text-crimson" />
            <h1 className="font-display text-xl font-extrabold md:text-2xl">Delivery Info</h1>
          </div>
          <p className="text-sm text-white/60">{heroSubtitle}</p>
        </div>
      </div>

      {/* Trust strip */}
      <div className="border-b border-border">
        <div className="container mx-auto flex flex-wrap items-center justify-center gap-6 px-4 py-4">
          {[
            { icon: Clock, text: "1-hour slot delivery" },
            { icon: Package, text: "Insulated cold-chain packaging" },
            { icon: MapPin, text: "Dubai, Abu Dhabi & Sharjah/Ajman" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className="h-4 w-4 text-crimson" />
              {text}
            </div>
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 py-5 md:py-7">

        {/* City tabs */}
        <div className="mb-4 flex justify-center overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-border p-1">
            {cities.map((c, i) => (
              <button key={c.id} type="button" onClick={() => setActiveIdx(i)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                  activeIdx === i
                    ? "bg-crimson text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}>
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* City card */}
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-crimson/10 text-2xl">{city.emoji}</div>
            <div>
              <h2 className="font-display text-xl font-extrabold">{city.label}</h2>
              <p className="text-sm text-muted-foreground">Delivery zone</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-3 gap-3">
            {[
              { label: "Window", value: city.window },
              { label: "Order before", value: city.cutoff },
              { label: "Delivery fee", value: city.fee },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl border border-border p-3 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-1 font-display text-base font-bold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <ul className="space-y-2.5">
            {city.notes.map((note) => (
              <li key={note} className="flex items-start gap-2.5 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
                {note}
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-crimson/20 bg-crimson/5 px-4 py-3">
            <p className="text-sm font-semibold text-crimson">Operating hours</p>
            <p className="text-sm text-muted-foreground">{city.hours}</p>
          </div>
        </div>

        {/* Returns */}
        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.15em] text-crimson">
            <RefreshCw className="h-4 w-4" />
            {returnsTitle}
          </h2>
          <div className="divide-y divide-border/50">
            {returnsItems.map((line, i) => (
              <p key={i} className="flex items-start gap-2.5 py-3 text-sm leading-relaxed text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />
                {line}
              </p>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <div className="mx-auto mt-12 max-w-2xl">
          <h2 className="mb-6 text-center font-display text-xl font-extrabold md:text-2xl">Delivery FAQs</h2>
          <div className="space-y-3">
            {faqs.map((f) => <FaqItem key={f.id} q={f.q} a={f.a} />)}
          </div>
        </div>

      </div>
    </div>
  );
}

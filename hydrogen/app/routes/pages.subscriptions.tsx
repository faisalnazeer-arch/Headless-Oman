import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, Link } from "react-router";
import { Star, ChevronDown, ArrowRight, Settings, CheckCircle2, ChevronLeft, ChevronRight, ShieldCheck, MessageCircle } from "lucide-react";
import { useState } from "react";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.page?.heroTitle ?? "Subscriptions"} — MLS Oman` },
  { name: "description", content: data?.page?.heroSubtitle ?? "Subscribe & Save up to 15% on every MLS order." },
];

// ─── Storefront query ─────────────────────────────────────────────────────────

const PAGE_QUERY = `
  query SubscriptionsPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    page: metaobjects(type: "mls_subscription_page", first: 1) {
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
    policy: metaobjects(type: "mls_subscription_policy", first: 1) {
      nodes {
        fields {
          key value
          reference { ... on MediaImage { image { url altText } } }
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

// Admin-API version (no @inContext). Fallback for when the Storefront query returns
// nothing — e.g. if these metaobjects' Storefront access is disabled — so the page
// content never disappears. Admin always sees the data.
const ADMIN_PAGE_QUERY = `
  {
    page: metaobjects(type: "mls_subscription_page", first: 1) {
      nodes { fields { key value references(first: 20) { nodes { ... on Metaobject { id fields { key value } } } } } }
    }
    policy: metaobjects(type: "mls_subscription_policy", first: 1) {
      nodes { fields { key value reference { ... on MediaImage { image { url altText } } } references(first: 20) { nodes { ... on Metaobject { id fields { key value } } } } } }
    }
  }
` as const;

// ─── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  let pageData: any = await context.storefront.query(PAGE_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  // Fall back to the Admin API if Storefront returned no page (access may be disabled).
  if (!pageData?.page?.nodes?.length) {
    const admin = await context.adminFetch(ADMIN_PAGE_QUERY).catch(() => null);
    if ((admin as any)?.page?.nodes?.length) pageData = admin;
  }
  if (language === "AR") applyArImages(pageData);

  // ── Subscription page ──
  const node = pageData?.page?.nodes?.[0];
  const f = Object.fromEntries((node?.fields ?? []).map((x: any) => [x.key, x]));
  const refs = (key: string) => f[key]?.references?.nodes ?? [];

  const page = {
    heroTitle:      f.hero_title?.value      ?? "Eat Clean, Save Big!",
    heroSubtitle:   f.hero_subtitle?.value   ?? "",
    heroImageUrl:   f.hero_image_url?.value  ?? "",
    heroCtaText:    f.hero_cta_text?.value   ?? "Start My Subscription",
    heroCtaUrl:     f.hero_cta_url?.value    ?? "/collections/all",
    timelineTitle:  f.timeline_title?.value  ?? "Consistency Pays Off",
    benefitsTitle:  f.benefits_title?.value  ?? "The Benefits of MLS Subscription",
    stepsTitle:     f.steps_title?.value     ?? "How to Get Started",
    reviewsTitle:   f.reviews_title?.value   ?? "What Meat Lovers Say",
    faqTitle:       f.faq_title?.value       ?? "Subscription FAQs",
    manageUrl:      f.manage_url?.value      ?? "",

    timeline: refs("timeline_items").map((n: any) => {
      const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
      return { id: n.id, weekLabel: nf.week_label ?? "", healthBenefits: (nf.health_benefits ?? "").split("\n").filter(Boolean), perks: (nf.perks ?? "").split("\n").filter(Boolean) };
    }),

    benefits: refs("benefit_items").map((n: any) => {
      const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
      return { id: n.id, emoji: nf.emoji ?? "", title: nf.title ?? "", description: nf.description ?? "", imageUrl: nf.image_url ?? "" };
    }),

    steps: refs("step_items").map((n: any) => {
      const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
      return { id: n.id, number: nf.number ?? "", title: nf.title ?? "", description: nf.description ?? "", imageUrl: nf.image_url ?? "" };
    }),

    reviews: refs("review_items").map((n: any) => {
      const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
      return { id: n.id, name: nf.name ?? "", title: nf.title ?? "", body: nf.body ?? "", rating: parseInt(nf.rating ?? "5") };
    }),

    faqs: refs("faq_items").map((n: any) => {
      const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
      return { id: n.id, question: nf.question ?? "", answer: nf.answer ?? "" };
    }),
  };

  // ── Subscription policy ──
  const pNode = pageData?.policy?.nodes?.[0];
  const pf = Object.fromEntries((pNode?.fields ?? []).map((x: any) => [x.key, x]));
  const policy = {
    title:       pf.hero_title?.value             ?? "Subscription Policies",
    ctaTitle:    pf.cta_title?.value              ?? "Have a question?",
    ctaSubtitle: pf.cta_subtitle?.value           ?? "Our team is here to help you any time.",
    ctaLabel:    pf.cta_button_label?.value       ?? "Contact Us",
    ctaUrl:      pf.cta_button_url?.value         ?? "https://wa.me/971504516403",
    items: (pf.policy_items?.references?.nodes ?? []).map((n: any) => {
      const fields = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
      return { id: n.id, question: fields.question ?? "", answer: fields.answer ?? "" };
    }),
  };

  return { page, policy };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEK_BG = ["bg-crimson", "bg-crimson", "bg-rich-red", "bg-[#7a0007]"];

function SectionHead({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return (
    <div className="mb-5 text-center md:mb-7">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-crimson">{label}</p>
      <h2 className="font-display text-2xl font-extrabold text-foreground md:text-3xl">{title}</h2>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubscriptionsPage() {
  const { page, policy } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">

      {/* ══ 1. HERO ═══════════════════════════════════════════════════════════ */}
      <section className="relative flex min-h-[400px] items-center overflow-hidden md:min-h-[500px]">
        {page.heroImageUrl && (
          <img src={page.heroImageUrl} alt={page.heroTitle}
            className="absolute inset-0 h-full w-full object-cover object-center" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-charcoal/92 via-charcoal/70 to-transparent" />
        <div className="relative z-10 container mx-auto px-4 py-10 md:py-14">
          <div className="max-w-lg">
            <span className="mb-3 inline-block rounded-full bg-crimson/90 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white shadow">
              Subscribe &amp; Save up to 15%
            </span>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-white md:text-5xl lg:text-6xl">
              {page.heroTitle.includes("Save Big") ? (
                <>Eat Clean,<br /><span className="text-crimson">Save Big!</span></>
              ) : page.heroTitle}
            </h1>
            <p className="mt-3 text-base leading-relaxed text-white/90 md:text-lg">{page.heroSubtitle}</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to={page.heroCtaUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-crimson px-7 py-3 text-sm font-bold uppercase tracking-wide shadow-lg transition-all hover:bg-rich-red !text-white">
                {page.heroCtaText} <ArrowRight className="h-4 w-4" />
              </Link>
              {page.manageUrl && (
                <a href={page.manageUrl}
                  className="inline-flex items-center gap-2 rounded-lg px-7 py-3 text-sm font-bold uppercase tracking-wide transition-all !text-white"
                  style={{ border: '2px solid rgba(255,255,255,0.85)', backgroundColor: 'rgba(255,255,255,0.15)' }}>
                  <Settings className="h-4 w-4" /> Manage Plan
                </a>
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-5">
              {["🥩 Free Ribeye every order", "🚚 Free delivery AED 100+", "✅ Cancel anytime"].map((t) => (
                <span key={t} className="text-xs text-white/85">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══ 2. TIMELINE ═══════════════════════════════════════════════════════ */}
      {page.timeline.length > 0 && (
        <section className="py-8 md:py-10 overflow-hidden" style={{background:"linear-gradient(160deg,#fff5f5 0%,#fff 40%,#fff5f5 100%)"}}>
          <div className="container mx-auto px-4">
            <div className="mb-6 text-center md:mb-8">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.25em] text-crimson">Your Health Journey</p>
              <h2 className="font-display text-2xl font-extrabold text-foreground md:text-4xl">Consistency Pays Off</h2>
              <p className="mt-1 font-display text-lg font-semibold text-crimson md:text-2xl">(In Health &amp; Savings)</p>
            </div>
            <div className="hidden md:grid md:grid-cols-4 gap-4">
              {page.timeline.map((item, i) => (
                <div key={item.id} className="relative flex flex-col overflow-hidden rounded-2xl shadow-md border border-border bg-white">
                  <div className={`${WEEK_BG[i]} px-5 py-4 text-white`}>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mb-0.5">Week</p>
                    <p className="font-display text-2xl font-extrabold leading-none">{item.weekLabel.replace('Week','').replace('WEEK','').trim()}</p>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <ul className="mb-4 space-y-2">
                      {item.healthBenefits.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm text-foreground font-medium">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />{h}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto pt-3 border-t border-border/50 flex flex-col gap-1.5">
                      {item.perks.map((p) => (
                        <span key={p} className="flex items-center gap-1.5 text-[11px] font-semibold text-crimson">
                          <span className="h-1.5 w-1.5 rounded-full bg-crimson shrink-0" />{p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-4 md:hidden">
              {page.timeline.map((item, i) => (
                <div key={item.id} className="overflow-hidden rounded-2xl shadow-sm border border-border bg-white">
                  <div className={`${WEEK_BG[i]} flex items-center gap-4 px-4 py-3 text-white`}>
                    <span className="font-display text-2xl font-extrabold leading-none opacity-30">{String(i+1).padStart(2,'0')}</span>
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-75">Week</p>
                      <p className="font-display text-base font-extrabold leading-tight">{item.weekLabel.replace('Week','').replace('WEEK','').trim()}</p>
                    </div>
                  </div>
                  <div className="p-4">
                    <ul className="mb-3 space-y-1.5">
                      {item.healthBenefits.map((h) => (
                        <li key={h} className="flex items-start gap-2 text-sm font-medium text-foreground">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-crimson" />{h}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-col gap-1 pt-3 border-t border-border/50">
                      {item.perks.map((p) => (
                        <span key={p} className="flex items-center gap-1.5 text-[11px] font-semibold text-crimson">
                          <span className="h-1.5 w-1.5 rounded-full bg-crimson shrink-0" />{p}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center">
              <a href={page.heroCtaUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-crimson px-7 py-3 text-sm font-bold uppercase tracking-wide shadow-lg transition-all hover:bg-rich-red !text-white">
                Start Now — Free Ribeye + 10% Off <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ══ 3. BENEFITS ═══════════════════════════════════════════════════════ */}
      {page.benefits.length > 0 && (
        <section className="py-8 md:py-10">
          <div className="container mx-auto px-4">
            <SectionHead label="Why Choose MLS?" title={page.benefitsTitle} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {page.benefits.map(({ id, emoji, title, description, imageUrl }) => (
                <div key={id} className="flex flex-col items-center rounded-2xl border border-border bg-card pt-5 pb-6 text-center shadow-sm transition-shadow hover:shadow-md overflow-hidden">
                  {imageUrl ? (
                    <div className="flex h-20 w-full items-center justify-center px-6 mb-3">
                      <img src={imageUrl} alt={title} className="h-full w-auto max-w-full object-contain" />
                    </div>
                  ) : (
                    <span className="mb-3 text-4xl leading-none">{emoji}</span>
                  )}
                  <div className="px-4">
                    <h3 className="font-display text-sm font-bold leading-snug md:text-base">{title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground md:text-sm">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ══ 4. HOW IT WORKS ═══════════════════════════════════════════════════ */}
      {page.steps.length > 0 && (
        <section className="bg-muted/40 py-8 md:py-10">
          <div className="container mx-auto px-4">
            <SectionHead label="Simple Setup" title={page.stepsTitle} />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {page.steps.map(({ id, number, title, description, imageUrl }) => (
                <div key={id} className="flex flex-col items-center gap-3 text-center">
                  {imageUrl && (
                    <div className="flex h-52 w-full items-end justify-center">
                      <img src={imageUrl} alt={title} className="h-full w-auto max-w-full object-contain drop-shadow-lg" />
                    </div>
                  )}
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-crimson text-lg font-extrabold text-white shadow-md ring-4 ring-background">{number}</div>
                  <h3 className="font-display text-sm font-bold md:text-base">{title}</h3>
                  <p className="text-xs leading-relaxed text-muted-foreground md:text-sm">{description}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 text-center">
              <a href={page.heroCtaUrl}
                className="inline-flex items-center gap-2 rounded-lg bg-crimson px-7 py-3 text-sm font-bold uppercase tracking-wide shadow-lg transition-all hover:bg-rich-red !text-white">
                Get Started Now <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ══ 5. REVIEWS ═══════════════════════════════════════════════════════ */}
      {page.reviews.length > 0 && (
        <section className="py-8 md:py-10">
          <div className="container mx-auto px-4">
            <SectionHead label="Real Customers" title={page.reviewsTitle} sub="What They're Talking About MLS" />
            <ReviewsSlider reviews={page.reviews} />
          </div>
        </section>
      )}

      {/* ══ 6. FAQs ══════════════════════════════════════════════════════════ */}
      {page.faqs.length > 0 && (
        <section className="bg-muted/30 py-8 md:py-10">
          <div className="container mx-auto px-4">
            <SectionHead label="Got Questions?" title={page.faqTitle} />
            <div className="mx-auto max-w-2xl space-y-3">
              {page.faqs.map((item) => <FaqItem key={item.id} q={item.question} a={item.answer} />)}
            </div>
          </div>
        </section>
      )}

      {/* ══ 7. SUBSCRIPTION POLICIES ═════════════════════════════════════════ */}
      {policy.items.length > 0 && (
        <section id="policies" className="relative overflow-hidden py-10 md:py-14" style={{ background: "linear-gradient(135deg, #0f0505 0%, #1a0808 40%, #2a0a0a 100%)" }}>
          {/* Subtle background pattern */}
          <div className="pointer-events-none absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
          {/* Glow accents */}
          <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-crimson/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-crimson/10 blur-3xl" />

          <div className="relative container mx-auto px-4">

            {/* Header */}
            <div className="mb-7 text-center md:mb-9">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 py-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-white" />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white">Transparency First</span>
              </div>
              <h2 className="font-display text-2xl font-extrabold text-white md:text-4xl">{policy.title}</h2>
              <p className="mt-2 text-sm text-white/75">Clear terms so you always know where you stand.</p>
            </div>

            {/* Two-column layout on desktop */}
            <div className="mx-auto max-w-5xl lg:grid lg:grid-cols-[280px_1fr] lg:gap-12 xl:gap-16">

              {/* Left sticky panel */}
              <div className="mb-8 lg:mb-0">
                <div className="sticky top-24 rounded-2xl border border-white/30 bg-white/15 p-6 backdrop-blur-sm">
                  <ShieldCheck className="mb-3 h-8 w-8 text-crimson" />
                  <h3 className="font-display text-lg font-bold text-white">Fair & Transparent</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/80">
                    We believe in no hidden surprises. Everything about how your subscription works is laid out clearly below.
                  </p>
                  <div className="mt-5 space-y-2.5">
                    {["Cancel any time", "No lock-in contracts", "Full refund transparency", "24/7 support"].map((item) => (
                      <div key={item} className="flex items-center gap-2.5">
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-crimson/40">
                          <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                        </span>
                        <span className="text-xs font-medium text-white/85">{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 border-t border-white/20 pt-5">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/65">{policy.ctaTitle}</p>
                    <p className="mb-4 text-xs leading-relaxed text-white/75">{policy.ctaSubtitle}</p>
                    <a href={policy.ctaUrl} target="_blank" rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-crimson px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all hover:bg-rich-red hover:shadow-lg !text-white">
                      <MessageCircle className="h-3.5 w-3.5" />{policy.ctaLabel}
                    </a>
                  </div>
                </div>
              </div>

              {/* Right: policy accordion */}
              <div className="space-y-3">
                {policy.items.map((item, i) => (
                  <PolicyItem key={item.id} index={i + 1} question={item.question} answer={item.answer} />
                ))}
              </div>

            </div>
          </div>
        </section>
      )}

      {/* ══ 8. FINAL CTA ══════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-crimson py-8 md:py-10 text-center">
        <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 70% 50%, white 1px, transparent 0)", backgroundSize: "24px 24px" }} />
        <div className="relative container mx-auto px-4">
          <h2 className="font-display text-2xl font-extrabold text-white md:text-3xl">Ready to Start Saving?</h2>
          <p className="mt-2 text-sm text-white/90">Join thousands of MLS subscribers enjoying premium meat every week.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link to={page.heroCtaUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-3 text-sm font-bold uppercase tracking-wide text-crimson shadow-lg transition-all hover:bg-bone">
              {page.heroCtaText} <ArrowRight className="h-4 w-4" />
            </Link>
            {page.manageUrl && (
              <a href={page.manageUrl}
                className="inline-flex items-center gap-2 rounded-xl border-2 border-white bg-white/20 px-8 py-3 text-sm font-bold uppercase tracking-wide transition-all hover:bg-white/30 !text-white">
                <Settings className="h-4 w-4" /> Manage Plan
              </a>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Reviews Slider ───────────────────────────────────────────────────────────

type Review = { id: string; name: string; title: string; body: string; rating: number };

function ReviewsSlider({ reviews }: { reviews: Review[] }) {
  const [current, setCurrent] = useState(0);
  const count = reviews.length;
  const prev = () => setCurrent((c) => (c - 1 + count) % count);
  const next = () => setCurrent((c) => (c + 1) % count);

  const ReviewCard = ({ id, name, title, body, rating }: Review) => (
    <div key={id} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex gap-0.5">
        {Array.from({ length: rating }).map((_, i) => (
          <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
        ))}
      </div>
      <p className="font-display text-base font-bold text-foreground">{title}</p>
      <p className="flex-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <p className="text-xs font-semibold text-crimson">— {name}</p>
    </div>
  );

  return (
    <>
      <div className="hidden md:grid md:grid-cols-3 gap-5">
        {reviews.map((r) => <ReviewCard key={r.id} {...r} />)}
      </div>
      <div className="relative md:hidden">
        <div className="overflow-hidden">
          <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${current * 100}%)` }}>
            {reviews.map((r) => (
              <div key={r.id} className="w-full shrink-0 px-1"><ReviewCard {...r} /></div>
            ))}
          </div>
        </div>
        {count > 1 && (
          <>
            <button type="button" onClick={prev} aria-label="Previous"
              className="absolute -left-1 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full border border-border bg-background shadow-sm hover:border-crimson hover:text-crimson">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={next} aria-label="Next"
              className="absolute -right-1 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full border border-border bg-background shadow-sm hover:border-crimson hover:text-crimson">
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="mt-4 flex justify-center gap-2">
              {reviews.map((_, i) => (
                <button key={i} type="button" onClick={() => setCurrent(i)}
                  className={`rounded-full transition-all duration-300 ${i === current ? "h-2 w-6 bg-crimson" : "h-2 w-2 bg-border"}`} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="font-display text-sm font-semibold md:text-base">{q}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Policy accordion (dark themed) ─────────────────────────────────────────

function PolicyItem({ index, question, answer }: { index: number; question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`group overflow-hidden rounded-2xl border transition-all duration-200 ${open ? "border-crimson/70 bg-white/15" : "border-white/25 bg-white/10 hover:border-white/40 hover:bg-white/15"}`}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left md:px-6 md:py-5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${open ? "bg-crimson text-white" : "bg-white/20 text-white/75 group-hover:bg-white/30"}`}>
          {String(index).padStart(2, "0")}
        </span>
        <span className="flex-1 font-display text-sm font-semibold text-white md:text-base">{question}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-crimson" : "text-white/65"}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-relaxed text-white/80 md:px-6 md:pb-6 md:text-[0.9375rem]">{answer}</p>
        </div>
      </div>
    </div>
  );
}

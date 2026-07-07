import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ShoppingBag, Star, Tag, ArrowRight, Gift, Zap, Shield, Clock } from "lucide-react";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "MLS Rewards — Unlock Savings & Rewards" },
  { name: "description", content: "Join MLS Rewards and earn points on every purchase. Redeem for discounts on fresh halal meat delivery." },
];

const YOTPO_GUID = "IkCUJukJchRQxi9XiLD_dQ";

const REWARDS_QUERY = `
  query RewardsPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_rewards_page", first: 1) {
      nodes {
        fields {
          key value
          reference { ... on MediaImage { image { url altText } } }
        }
      }
    }
  }
` as const;

const DEFAULTS = {
  heroImage:    null as string | null,
  heroTitle:    "Unlock Savings & Rewards With MLS",
  heroSubtitle: "We value you and this program is built to save you money and upgrade your meat shopping experience.",
};

export async function loader({ context, request }: LoaderFunctionArgs) {
  try {
    const language = detectLanguage(request);
    const data = await context.storefront.query(REWARDS_QUERY, {
      variables: { language, country: "OM" as const },
      cache: context.storefront.CacheNone(),
    });
    if (language === "AR") applyArImages(data);
    const node = data?.metaobjects?.nodes?.[0];
    if (!node) return DEFAULTS;
    const f = Object.fromEntries((node.fields as any[]).map((x: any) => [x.key, x]));
    return {
      heroImage:    (f.hero_image?.reference?.image?.url ?? null)     as string | null,
      heroTitle:    (f.hero_title?.value   ?? DEFAULTS.heroTitle)      as string,
      heroSubtitle: (f.hero_subtitle?.value ?? DEFAULTS.heroSubtitle)  as string,
    };
  } catch {
    return DEFAULTS;
  }
}

// ── Reveal hook ──────────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold: 0.08 });
    obs.observe(el); return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

const fadeUp = (v: boolean, delay = 0): React.CSSProperties => ({
  transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
  opacity: v ? 1 : 0,
  transform: v ? "none" : "translateY(18px)",
});

// ── Main page ────────────────────────────────────────────────────────────────
export default function RewardsPage() {
  const { heroImage, heroTitle, heroSubtitle } = useLoaderData<typeof loader>();

  useEffect(() => {
    const SCRIPT_ID = "yotpo-loyalty-js";
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      try { (window as any).yotpoWidgetsContainer?.initWidgets(); } catch {}
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://cdn-widgetsrepository.yotpo.com/v1/loader/${YOTPO_GUID}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return (
    <div className="bg-background overflow-x-hidden">
      <HeroSection image={heroImage} title={heroTitle} subtitle={heroSubtitle} />
      <HowItWorksSection />
      <BenefitsSection />
      <WidgetSection />
      <CtaSection />
    </div>
  );
}

// ── 1. Hero ───────────────────────────────────────────────────────────────────
function HeroSection({ image, title, subtitle }: { image: string | null; title: string; subtitle: string }) {
  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        minHeight: "clamp(420px, 60vh, 600px)",
        backgroundImage: image ? `url(${image})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: image ? undefined : "#0d0605",
      }}
    >
      {/* Overlays */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.05) 35%, rgba(0,0,0,0.6) 65%, rgba(0,0,0,0.95) 100%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 85% 15%, rgba(201,168,76,0.14) 0%, transparent 50%)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 5% 95%, rgba(139,0,0,0.2) 0%, transparent 45%)" }} />

      {/* Decorative rings */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full border border-gold/10" />
      <div className="pointer-events-none absolute -right-8 -top-8 h-52 w-52 rounded-full border border-gold/8" />
      <div className="pointer-events-none absolute right-40 top-1/2 h-2 w-2 rounded-full bg-gold/50" />
      <div className="pointer-events-none absolute right-20 top-1/3 h-1.5 w-1.5 rounded-full bg-gold/35" />
      <div className="pointer-events-none absolute left-1/3 bottom-1/4 h-2 w-2 rounded-full bg-gold/25" />

      <div
        className="relative container mx-auto flex flex-col justify-end px-4 pb-0"
        style={{ minHeight: "clamp(420px, 60vh, 600px)" }}
      >
        {/* Left content */}
        <div className="max-w-xl pb-5 md:pb-0">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/35 bg-gold/12 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-gold">
            <Gift className="h-3.5 w-3.5" /> MLS Rewards Program
          </span>
          <h1
            className="font-display text-3xl font-extrabold uppercase leading-[1.1] tracking-tight md:text-4xl lg:text-[2.8rem]"
            style={{ background: "linear-gradient(135deg, #ffffff 0%, #ffffff 45%, #C9A84C 75%, #e8c96d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
          >
            {title}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/65 md:text-[0.95rem]">
            {subtitle}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3 pb-5 md:pb-8">
            <Link
              to="/collections/all"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-2.5 text-xs font-bold uppercase tracking-wider shadow-lg transition-all hover:bg-gold/90"
              style={{ color: "#1a1a1a", boxShadow: "0 6px 24px rgba(201,168,76,0.3)" }}
            >
              Start Shopping <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href="#rewards-dashboard"
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/55 transition-colors hover:text-gold"
            >
              View My Points <ArrowRight className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Ways to earn — floating chips, desktop only */}
        <div className="absolute right-8 top-1/2 hidden -translate-y-1/2 flex-col gap-3 xl:flex" style={{ width: 250 }}>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold/55">Ways to Earn</p>
          {[
            { Icon: ShoppingBag, label: "Place an Order",  note: "Earn points per order" },
            { Icon: Star,        label: "Write a Review",  note: "Earn bonus points"      },
            { Icon: Gift,        label: "Refer a Friend",  note: "Earn referral points"   },
          ].map(({ Icon, label, note }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-xl px-4 py-3"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(201,168,76,0.18)", backdropFilter: "blur(8px)" }}
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/15">
                <Icon className="h-4 w-4 text-gold" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">{label}</p>
                <p className="text-[10px] text-white/45">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 2. How It Works ───────────────────────────────────────────────────────────
const STEPS = [
  { Icon: ShoppingBag, num: "01", title: "Shop & Earn",       desc: "Place any order and automatically earn reward points. Every purchase counts." },
  { Icon: Star,        num: "02", title: "Points Add Up",     desc: "Your points grow with every order, review, and referral. Track them in your account." },
  { Icon: Tag,         num: "03", title: "Redeem & Save",     desc: "Apply your points as a discount at checkout and save on your next premium order." },
] as const;

function HowItWorksSection() {
  const { ref, visible } = useReveal();

  return (
    <section className="py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div ref={ref} className="mb-10 text-center" style={fadeUp(visible)}>
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="h-px w-8 rounded-full bg-crimson" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">How It Works</span>
            <span className="h-px w-8 rounded-full bg-crimson" />
          </div>
          <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">Three Simple Steps</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">Start earning from your very first order — no complexity, just rewards.</p>
        </div>

        <div className="relative grid gap-6 sm:grid-cols-3">
          {/* Connecting line */}
          <div className="pointer-events-none absolute left-[16.67%] right-[16.67%] top-[42px] hidden h-px sm:block"
            style={{ background: "linear-gradient(90deg, transparent, rgba(201,168,76,0.35) 20%, rgba(201,168,76,0.35) 80%, transparent)" }} />

          {STEPS.map(({ Icon, num, title, desc }, i) => {
            const { ref: sRef, visible: sVis } = useReveal();
            return (
              <div key={num} ref={sRef} className="flex flex-col items-center text-center" style={fadeUp(sVis, i * 0.12)}>
                <div className="relative mb-5">
                  <div className="absolute inset-0 rounded-full border-2 border-gold/15 animate-ping" style={{ animationDuration: `${3.5 + i}s` }} />
                  <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full border border-gold/30 bg-charcoal shadow-lg"
                    style={{ boxShadow: "0 0 20px rgba(201,168,76,0.12)" }}>
                    <Icon className="h-6 w-6 text-gold" />
                  </div>
                  <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-crimson text-[9px] font-black text-white shadow-sm">
                    {i + 1}
                  </div>
                </div>
                <h3 className="font-display text-base font-bold md:text-lg">{title}</h3>
                <p className="mt-2 max-w-[210px] text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── 3. Benefits ───────────────────────────────────────────────────────────────
const BENEFITS = [
  { Icon: Zap,    title: "Instant Points",      desc: "Points credited the moment your order is confirmed." },
  { Icon: Clock,  title: "Points Never Expire", desc: "Your earned points stay valid. Redeem whenever you're ready." },
  { Icon: Gift,   title: "Easy Redemption",     desc: "Redeem directly at checkout with just a few clicks." },
  { Icon: Shield, title: "Free to Join",        desc: "No membership fee, no commitment. Sign up in seconds." },
] as const;

function BenefitsSection() {
  const { ref, visible } = useReveal();

  return (
    <section className="relative overflow-hidden bg-charcoal py-12 md:py-14">
      <div className="pointer-events-none absolute -left-16 top-8 h-72 w-72 rounded-full bg-gold/[0.04]" />
      <div className="pointer-events-none absolute -right-10 bottom-8 h-52 w-52 rounded-full bg-crimson/[0.06]" />

      <div className="container mx-auto px-4">
        <div ref={ref} className="mb-8 text-center" style={fadeUp(visible)}>
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="h-px w-6 rounded-full bg-gold/70" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold/90">Member Benefits</span>
            <span className="h-px w-6 rounded-full bg-gold/70" />
          </div>
          <h2 className="font-display text-xl font-bold text-off-white md:text-2xl">Why Join MLS Rewards?</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ Icon, title, desc }, i) => {
            const { ref: bRef, visible: bVis } = useReveal();
            return (
              <div
                key={title} ref={bRef}
                className="group rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5 transition-all duration-300 hover:border-gold/25 hover:bg-white/[0.06]"
                style={fadeUp(bVis, i * 0.09)}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-gold/20 bg-gold/10 transition-all duration-300 group-hover:bg-gold/18">
                  <Icon style={{ height: 18, width: 18 }} className="text-gold" />
                </div>
                <h3 className="font-display text-sm font-bold text-off-white">{title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-off-white/50">{desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── 4. Widget ─────────────────────────────────────────────────────────────────
function WidgetSection() {
  const { ref, visible } = useReveal();

  return (
    <section id="rewards-dashboard" className="container mx-auto px-4 py-12 md:py-14">
      <div ref={ref} style={fadeUp(visible)}>
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className="h-px w-6 rounded-full bg-crimson" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">Your Account</span>
            <span className="h-px w-6 rounded-full bg-crimson" />
          </div>
          <h2 className="font-display text-xl font-bold md:text-2xl">Your Rewards Dashboard</h2>
          <p className="mt-1 text-sm text-muted-foreground">Log in to check your points balance and redeem rewards.</p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          <div className="yotpo-widget-instance" data-yotpo-instance-id="306800" />
        </div>
      </div>
    </section>
  );
}

// ── 5. CTA ────────────────────────────────────────────────────────────────────
function CtaSection() {
  const { ref, visible } = useReveal();

  return (
    <section className="container mx-auto px-4 pb-14">
      <div
        ref={ref}
        className="relative overflow-hidden rounded-2xl text-center"
        style={{
          ...fadeUp(visible),
          background: "linear-gradient(135deg, #0d0605 0%, #1a0a0a 50%, #1a1208 100%)",
          padding: "clamp(2rem, 5vw, 3.5rem) clamp(1.5rem, 5vw, 3rem)",
        }}
      >
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 110%, rgba(201,168,76,0.15) 0%, transparent 55%)" }} />
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full border border-gold/10" />
        <div className="pointer-events-none absolute left-10 bottom-10 h-2 w-2 rounded-full bg-gold/40" />
        <div className="pointer-events-none absolute right-1/4 top-8 h-1.5 w-1.5 rounded-full bg-gold/30" />

        <div className="relative">
          <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold/90">
            <Star className="h-3 w-3" /> Free to Join
          </span>
          <h2
            className="font-display text-2xl font-extrabold uppercase tracking-tight md:text-3xl"
            style={{ background: "linear-gradient(135deg, #fff 0%, #fff 45%, #C9A84C 75%, #e8c96d 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}
          >
            Every Order Brings You<br />Closer to Your Next Reward
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-off-white/55">
            Shop our premium cuts and earn points instantly — no sign-up fee, no expiry.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/collections/all"
              className="inline-flex items-center gap-2 rounded-full bg-gold px-7 py-3 text-xs font-bold uppercase tracking-wider transition-all hover:bg-gold/90"
              style={{ color: "#1a1a1a", boxShadow: "0 8px 28px rgba(201,168,76,0.28)" }}
            >
              Shop & Earn Points <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href="#rewards-dashboard"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/40 px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all hover:border-gold"
              style={{ color: "#fff" }}
            >
              View My Rewards
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

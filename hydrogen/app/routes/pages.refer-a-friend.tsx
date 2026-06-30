import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { useEffect } from "react";
import { Link } from "react-router";
import { User, Users, Mail, Gift, Trophy, ShoppingCart, Tag, Smile } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "Refer a Friend — MLS Oman" },
  { name: "description", content: "Refer a friend to MLS and earn rewards." },
];

const YOTPO_GUID = "3zSKLTmmtHC3S0CGw89ppA";
const REFERRAL_INSTANCE_ID = "822349";

const ICON_MAP: Record<string, LucideIcon> = {
  User, Users, Mail, Gift, Trophy, ShoppingCart, Tag, Smile,
};

const PAGE_QUERY = `
  query ReferAFriendPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_refer_page", first: 1) {
      nodes {
        fields {
          key
          value
          references(first: 10) {
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

function parseVideo(url: string): { type: "mp4" | "youtube"; url: string; thumbnail: string } {
  if (!url) return { type: "youtube", url: "", thumbnail: "" };
  if (url.includes("cdn.shopify.com/videos")) {
    const hashMatch = url.match(/\/vp\/([a-f0-9]{32})\//);
    const hash = hashMatch?.[1] ?? "";
    const thumbnail = hash
      ? `https://cdn.shopify.com/s/files/1/0821/0202/6556/files/preview_images/${hash}.thumbnail.0000000000.jpg`
      : "";
    return { type: "mp4", url, thumbnail };
  }
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) return { type: "youtube", url: `https://www.youtube.com/embed/${ytMatch[1]}`, thumbnail: "" };
  return { type: "youtube", url, thumbnail: "" };
}

function parseSteps(nodes: any[]) {
  return nodes.map((n: any) => {
    const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return { id: n.id, label: f.label ?? "", description: f.description ?? "", iconName: f.icon_name ?? "User" };
  });
}

function parseFaqs(nodes: any[]) {
  return nodes.map((n: any) => {
    const f = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return { id: n.id, question: f.question ?? "", answer: f.answer ?? "" };
  });
}

export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  const data = await context.storefront.query(PAGE_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  if (language === "AR") applyArImages(data);
  const node = data?.metaobjects?.nodes?.[0];
  const f = Object.fromEntries((node?.fields ?? []).map((x: any) => [x.key, x]));

  return {
    heroTitle:           f.hero_title?.value              ?? "Refer a Friend & Earn Rewards",
    heroSubtitle:        f.hero_subtitle?.value           ?? "Share MLS with friends and family — you both get rewarded with exclusive discounts on premium halal meat.",
    howToReferTitle:     f.how_to_refer_title?.value      ?? "How can I refer friends?",
    howToGetSteaksTitle: f.how_to_get_steaks_title?.value ?? "How to get your free steaks?",
    video:               parseVideo(f.video_url?.value ?? ""),
    referralSteps:       parseSteps(f.referral_steps?.references?.nodes ?? []),
    steaksSteps:         parseSteps(f.steaks_steps?.references?.nodes ?? []),
    faqs:                parseFaqs(f.faq_items?.references?.nodes ?? []),
  };
}

export default function ReferAFriendPage() {
  const { heroTitle, heroSubtitle, howToReferTitle, howToGetSteaksTitle, video, referralSteps, steaksSteps, faqs } = useLoaderData<typeof loader>();

  useEffect(() => {
    const existing = document.getElementById("yotpo-loyalty-js");
    if (existing) {
      if ((window as any).yotpoWidgetsContainer) {
        (window as any).yotpoWidgetsContainer.initWidgets();
      }
      return;
    }
    const script = document.createElement("script");
    script.id = "yotpo-loyalty-js";
    script.src = `https://cdn-widgetsrepository.yotpo.com/v1/loader/${YOTPO_GUID}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden py-12 md:py-16"
        style={{ background: "radial-gradient(ellipse at 60% 40%, #b45309 0%, #1a0a0a 55%, #0a0a0a 100%)" }}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-8 right-16 h-48 w-48 rounded-full bg-amber-500/20 blur-3xl" />
          <div className="absolute bottom-8 left-16 h-36 w-36 rounded-full bg-amber-600/10 blur-3xl" />
          <div className="absolute inset-0 bg-black/30" />
        </div>
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center text-white">
          <h1 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl md:text-5xl lg:text-6xl">
            {heroTitle}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base md:text-lg">
            {heroSubtitle}
          </p>
        </div>
      </div>

      {/* ── Yotpo Referral Widget ── */}
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 md:py-10">
        <div className="yotpo-widget-instance" data-yotpo-instance-id={REFERRAL_INSTANCE_ID} />
      </div>

      {/* ── How to Refer ── */}
      {referralSteps.length > 0 && (
        <section className="border-t border-border bg-muted/20 py-10 md:py-14">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <SectionHeader eyebrow="Step by Step" title={howToReferTitle} />
            <div className="mt-8 grid gap-6 sm:grid-cols-3">
              {referralSteps.slice(0, 3).map((step, i) => (
                <StepCard key={step.id} {...step} step={i + 1} />
              ))}
            </div>
            {referralSteps.length > 3 && (
              <div className="mt-6 grid gap-6 sm:grid-cols-2 sm:max-w-2xl sm:mx-auto">
                {referralSteps.slice(3).map((step, i) => (
                  <StepCard key={step.id} {...step} step={i + 4} />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── How to Get Free Steaks ── */}
      {steaksSteps.length > 0 && (
        <section className="bg-[#fdf5f5] py-10 md:py-14">
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <SectionHeader eyebrow="Free Reward" title={howToGetSteaksTitle} />
            <div className="relative mt-8 grid gap-8 sm:grid-cols-3">
              {/* connector line visible on sm+ */}
              <div className="absolute top-10 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] hidden h-px bg-crimson/20 sm:block" />
              {steaksSteps.map((step, i) => (
                <SteakStepCard key={step.id} {...step} step={i + 1} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── FAQs ── */}
      {faqs.length > 0 && (
        <section className="border-t border-border py-10 md:py-14">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeader eyebrow="Got Questions?" title="Frequently Asked Questions" />
            <div className="mt-8">
              <FaqAccordion items={faqs} />
            </div>
          </div>
        </section>
      )}

      {/* ── Full-width Autoplay Video ── */}
      {video.url && video.type === "mp4" && (
        <div className="w-full aspect-video">
          <video
            className="w-full h-full object-cover"
            src={video.url}
            poster={video.thumbnail || undefined}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>
      )}

    </div>
  );
}

// ── Shared section header ─────────────────────────────────────────────────────

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="text-center">
      <span className="inline-block rounded-full bg-crimson/10 px-4 py-1 text-xs font-bold uppercase tracking-widest text-crimson">
        {eyebrow}
      </span>
      <h2 className="mt-3 font-display text-2xl font-bold text-foreground sm:text-3xl">
        {title}
      </h2>
    </div>
  );
}

// ── Step card (How to Refer) ──────────────────────────────────────────────────

function StepCard({ label, description, iconName, step }: { label: string; description: string; iconName: string; step: number }) {
  const Icon = ICON_MAP[iconName] ?? User;
  return (
    <div className="relative flex flex-col items-center text-center gap-3 rounded-2xl bg-white px-5 pt-8 pb-6 shadow-sm border border-border transition-colors hover:border-crimson/30 hover:shadow-md">
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-crimson text-[11px] font-bold text-white shadow">
        {step}
      </span>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-crimson/10 text-crimson ring-4 ring-crimson/5">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-bold text-foreground leading-snug">{label}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

// ── Steak step card (How to Get Free Steaks) ─────────────────────────────────

function SteakStepCard({ label, description, iconName, step }: { label: string; description: string; iconName: string; step: number }) {
  const Icon = ICON_MAP[iconName] ?? ShoppingCart;
  const desc = description.includes("https://")
    ? description.split(/(https?:\/\/\S+)/).map((part, i) =>
        part.startsWith("http")
          ? <a key={i} href={part} className="text-crimson underline break-all" target="_blank" rel="noopener noreferrer">{part}</a>
          : part
      )
    : description;

  return (
    <div className="relative flex flex-col items-center text-center gap-3 rounded-2xl bg-white px-5 pt-8 pb-6 shadow-sm border border-border">
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-crimson text-[11px] font-bold text-white shadow">
        {step}
      </span>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-crimson text-white shadow-md">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-bold text-foreground leading-snug">{label}</p>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}


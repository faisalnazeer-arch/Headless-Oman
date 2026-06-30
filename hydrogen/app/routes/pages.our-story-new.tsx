import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router";
import { ArrowRight, ShieldCheck, Award, Heart } from "lucide-react";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

function clean(s: string): string {
  return (s ?? "")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/–/g, "–")
    .replace(/—/g, "—");
}

export const meta: MetaFunction = () => [
  { title: "Our Story — MLS Oman" },
  { name: "description", content: "45 years of butchery excellence. From Oman to the UAE." },
];

const PAGE_QUERY = `
  query OurStoryPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_our_story_page", first: 1) {
      nodes {
        fields {
          key value
          reference { ... on MediaImage { image { url altText width height } } }
          references(first: 20) {
            nodes {
              ... on Metaobject {
                id
                fields {
                  key value
                  reference { ... on MediaImage { image { url altText width height } } }
                }
              }
            }
          }
        }
      }
    }
  }
` as const;

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&mute=1&loop=1&playlist=${yt[1]}&controls=0&rel=0&playsinline=1`;
  return url;
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

  const slides = (f.slides?.references?.nodes ?? []).map((n: any) => {
    const sf = Object.fromEntries(n.fields.map((x: any) => [x.key, x]));
    return { id: n.id, desktop: sf.desktop_image?.reference?.image?.url ?? "", mobile: sf.mobile_image?.reference?.image?.url ?? "" };
  });

  const timelineItems = (f.timeline_items?.references?.nodes ?? []).map((n: any) => {
    const tf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return { id: n.id, year: clean(tf.year ?? ""), label: clean(tf.label ?? ""), description: clean(tf.description ?? "") };
  });

  return {
    heroImage:          f.hero_image?.reference?.image?.url          ?? "",
    quoteText:          clean(f.quote_text?.value                    ?? "WE EXIST TO NOURISH PEOPLE WITH NATURE'S FINEST RED MEAT."),
    slides,
    storyHeading:       clean(f.story_heading?.value                 ?? "Expanding from Oman to UAE:"),
    storySubheading:    clean(f.story_subheading?.value              ?? "A Butchery Legacy"),
    storyDescription:   clean(f.story_description?.value            ?? ""),
    storyImage:         f.story_image?.reference?.image?.url         ?? "",
    timelineTitle:      clean(f.timeline_title?.value                ?? "Our Journey"),
    timelineSubtitle:   clean(f.timeline_subtitle?.value             ?? ""),
    timelineItems,
    missionHeading:     clean(f.mission_heading?.value               ?? "Our Mission:"),
    missionSubheading:  clean(f.mission_subheading?.value            ?? "Quality and Tradition"),
    missionDescription: clean(f.mission_description?.value          ?? ""),
    missionImage:       f.mission_image?.reference?.image?.url       ?? "",
    videoEmbed:         toEmbed(f.video_url?.value ?? "https://youtu.be/T1ExB8rQQZs"),
    videoText:          clean(f.video_text?.value                    ?? ""),
  };
}

// ── Scroll-reveal hook ───────────────────────────────────────────────────────────
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

const fadeUp = (visible: boolean, delay = 0): React.CSSProperties => ({
  transition: `opacity 0.55s ease ${delay}s, transform 0.55s ease ${delay}s`,
  opacity: visible ? 1 : 0,
  transform: visible ? "none" : "translateY(14px)",
});

// ── Eyebrow — matches HomeBlogSection / ValueBoxesBanner ────────────────────────
function Eyebrow({ label, light = false, center = false }: { label: string; light?: boolean; center?: boolean }) {
  const lineClass = light ? "bg-gold/70" : "bg-crimson";
  const textClass = light ? "text-gold/90" : "text-crimson";
  return (
    <div className={`flex items-center gap-3 ${center ? "justify-center" : ""}`}>
      <span className={`h-px w-6 rounded-full ${lineClass}`} />
      <span className={`text-[11px] font-bold uppercase tracking-[0.2em] ${textClass}`}>{label}</span>
      {center && <span className={`h-px w-6 rounded-full ${lineClass}`} />}
    </div>
  );
}

export default function OurStoryPage() {
  const d = useLoaderData<typeof loader>();
  return (
    <div className="bg-background">
      <HeroSection    image={d.heroImage} quote={d.quoteText} />
      <StorySection   heading={d.storyHeading} subheading={d.storySubheading} description={d.storyDescription} image={d.storyImage} />
      {d.timelineItems.length > 0 && <TimelineSection title={d.timelineTitle} subtitle={d.timelineSubtitle} items={d.timelineItems} />}
      <MissionSection heading={d.missionHeading} subheading={d.missionSubheading} description={d.missionDescription} image={d.missionImage} />
      {d.slides.length > 0 && <CarouselSection slides={d.slides} />}
      <VideoSection   embed={d.videoEmbed} text={d.videoText} />
    </div>
  );
}

// ── 1. Hero ───────────────────────────────────────────────────────────────────────
function HeroSection({ image, quote }: { image: string; quote: string }) {
  const STATS = [
    { value: "45+",      label: "Years of craft" },
    { value: "100+",     label: "Premium cuts" },
    { value: "UAE",        label: "Where we serve" },
    { value: "100%",     label: "Halal certified" },
  ] as const;

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        minHeight: "clamp(380px, 56vh, 560px)",
        backgroundImage: image ? `url(${image})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: image ? undefined : "#1a0a0a",
      }}
    >
      {/* Gradient: dark at bottom + crimson tint bottom-left */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(160deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.52) 65%, rgba(0,0,0,0.9) 100%)",
      }} />
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse at 0% 100%, rgba(139,0,0,0.28) 0%, transparent 55%)",
      }} />

      {/* Content */}
      <div
        className="relative container mx-auto flex flex-col justify-end px-4 pb-0"
        style={{ minHeight: "clamp(380px, 56vh, 560px)" }}
      >
        <div className="max-w-2xl pb-5 md:pb-7">
          {/* Badge */}
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-gold/90">
            MLS Oman · Est. 1977
          </span>
          <h1 className="font-display text-2xl font-extrabold uppercase leading-tight tracking-tight text-white drop-shadow-sm md:text-3xl lg:text-[2.6rem]">
            {quote}
          </h1>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 bg-black/35 backdrop-blur-sm sm:grid-cols-4">
          {STATS.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center py-3 text-center">
              <span className="font-display text-base font-black text-white sm:text-lg">{value}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/60">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 2. Story ──────────────────────────────────────────────────────────────────────
function StorySection({ heading, subheading, description, image }: {
  heading: string; subheading: string; description: string; image: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <section className="container mx-auto px-4 py-8 md:py-10">
      <div
        ref={ref}
        className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] md:grid-cols-[3fr_2fr]"
        style={fadeUp(visible)}
      >
        {/* Image — larger side */}
        <div className="group relative min-h-[240px] overflow-hidden bg-charcoal md:min-h-0">
          {image ? (
            <>
              <img
                src={image} alt={heading}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              {/* Gradient for readability of badge */}
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-charcoal to-crimson/20" />
          )}
          <span className="absolute bottom-3 left-3 rounded-full bg-crimson px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-sm">
            Est. 1977
          </span>
        </div>

        {/* Text — with crimson left accent */}
        <div className="flex flex-col justify-center gap-3 border-l-[3px] border-crimson/20 p-6 md:p-8">
          <Eyebrow label="Our Heritage" />
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight md:text-2xl">{heading}</h2>
          <p className="font-semibold text-crimson">{subheading}</p>
          {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}

          {/* Stats row */}
          <div className="mt-1 grid grid-cols-3 gap-3 rounded-xl bg-bone/60 p-3">
            {[["45+", "Years"], ["100+", "Cuts"], ["2", "Countries"]].map(([n, l]) => (
              <div key={l} className="flex flex-col items-center text-center">
                <span className="font-display text-xl font-black text-crimson">{n}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 3. Carousel ───────────────────────────────────────────────────────────────────
type Slide = { id: string; desktop: string; mobile: string };

function CarouselSection({ slides }: { slides: Slide[] }) {
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const { ref, visible } = useReveal();

  const go = useCallback((i: number) => {
    setActive(i);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => setActive(a => (a + 1) % slides.length), 5000);
  }, [slides.length]);

  useEffect(() => {
    timer.current = setInterval(() => setActive(a => (a + 1) % slides.length), 5000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [slides.length]);

  return (
    <section className="container mx-auto px-4 pb-8 md:pb-10">
      <div
        ref={ref}
        className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-card)]"
        style={{ aspectRatio: "21/9", minHeight: 180, transition: "opacity 0.55s ease", opacity: visible ? 1 : 0 }}
      >
        <div className="absolute inset-0 bg-charcoal" />
        {slides.map((s, i) => (
          <picture key={s.id}>
            {s.mobile && <source media="(max-width:639px)" srcSet={s.mobile} />}
            <img
              src={s.desktop || s.mobile} alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{ transition: "opacity 1.2s ease", opacity: i === active ? 1 : 0 }}
            />
          </picture>
        ))}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />

        {slides.length > 1 && (
          <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5 z-10">
            {slides.map((s, i) => (
              <button
                key={s.id} onClick={() => go(i)} aria-label={`Slide ${i + 1}`}
                className="rounded-full border-0 transition-all duration-300"
                style={{ width: i === active ? 20 : 6, height: 6, cursor: "pointer", padding: 0,
                  background: i === active ? "var(--color-crimson,#8b0000)" : "rgba(255,255,255,0.5)" }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ── 4. Timeline ───────────────────────────────────────────────────────────────────
type TLItem = { id: string; year: string; label: string; description: string };

function TimelineSection({ title, subtitle, items }: { title: string; subtitle: string; items: TLItem[] }) {
  const { ref, visible } = useReveal();
  return (
    <section className="relative overflow-hidden bg-charcoal py-8 md:py-12">
      {/* Decorative circles (from ValueBoxesBanner) */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/[0.025]" />
      <div className="pointer-events-none absolute -bottom-12 left-24 h-48 w-48 rounded-full bg-white/[0.025]" />

      <div className="container mx-auto px-4">
        {/* Header */}
        <div ref={ref} className="mb-8 text-center md:mb-10" style={fadeUp(visible)}>
          <Eyebrow label="Since 1977" light center />
          <h2 className="mt-2 font-display text-xl font-bold leading-snug tracking-tight text-off-white md:text-2xl">{title}</h2>
          {subtitle && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-off-white/55">{subtitle}</p>}
        </div>

        <div className="hidden sm:block"><DesktopTimeline items={items} /></div>
        <div className="sm:hidden"><MobileTimeline items={items} /></div>
      </div>
    </section>
  );
}

function DesktopTimeline({ items }: { items: TLItem[] }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} className="relative" style={{ transition: "opacity 0.6s ease", opacity: visible ? 1 : 0 }}>
      {/* Track */}
      <div className="absolute inset-x-4" style={{ top: 15, height: 1, background: "rgba(255,255,255,0.08)" }} />
      <div className="absolute inset-x-4" style={{
        top: 15, height: 1,
        background: "linear-gradient(90deg, transparent, rgba(139,0,0,0.7) 20%, #8b0000 50%, rgba(139,0,0,0.7) 80%, transparent)",
        animation: visible ? "_tlIn 1.3s ease forwards" : "none",
      }} />

      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((item, i) => <TLCard key={item.id} item={item} index={i} />)}
      </div>

      <style>{`@keyframes _tlIn { from{clip-path:inset(0 100% 0 0)} to{clip-path:inset(0 0 0 0)} }`}</style>
    </div>
  );
}

function TLCard({ item, index }: { item: TLItem; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex flex-col items-center px-1.5 text-center"
      style={{ transition: `opacity 0.5s ease ${index * 0.09}s, transform 0.5s ease ${index * 0.09}s`, opacity: v ? 1 : 0, transform: v ? "none" : "translateY(10px)" }}
    >
      {/* Dot with ring */}
      <div className="relative z-10 mb-4">
        <div className="h-[30px] w-[30px] rounded-full bg-crimson ring-2 ring-crimson/40 ring-offset-[3px] ring-offset-charcoal flex items-center justify-center shadow-[0_0_12px_rgba(139,0,0,0.5)]">
          <div className="h-1.5 w-1.5 rounded-full bg-white" />
        </div>
      </div>

      {/* Mini card */}
      <div className="w-full rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-2.5">
        <p className="font-display text-sm font-black text-white sm:text-base md:text-lg">{item.year}</p>
        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-widest text-white/70 leading-tight">{item.label}</p>
        {item.description && (
          <p className="mt-1 text-[10px] leading-snug text-white/75" style={{ maxWidth: 90, margin: "4px auto 0" }}>{item.description}</p>
        )}
      </div>
    </div>
  );
}

function MobileTLItem({ item, index, isLast }: { item: TLItem; index: number; isLast: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect(); } }, { threshold: 0.15 });
    obs.observe(el); return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="flex gap-3"
      style={{ transition: `opacity 0.5s ease ${index * 0.07}s, transform 0.5s ease ${index * 0.07}s`, opacity: v ? 1 : 0, transform: v ? "none" : "translateX(-10px)" }}
    >
      <div className="flex flex-col items-center">
        <div className="mt-1 h-6 w-6 shrink-0 rounded-full bg-crimson ring-2 ring-crimson/30 ring-offset-2 ring-offset-charcoal shadow-[0_0_8px_rgba(139,0,0,0.4)] flex items-center justify-center">
          <div className="h-1 w-1 rounded-full bg-white" />
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-white/10" />}
      </div>
      <div className="pb-6 rounded-xl border border-white/[0.07] bg-white/[0.04] mb-2 flex-1 px-3 py-2.5">
        <p className="font-display text-base font-black text-off-white">{item.year}</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-crimson/80">{item.label}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/80">{item.description}</p>
      </div>
    </div>
  );
}

function MobileTimeline({ items }: { items: TLItem[] }) {
  return (
    <div>
      {items.map((item, i) => <MobileTLItem key={item.id} item={item} index={i} isLast={i === items.length - 1} />)}
    </div>
  );
}

// ── 5. Mission ────────────────────────────────────────────────────────────────────
const VALUES = [
  { Icon: ShieldCheck, label: "Premium Quality",     desc: "Only the finest cuts, sourced with care" },
  { Icon: Award,       label: "Time-Honoured Craft", desc: "Traditional butchery, perfected over decades" },
  { Icon: Heart,       label: "Family Values",       desc: "Built on trust, passed through generations" },
] as const;

function MissionSection({ heading, subheading, description, image }: {
  heading: string; subheading: string; description: string; image: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <section className="container mx-auto px-4 py-8 md:py-10">
      <div
        ref={ref}
        className="grid overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] md:grid-cols-[2fr_3fr]"
        style={fadeUp(visible)}
      >
        {/* Text — left, narrower */}
        <div className="flex flex-col justify-center gap-3 border-r-[3px] border-crimson/20 p-6 md:p-8 order-2 md:order-1">
          <Eyebrow label="Our Purpose" />
          <h2 className="font-display text-xl font-bold leading-snug tracking-tight md:text-2xl">{heading}</h2>
          <p className="font-semibold text-crimson">{subheading}</p>
          {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}

          {/* Icon value list */}
          <div className="mt-1 flex flex-col gap-2.5">
            {VALUES.map(({ Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-crimson/10">
                  <Icon className="h-3.5 w-3.5 text-crimson" />
                </div>
                <p className="text-sm">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className="text-muted-foreground"> — {desc}</span>
                </p>
              </div>
            ))}
          </div>

          <Link
            to="/collections/all"
            className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-crimson px-5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-rich-red hover:shadow-md"
            style={{ color: "#fff" }}
          >
            Shop Our Cuts <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Image — larger side */}
        <div className="group relative min-h-[240px] overflow-hidden bg-charcoal order-1 md:order-2 md:min-h-0">
          {image ? (
            <>
              <img
                src={image} alt={subheading}
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-charcoal to-crimson/20" />
          )}
          <span className="absolute bottom-3 right-3 rounded-full bg-gold/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-charcoal shadow-sm">
            Our Mission
          </span>
        </div>
      </div>
    </section>
  );
}

// ── 6. Video ──────────────────────────────────────────────────────────────────────
function VideoSection({ embed, text }: { embed: string; text: string }) {
  const { ref, visible } = useReveal();
  return (
    <section className="container mx-auto px-4 pb-10 md:pb-14">
      <div
        ref={ref}
        className="relative overflow-hidden rounded-2xl shadow-[var(--shadow-card)]"
        style={{ aspectRatio: "16/7", minHeight: 220, transition: "opacity 0.6s ease", opacity: visible ? 1 : 0 }}
      >
        <div className="absolute inset-0 bg-charcoal" />
        <iframe
          className="absolute inset-0 h-full w-full scale-[1.01]"
          src={embed}
          allow="autoplay; fullscreen; picture-in-picture"
          style={{ border: "none", pointerEvents: "none" }}
          title="MLS Story Video"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/25" />

        {text && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6">
            <div className="text-center">
              <Eyebrow label="MLS Oman" light center />
              <p
                className="mt-3 font-display font-black uppercase leading-tight text-white drop-shadow"
                style={{ fontSize: "clamp(1.1rem, 3.5vw, 2.8rem)", maxWidth: 680 }}
              >
                {text}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

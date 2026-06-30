import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { Mail, MessageCircle, RefreshCw, BadgeCheck, Quote } from "lucide-react";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "Refund & Exchange Policy — MLS Oman" },
  { name: "description", content: "Learn about MLS Oman's 100% money back guarantee, refund and exchange policy." },
];

const REFUND_QUERY = `
  query RefundPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_refund_page", first: 1) {
      nodes {
        fields {
          key
          value
          reference {
            ... on MediaImage { image { url altText } }
          }
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

export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  const data = await context.storefront.query(REFUND_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  if (language === "AR") applyArImages(data);
  const node = data?.metaobjects?.nodes?.[0];
  const f = Object.fromEntries((node?.fields ?? []).map((x: any) => [x.key, x]));

  const policyCards = (f.policy_cards?.references?.nodes ?? []).map((n: any) => {
    const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return { id: n.id, title: nf.title ?? "", description: nf.description ?? "" };
  });

  return {
    heroImage:       f.hero_image?.reference?.image?.url ?? null,
    shareTitle:      f.share_title?.value      ?? "Share with Us",
    shareDesc:       f.share_description?.value ?? "",
    shareEmail:      f.share_email?.value       ?? "contactus@mls.om",
    shareWhatsapp:   f.share_whatsapp?.value    ?? "+96892423242",
    guaranteeTitle:  f.guarantee_title?.value   ?? "How does our 100% money back guarantee work?",
    step1Label:      f.step_1_label?.value      ?? "Email / Message",
    step1Desc:       f.step_1_desc?.value       ?? "",
    step2Label:      f.step_2_label?.value      ?? "Exchange",
    step2Desc:       f.step_2_desc?.value       ?? "",
    step3Label:      f.step_3_label?.value      ?? "Refund",
    step3Desc:       f.step_3_desc?.value       ?? "",
    testimonialName: f.testimonial_name?.value  ?? "",
    testimonialText: f.testimonial_text?.value  ?? "",
    policyCards,
  };
}

export default function RefundExchangePage() {
  const d = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero Image ─────────────────────────────────────── */}
      {d.heroImage && (
        <div className="w-full overflow-hidden">
          <img src={d.heroImage} alt="Refund Policy" className="w-full max-h-[480px] object-cover" />
        </div>
      )}

      {/* ── Share with Us ──────────────────────────────────── */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <h2 className="font-display text-2xl font-extrabold md:text-3xl">{d.shareTitle}</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">{d.shareDesc}</p>
          <p className="mt-4 text-sm text-muted-foreground md:text-base">
            You can email us at{" "}
            <a href={`mailto:${d.shareEmail}`} className="font-semibold text-crimson hover:underline">{d.shareEmail}</a>
            {" "}or WhatsApp at{" "}
            <a href={`https://wa.me/${d.shareWhatsapp.replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-crimson hover:underline">{d.shareWhatsapp}</a>
            {" "}within 24 hours of receiving your order.
          </p>
        </div>
      </div>

      {/* ── Guarantee Steps ────────────────────────────────── */}
      <div className="bg-muted/30 py-14">
        <div className="container mx-auto max-w-4xl px-4">
          <h2 className="font-display mb-10 text-center text-2xl font-extrabold md:text-3xl">
            {d.guaranteeTitle}
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Mail,        label: d.step1Label, desc: d.step1Desc, color: "#8b0000" },
              { icon: RefreshCw,   label: d.step2Label, desc: d.step2Desc, color: "#b45309" },
              { icon: BadgeCheck,  label: d.step3Label, desc: d.step3Desc, color: "#15803d" },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="flex flex-col items-center rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: `${color}20` }}>
                  <Icon className="h-7 w-7" style={{ color }} />
                </div>
                <h3 className="font-display mb-2 text-base font-bold">{label}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Testimonial ────────────────────────────────────── */}
      {d.testimonialText && (
        <div className="border-b border-border bg-background py-14">
          <div className="container mx-auto max-w-3xl px-4 text-center">
            <h2 className="font-display mb-8 text-2xl font-extrabold md:text-3xl">{d.guaranteeTitle}</h2>
            <div className="flex flex-col items-center">
              <Quote className="mb-3 h-10 w-10 text-crimson" fill="currentColor" />
              {d.testimonialName && (
                <p className="mb-3 text-sm font-semibold text-muted-foreground">{d.testimonialName}</p>
              )}
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                "{d.testimonialText}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Policy Cards ───────────────────────────────────── */}
      {d.policyCards.length > 0 && (
        <div className="py-14">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.policyCards.map((card) => (
                <div key={card.id} className="rounded-2xl border border-border bg-crimson/5 p-6">
                  <h3 className="font-display mb-3 text-base font-bold text-foreground">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

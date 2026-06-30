import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { useCallback } from "react";
import { FaqAccordion } from "@/components/ui/FaqAccordion";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "MLS Affiliate Program — Make Money with MLS" },
  { name: "description", content: "Join the MLS Partner Program. Earn 10% commission on every sale you refer." },
];

const PAGE_QUERY = `
  query AffiliatePage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_affiliate_page", first: 1) {
      nodes {
        fields {
          key
          value
          reference {
            ... on MediaImage { image { url altText } }
          }
          references(first: 20) {
            nodes {
              ... on Metaobject {
                id
                fields {
                  key
                  value
                  reference {
                    ... on MediaImage { image { url altText } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
` as const;

// Admin-API version (no @inContext). Used as a fallback when the Storefront query
// returns nothing — e.g. if this metaobject's Storefront access is disabled — so the
// page content never disappears. Admin always sees the data.
const ADMIN_PAGE_QUERY = `
  {
    metaobjects(type: "mls_affiliate_page", first: 1) {
      nodes {
        fields {
          key
          value
          reference { ... on MediaImage { image { url altText } } }
          references(first: 20) {
            nodes {
              ... on Metaobject {
                id
                fields {
                  key
                  value
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
  const data = await context.storefront.query(PAGE_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  if (language === "AR") applyArImages(data);
  let node = data?.metaobjects?.nodes?.[0];
  if (!node) {
    const adminData = await context.adminFetch(ADMIN_PAGE_QUERY).catch(() => null);
    if (language === "AR") applyArImages(adminData);
    node = (adminData as any)?.metaobjects?.nodes?.[0] ?? null;
  }
  const f = Object.fromEntries((node?.fields ?? []).map((x: any) => [x.key, x]));

  const features = (f.features?.references?.nodes ?? []).map((n: any) => {
    const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x]));
    return {
      id: n.id,
      title: nf.title?.value ?? "",
      description: nf.description?.value ?? "",
      image: nf.image?.reference?.image?.url ?? "",
    };
  });

  const faqs = (f.faq_items?.references?.nodes ?? []).map((n: any) => {
    const nf = Object.fromEntries(n.fields.map((x: any) => [x.key, x.value]));
    return { id: n.id, question: nf.question ?? "", answer: nf.answer ?? "" };
  });

  return {
    heroTitle:         f.hero_title?.value                       ?? "Make Money with MLS",
    heroSubtitle:      f.hero_subtitle?.value                    ?? "Spread the word about MLS and earn a commission directly into your bank account.",
    heroImage:         f.hero_image?.reference?.image?.url       ?? "",
    heroImageMobile:   f.hero_image_mobile?.reference?.image?.url ?? "",
    heroCtaLabel:      f.hero_cta_label?.value                   ?? "Start Earning Now",
    heroLoginLabel:    f.hero_login_label?.value                  ?? "Log in",
    heroLoginUrl:      f.hero_login_url?.value                   ?? "https://affiliates.socialsnowball.io/auth/affiliate/login",
    stepsTitle:        f.steps_title?.value                      ?? "How It Works",
    stepsSubtitle:     f.steps_subtitle?.value                   ?? "Join now to start promoting MLS and earning a commission in 3 simple steps:",
    step1Title:        f.step_1_title?.value                     ?? "Become Our Partner",
    step1Desc:         f.step_1_desc?.value                      ?? "",
    step2Title:        f.step_2_title?.value                     ?? "Promote MLS",
    step2Desc:         f.step_2_desc?.value                      ?? "",
    step3Title:        f.step_3_title?.value                     ?? "Earn 10% Commission",
    step3Desc:         f.step_3_desc?.value                      ?? "",
    overviewTitle:     f.overview_title?.value                   ?? "Program Overview",
    overviewSubtitle:  f.overview_subtitle?.value                ?? "We are here to support you at every step.",
    features,
    paymentTitle:      f.payment_title?.value                    ?? "How You'll Get Paid",
    forYouTitle:       f.for_you_title?.value                    ?? "For You:",
    forYouBullets:     (f.for_you_bullets?.value ?? "").split("\n").filter(Boolean),
    forFriendTitle:    f.for_friend_title?.value                 ?? "For Your Friend & Family:",
    forFriendBullets:  (f.for_friend_bullets?.value ?? "").split("\n").filter(Boolean),
    testimonialAuthor: f.testimonial_author?.value               ?? "",
    testimonialText:   f.testimonial_text?.value                 ?? "",
    registerTitle:     f.register_title?.value                   ?? "Register",
    snowballFormId:    f.snowball_form_id?.value                 ?? "03b6253f-796a-46a2-9a9c-dadfbe5b4cc0",
    faqTitle:          f.faq_title?.value                        ?? "FAQs",
    faqs,
  };
}

export default function AffiliatePage() {
  const d = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">

      {/* ── Hero ── */}
      <div className="relative overflow-hidden" style={{ minHeight: 300 }}>
        <picture>
          {d.heroImageMobile && <source media="(max-width: 639px)" srcSet={d.heroImageMobile} />}
          {d.heroImage && (
            <img src={d.heroImage} alt={d.heroTitle} className="absolute inset-0 w-full h-full object-cover" />
          )}
        </picture>
        <div className="absolute inset-0" style={{ background: "rgba(7,7,7,0.55)" }} />
        <div className="relative z-10 flex flex-col items-center justify-center text-center text-white px-4 py-16 md:py-20" style={{ minHeight: 300 }}>
          <h1 className="font-display text-3xl font-bold sm:text-4xl md:text-5xl">{d.heroTitle}</h1>
          <p className="mt-3 max-w-md text-sm text-white/85 sm:text-base leading-relaxed">{d.heroSubtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <a
              href="#affiliate-register"
              className="rounded-md px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#a70a10" }}
            >
              {d.heroCtaLabel}
            </a>
            <a
              href={d.heroLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-8 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "#a70a10" }}
            >
              {d.heroLoginLabel}
            </a>
          </div>
        </div>
      </div>

      {/* ── How It Works ── */}
      <section className="py-12 md:py-16" style={{ background: "#f3f3f3" }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">{d.stepsTitle}</h2>
            <p className="mt-2 text-sm text-gray-600 sm:text-base">{d.stepsSubtitle}</p>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { num: 1, title: d.step1Title, desc: d.step1Desc },
              { num: 2, title: d.step2Title, desc: d.step2Desc },
              { num: 3, title: d.step3Title, desc: d.step3Desc },
            ].map((step) => (
              <div key={step.num} className="flex flex-col items-center text-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-900 text-2xl font-extrabold text-gray-900">
                  {step.num}
                </div>
                <p className="text-sm font-bold text-gray-800">{step.title}</p>
                <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Program Overview ── */}
      {d.features.length > 0 && (
        <section className="py-12 md:py-16" style={{ background: "#fce8e8" }}>
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center mb-10">
              <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">{d.overviewTitle}</h2>
              <p className="mt-2 text-sm text-gray-600 sm:text-base">{d.overviewSubtitle}</p>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {d.features.map((feat) => (
                <div key={feat.id} className="flex flex-col rounded-xl overflow-hidden bg-white shadow-sm">
                  {feat.image && (
                    <div className="w-full bg-gray-50" style={{ aspectRatio: "16/9" }}>
                      <img src={feat.image} alt={feat.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-5 flex flex-col gap-2" style={{ background: "#fce8e8" }}>
                    <p className="text-base font-bold text-gray-900">{feat.title}</p>
                    <p className="text-sm text-gray-700 leading-relaxed">{feat.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How You'll Get Paid ── */}
      <section className="py-12 md:py-16 bg-white">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <h2 className="mb-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl">{d.paymentTitle}</h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { title: d.forYouTitle, bullets: d.forYouBullets },
              { title: d.forFriendTitle, bullets: d.forFriendBullets },
            ].map((card) => (
              <div key={card.title} className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-6">
                <h3 className="text-base font-bold text-gray-900">{card.title}</h3>
                <ul className="flex flex-col gap-2">
                  {card.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700">
                      <span className="mt-1 shrink-0 h-2 w-2 rounded-full bg-gray-800" />
                      {b}
                    </li>
                  ))}
                </ul>
                <a
                  href="#affiliate-register"
                  className="mt-auto inline-block rounded-md px-6 py-2 text-sm font-semibold w-fit transition-opacity hover:opacity-90"
                  style={{ background: "#a70a10", color: "#ffffff" }}
                >
                  Join Now
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonial ── */}
      {d.testimonialText && (
        <section className="py-12 md:py-14" style={{ background: "#fce8e8" }}>
          <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
            <div className="text-5xl font-extrabold leading-none mb-2" style={{ color: "#a70a10" }}>"</div>
            {d.testimonialAuthor && (
              <p className="text-sm font-bold text-gray-700 mb-3">{d.testimonialAuthor}</p>
            )}
            <p className="text-sm text-gray-700 leading-relaxed sm:text-base">"{d.testimonialText}"</p>
          </div>
        </section>
      )}

      {/* ── Register (Social Snowball popup) ── */}
      <section id="affiliate-register" className="py-12 md:py-16 bg-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <h2 className="mb-3 text-center text-2xl font-bold text-gray-900 sm:text-3xl">{d.registerTitle}</h2>
          <p className="mb-8 text-center text-sm text-gray-500">Fill out the short form to become an MLS Partner and start earning commissions.</p>
          <AffiliateRegisterButton formId={d.snowballFormId} />
        </div>
      </section>

      {/* ── FAQs ── */}
      {d.faqs.length > 0 && (
        <section className="py-12 md:py-16 bg-white border-t border-gray-100">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="mb-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl">{d.faqTitle}</h2>
            <FaqAccordion items={d.faqs} />
          </div>
        </section>
      )}

    </div>
  );
}

// ── Affiliate Register Button (popup) ────────────────────────────────────────

function AffiliateRegisterButton({ formId }: { formId: string }) {
  const openForm = useCallback(() => {
    const url = `https://app.socialsnowball.io/register-form/muscat-livestock.myshopify.com/${formId}`;
    const w = 520;
    const h = 760;
    const left = Math.max(0, (window.screen.width - w) / 2);
    const top  = Math.max(0, (window.screen.height - h) / 2);
    window.open(url, "affiliate-signup", `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`);
  }, [formId]);

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        onClick={openForm}
        className="inline-flex items-center gap-2 rounded-lg px-10 py-4 text-base font-bold text-white shadow-lg transition-opacity hover:opacity-90 cursor-pointer"
        style={{ background: "#a70a10" }}
      >
        Apply Now — It's Free
      </button>
      <p className="text-xs text-gray-400">Opens a secure sign-up window · Powered by Social Snowball</p>
    </div>
  );
}

import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData } from "react-router";
import { FaqAccordion, parseFaqItems } from "@/components/ui/FaqAccordion";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "FAQs — MLS Oman" },
  { name: "description", content: "Find answers to the most common questions about MLS Oman — delivery, halal certification, custom cuts, and more." },
  { tagName: "link", rel: "canonical", href: "https://mls.om/pages/faqs" },
  { "script:ld+json": {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    name: "MLS Oman — Frequently Asked Questions",
    url: "https://mls.om/pages/faqs",
    mainEntity: [
      { "@type": "Question", name: "How fast is delivery in Dubai?", acceptedAnswer: { "@type": "Answer", text: "We deliver fresh meat within 1 hour across Dubai, 7 days a week until 8:45 PM." } },
      { "@type": "Question", name: "Do you deliver to Abu Dhabi?", acceptedAnswer: { "@type": "Answer", text: "Yes, we deliver to Abu Dhabi within 2 hours for same-day orders placed before 8:45 PM." } },
      { "@type": "Question", name: "Is MLS Oman meat halal certified?", acceptedAnswer: { "@type": "Answer", text: "Yes, all our meat is 100% halal certified from accredited slaughterhouses." } },
      { "@type": "Question", name: "What is the minimum order?", acceptedAnswer: { "@type": "Answer", text: "There is no minimum order. Free delivery on orders above AED 350." } },
      { "@type": "Question", name: "Do you deliver to Sharjah and Ajman?", acceptedAnswer: { "@type": "Answer", text: "Yes, we offer same-day delivery across Sharjah and Ajman for orders placed before 8:45 PM." } },
    ],
  }},
];

const FAQ_QUERY = `#graphql
  query FaqPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobjects(type: "mls_faq_page", first: 1) {
      nodes {
        fields {
          key
          value
          reference {
            ... on MediaImage { image { url altText } }
          }
          references(first: 50) {
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
  const data = await context.storefront.query(FAQ_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  if (language === "AR") applyArImages(data);
  const node = data?.metaobjects?.nodes?.[0];
  const f = Object.fromEntries(
    (node?.fields ?? []).map((x: any) => [x.key, x])
  );
  return {
    heroTitle:    f.hero_title?.value    ?? "Frequently Asked Questions",
    heroSubtitle: f.hero_subtitle?.value ?? "Everything you need to know about our products, delivery, and service.",
    heroImage:    f.hero_image?.reference?.image?.url ?? null,
    faqItems:     parseFaqItems(f.faq_items?.references?.nodes ?? []),
    ctaHeading:   f.cta_heading?.value   ?? "Still have questions?",
    ctaSubtitle:  f.cta_subtitle?.value  ?? "Our team is available 9 AM – 10 PM, all days of the week.",
  };
}

export default function FaqPage() {
  const { heroTitle, heroSubtitle, heroImage, faqItems, ctaHeading, ctaSubtitle } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-background">

      {/* Hero */}
      <div
        className="relative overflow-hidden py-20 md:py-28"
        style={heroImage
          ? { backgroundImage: `url(${heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { background: "linear-gradient(135deg, #1a0a0a 0%, #3d0000 50%, #1a0a0a 100%)" }
        }
      >
        <div className="absolute inset-0 bg-black/60" />
        <div className="relative container mx-auto px-4 text-center text-white">
          <span className="mb-4 inline-block rounded-full border border-crimson/40 bg-crimson/20 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
            Help Center
          </span>
          <h1 className="font-display text-4xl font-extrabold md:text-5xl lg:text-6xl">
            {heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70 md:text-lg">
            {heroSubtitle}
          </p>
        </div>
      </div>

      {/* FAQ Accordion + CTA */}
      <div className="container mx-auto max-w-3xl px-4 py-16">
        <FaqAccordion
          items={faqItems}
          showCta
          ctaHeading={ctaHeading}
          ctaSubtitle={ctaSubtitle}
        />
      </div>

    </div>
  );
}

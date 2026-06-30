import type { MetaFunction, ActionFunctionArgs, LoaderFunctionArgs } from "@shopify/remix-oxygen";
import { Form, useActionData, useNavigation, useLoaderData } from "react-router";
import { SHOPIFY_STORE_PERMANENT_DOMAIN } from "~/lib/shopify";
import { MapPin, Phone, Mail, Clock, MessageCircle, CheckCircle2, ArrowRight, Send } from "lucide-react";
import { detectLanguage } from "../lib/locale";
import { applyArImages } from "../lib/arImages";

export const meta: MetaFunction = () => [
  { title: "Contact Us — MLS Oman" },
  { name: "description", content: "Reach MLS Oman — Premium halal meat delivered. Call, WhatsApp or email us 9 AM to 10 PM daily." },
  { tagName: "link", rel: "canonical", href: "https://mls.om/pages/contact" },
  { "script:ld+json": {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact MLS Oman",
    url: "https://mls.om/pages/contact",
    description: "Reach MLS Oman by phone, WhatsApp or email. We're available 9 AM to 10 PM daily.",
    mainEntity: {
      "@type": "Organization",
      name: "MLS Oman",
      url: "https://mls.om",
      telephone: "+96892423242",
      email: "contactus@mls.om",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Marasi Drive, Business Bay",
        addressLocality: "Dubai",
        addressCountry: "AE",
      },
      openingHours: "Mo-Su 09:00-22:00",
    },
  }},
];

const CONTACT_QUERY = `
  query ContactPage($language: LanguageCode, $country: CountryCode)
  @inContext(language: $language, country: $country) {
    metaobject(handle: { type: "mls_contact_page", handle: "contact-page" }) {
      fields {
        key
        value
        reference {
          ... on MediaImage {
            image { url altText }
          }
        }
      }
    }
  }
` as const;

export async function loader({ context, request }: LoaderFunctionArgs) {
  const language = detectLanguage(request);
  const data = await context.storefront.query(CONTACT_QUERY, {
    variables: { language, country: "AE" as const },
    cache: context.storefront.CacheNone(),
  });
  if (language === "AR") applyArImages(data);
  const fields = Object.fromEntries(
    (data?.metaobject?.fields ?? []).map((f: any) => [f.key, f])
  );
  return {
    heroTitle:    fields.hero_title?.value    ?? "Get in Touch",
    heroSubtitle: fields.hero_subtitle?.value ?? "Questions about your order, custom cuts, or bulk buying? Our team responds within the hour.",
    heroImage:    fields.hero_image?.reference?.image?.url ?? null,
    phone:        fields.phone?.value         ?? "+971 50 451 6403",
    email:        fields.email?.value         ?? "contactus@mls.om",
    hours:        fields.hours?.value         ?? "9 AM – 10 PM",
    hoursSub:     fields.hours_sub?.value     ?? "All days of the week",
    addressLine1: fields.address_line1?.value ?? "E-09, Light Industrial Unit 6",
    addressLine2: fields.address_line2?.value ?? "Dubai Silicon Oasis · Dubai · UAE",
    whatsappUrl:  fields.whatsapp_url?.value  ?? "https://wa.me/971504516403",
    mapsUrl:      fields.maps_url?.value      ?? "https://maps.google.com/?q=Dubai+Silicon+Oasis+Dubai+UAE",
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const name    = String(form.get("name")    ?? "").trim();
  const email   = String(form.get("email")   ?? "").trim();
  const phone   = String(form.get("phone")   ?? "").trim();
  const message = String(form.get("message") ?? "").trim();

  if (!name || !email || !message) return { ok: false, error: "Please fill in all required fields." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };

  try {
    const baseUrl = `https://${SHOPIFY_STORE_PERMANENT_DOMAIN}`;

    // Step 1 — GET the contact page to obtain session cookies + CSRF token.
    const getRes = await fetch(`${baseUrl}/contact`, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "Mozilla/5.0 (compatible; MLSContactForm/1.0)",
      },
    });
    const html = await getRes.text();

    // Extract CSRF token — handle any attribute order and single/double quotes.
    const inputTag = html.match(/<input[^>]+?name=["']authenticity_token["'][^>]*?>/i)?.[0] ?? "";
    const csrfToken = inputTag.match(/value=["']([^"']+)["']/i)?.[1] ?? "";

    // Extract cookies — strip attributes (Path, HttpOnly, Secure, SameSite) so
    // we forward only the name=value pairs that the browser would send back.
    let cookiePairs: string[] = [];
    if (typeof (getRes.headers as any).getSetCookie === "function") {
      // Standard API available in newer runtimes (Cloudflare Workers, Node 20+)
      cookiePairs = ((getRes.headers as any).getSetCookie() as string[])
        .map((c: string) => c.split(";")[0].trim());
    } else {
      cookiePairs = (getRes.headers.get("set-cookie") ?? "")
        .split(/,(?=\s*[a-zA-Z0-9_\-%]+=)/)
        .map((c: string) => c.split(";")[0].trim())
        .filter(Boolean);
    }
    const cookieHeader = cookiePairs.join("; ");

    // Step 2 — POST with CSRF token and session cookies.
    const body = new URLSearchParams({
      form_type: "contact",
      utf8: "✓",
      ...(csrfToken ? { authenticity_token: csrfToken } : {}),
      "contact[name]": name,
      "contact[email]": email,
      "contact[phone]": phone,
      "contact[body]": message,
    });

    const postRes = await fetch(`${baseUrl}/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; MLSContactForm/1.0)",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: body.toString(),
      redirect: "manual",
    });

    const location = postRes.headers.get("location") ?? "";
    // Shopify redirects to ?customer_posted=true on success (status 302).
    // Accept any non-server-error as success.
    if (postRes.status < 500 && (postRes.status < 400 || location.includes("customer_posted"))) {
      return { ok: true };
    }

    console.warn("[contact] POST failed — status:", postRes.status, "location:", location, "csrfLen:", csrfToken.length);
    return { ok: false, error: "Could not send your message. Please contact us directly via WhatsApp or email." };
  } catch (err) {
    console.error("[contact] fetch error:", err);
    return { ok: false, error: "Could not send your message. Please contact us directly via WhatsApp or email." };
  }
}

export default function ContactPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  const cards = [
    { icon: Phone, label: "WhatsApp / Call", value: data.phone,        sub: "Tap to open WhatsApp",      href: data.whatsappUrl,  color: "#25D366" },
    { icon: Mail,  label: "Email",            value: data.email,        sub: "We reply within a few hours", href: `mailto:${data.email}`, color: "var(--color-crimson,#8b0000)" },
    { icon: Clock, label: "Support Hours",    value: data.hours,        sub: data.hoursSub,               href: null,              color: "var(--color-crimson,#8b0000)" },
    { icon: MapPin,label: "Address",          value: data.addressLine1, sub: data.addressLine2,           href: data.mapsUrl,      color: "var(--color-crimson,#8b0000)" },
  ];

  return (
    <div className="bg-background min-h-screen">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden py-16 text-white"
        style={data.heroImage
          ? { backgroundImage: `url(${data.heroImage})`, backgroundSize: "cover", backgroundPosition: "center" }
          : { backgroundColor: "#1a0a0a" }
        }
      >
        {/* Overlay — stronger when image present */}
        <div
          className="absolute inset-0"
          style={{
            background: data.heroImage
              ? "linear-gradient(135deg, rgba(26,10,10,0.85) 0%, rgba(139,0,0,0.6) 100%)"
              : "radial-gradient(circle at 20% 50%, #8b000033 0%, transparent 60%), radial-gradient(circle at 80% 20%, #8b000033 0%, transparent 50%)",
          }}
        />
        <div className="relative container mx-auto px-4 text-center">
          <span className="mb-3 inline-block rounded-full border border-crimson/40 bg-crimson/20 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-crimson-foreground/80">
            We're here for you
          </span>
          <h1 className="font-display mt-2 text-4xl font-extrabold md:text-5xl">{data.heroTitle}</h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-white/70">{data.heroSubtitle}</p>
        </div>
      </div>

      {/* ── Info + Form ───────────────────────────────────────────────── */}
      <div className="container mx-auto grid gap-8 px-4 py-12 lg:grid-cols-5 lg:gap-12">

        {/* Contact cards */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div>
            <h2 className="font-display text-xl font-bold">Contact Information</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Multiple ways to reach us — pick what's easiest.</p>
          </div>

          {cards.map(({ icon: Icon, label, value, sub, href, color }) => (
            <div key={label} className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-all hover:border-crimson/40">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ backgroundColor: color }}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                {href ? (
                  <a
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm font-semibold text-foreground transition-colors hover:text-crimson"
                  >
                    {value}
                    <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </a>
                ) : (
                  <p className="text-sm font-semibold text-foreground">{value}</p>
                )}
                <p className="text-[10px] text-muted-foreground">{sub}</p>
              </div>
            </div>
          ))}

          <a
            href={data.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90"
          >
            <MessageCircle className="h-5 w-5" />
            Start WhatsApp Chat
          </a>
        </div>

        {/* Form */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-3">
          {actionData?.ok ? (
            <div className="flex flex-col items-center gap-5 py-12 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-green-50">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div>
                <h3 className="font-display text-2xl font-bold">Message Sent!</h3>
                <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
                  Thank you for reaching out. A member of our team will get back to you shortly.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="font-display text-xl font-bold">Send a Message</h2>
                <p className="mt-1 text-sm text-muted-foreground">Fill in the form and we'll get back to you within hours.</p>
              </div>
              {actionData?.error && (
                <div className="mb-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {actionData.error}
                </div>
              )}
              <Form method="post" className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" name="name" type="text" placeholder="Your full name" required />
                  <Field label="Phone" name="phone" type="tel" placeholder="+971 50 000 0000" />
                </div>
                <Field label="Email" name="email" type="email" placeholder="you@email.com" required />
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Message <span className="text-crimson">*</span>
                  </label>
                  <textarea
                    name="message"
                    required
                    rows={5}
                    placeholder="Tell us how we can help — order questions, custom cuts, bulk orders…"
                    className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-crimson"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center gap-2 rounded-xl bg-crimson py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-rich-red hover:shadow-md disabled:opacity-60"
                >
                  {submitting ? "Sending…" : <><Send className="h-4 w-4" /> Send Message</>}
                </button>
              </Form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, name, type, placeholder, required }: {
  label: string; name: string; type: string; placeholder: string; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={`field-${name}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-crimson">*</span>}
      </label>
      <input
        id={`field-${name}`}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-crimson"
      />
    </div>
  );
}

import { Link } from "react-router";
import { ArrowRight, Truck, ShieldCheck, Package, Star } from "lucide-react";
import { shopifyImageUrl } from "@/lib/shopify";

export interface ValueBannerData {
  eyebrow: string;
  heading: string;
  body: string;
  btn1Label: string;
  btn1Link: string;
  btn2Label: string;
  btn2Link: string;
  imageUrl: string | null;
  imageAlt: string;
}

interface Props {
  banner?: ValueBannerData | null;
}

const VALUE_PROPS = [
  { icon: ShieldCheck, label: "100% Halal Certified" },
  { icon: Truck,       label: "Same-Day Delivery" },
  { icon: Star,        label: "Premium Quality Cuts" },
  { icon: Package,     label: "Value Boxes from OMR 5" },
];

export function ValueBoxesBanner({ banner }: Props) {
  if (!banner) return null;

  // Image-only mode — no heading, just render the image full width
  if (!banner.heading && banner.imageUrl) {
    return (
      <div className="w-full">
        <img src={shopifyImageUrl(banner.imageUrl, 1200)} alt={banner.imageAlt || ""} className="w-full h-auto" />
      </div>
    );
  }

  if (!banner.heading) return null;

  return (
    <section className="container mx-auto px-4 py-3 md:py-6">
      <div className="relative overflow-hidden rounded-2xl bg-charcoal">

        {/* Background image */}
        {banner.imageUrl && (
          <img
            src={shopifyImageUrl(banner.imageUrl, 700)}
            alt={banner.imageAlt || banner.heading}
            className="absolute inset-0 h-full w-full object-cover opacity-15"
          />
        )}

        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-crimson via-crimson/80 to-charcoal" />

        {/* Subtle circles */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/[0.03]" />
        <div className="pointer-events-none absolute -bottom-16 right-32 h-52 w-52 rounded-full bg-white/[0.03]" />

        {/* Two-column layout */}
        <div className="relative grid items-center gap-6 px-6 py-8 md:grid-cols-2 md:px-10 md:py-10 lg:px-12">

          {/* Left — text */}
          <div className="flex flex-col gap-3">
            {banner.eyebrow && (
              <div className="flex items-center gap-2">
                <span className="h-px w-5 rounded-full bg-gold/70" />
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold/90">
                  {banner.eyebrow}
                </span>
              </div>
            )}

            <h2 className="font-display text-2xl font-bold leading-snug tracking-tight text-off-white md:text-3xl">
              {banner.heading}
            </h2>

            {banner.body && (
              <p className="text-[14px] leading-relaxed text-off-white/70 md:text-[15px]">
                {banner.body}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {banner.btn1Label && banner.btn1Link && (
                <Link
                  to={banner.btn1Link}
                  className="group inline-flex items-center gap-2 rounded-full bg-off-white px-6 py-2.5 text-[13px] font-bold uppercase tracking-wider transition-all duration-200 hover:bg-gold hover:shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
                  style={{ color: 'oklch(0.18 0.005 240)' }}
                >
                  {banner.btn1Label}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              )}
              {banner.btn2Label && banner.btn2Link && (
                <Link
                  to={banner.btn2Link}
                  className="inline-flex items-center gap-2 rounded-full border border-off-white/30 px-6 py-2.5 text-[13px] font-bold uppercase tracking-wider transition-all duration-200 hover:border-off-white/60"
                  style={{ color: 'rgba(250,249,246,0.8)' }}
                >
                  {banner.btn2Label}
                </Link>
              )}
            </div>
          </div>

          {/* Right — image or value props */}
          {banner.imageUrl ? (
            <div className="hidden md:flex md:justify-end">
              <div className="relative h-56 w-72 overflow-hidden rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.4)]">
                <img
                  src={shopifyImageUrl(banner.imageUrl, 1200)}
                  alt={banner.imageAlt || banner.heading}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
              </div>
            </div>
          ) : (
            <div className="hidden md:grid md:grid-cols-2 md:gap-3">
              {VALUE_PROPS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 rounded-xl bg-white/[0.07] px-4 py-3.5 backdrop-blur-sm"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-crimson/40">
                    <Icon className="h-4 w-4 text-off-white" />
                  </div>
                  <span className="text-[12px] font-semibold leading-tight text-off-white/85">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </section>
  );
}

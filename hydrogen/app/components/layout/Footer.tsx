import { useEffect } from "react";
import { Link } from "react-router";
import { Facebook, Instagram, Linkedin, Phone, Twitter } from "lucide-react";
import logo from "@/assets/mls-logo.png";
import { useLocalePath } from "@/stores/localeStore";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { FooterSettings, FooterLink } from "~/root";

const DEFAULTS = {
  companyName:    "M L S FOODSTUFF TRADING LLC",
  address:        "Marasi Drive, Business Bay\nP.O.Box 93770\nDubai, United Arab Emirates",
  phone:          "+96892423242",
  email:          "contactus@mls.om",
  contactHeading: "Contact Us",
  copyright:      "MLS Oman. All rights reserved.",
  newsletterTitle:    "Want discounts?",
  newsletterSubtitle: "Subscribe to our newsletter and get 10% off your first purchase!",
};

interface ContactData {
  companyName: string;
  heading: string;
  address: string;
  phone: string;
  email: string;
  instagram?: string | null;
  facebook?: string | null;
  twitter?: string | null;
  tiktok?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  brandText?: string | null;
  copyright: string;
  bottomTagline?: string | null;
  newsletterTitle: string;
  newsletterSubtitle: string;
}

interface Props {
  settings: FooterSettings | null;
  menuCols: Array<{ heading: string; links: FooterLink[] }>;
}

export function Footer({ settings, menuCols }: Props) {
  const year = new Date().getFullYear();

  const contact: ContactData = {
    companyName:   settings?.companyName    || DEFAULTS.companyName,
    heading:       settings?.contactHeading || DEFAULTS.contactHeading,
    address:       settings?.address        || DEFAULTS.address,
    phone:         settings?.phone          || DEFAULTS.phone,
    email:         settings?.email          || DEFAULTS.email,
    newsletterTitle:    settings?.newsletterTitle    || DEFAULTS.newsletterTitle,
    newsletterSubtitle: settings?.newsletterSubtitle || DEFAULTS.newsletterSubtitle,
    instagram:     settings?.instagramUrl,
    facebook:      settings?.facebookUrl,
    twitter:       settings?.twitterUrl,
    tiktok:        settings?.tiktokUrl,
    whatsapp:      settings?.whatsappUrl    || `https://wa.me/971504516403`,
    linkedin:      settings?.linkedinUrl,
    brandText:     settings?.brandText,
    copyright:     settings?.copyright      || DEFAULTS.copyright,
    bottomTagline: settings?.bottomTagline,
  };

  return (
    <footer className="bg-charcoal text-charcoal-foreground">
      <div className="border-t border-off-white/20" />
      <div className="container mx-auto px-4 py-12">

        {/* ── Desktop ─────────────────────────────────────────────── */}
        <div className="hidden gap-10 md:flex md:flex-wrap md:items-start">
          <BrandCol contact={contact} />
          {menuCols.map((col) => (
            <NavCol key={col.heading} heading={col.heading} links={col.links} />
          ))}
          <NewsletterCol title={contact.newsletterTitle} subtitle={contact.newsletterSubtitle} />
        </div>

        {/* ── Mobile ──────────────────────────────────────────────── */}
        <div className="md:hidden">
          <BrandCol contact={contact} />
          <Accordion type="single" collapsible className="mt-6">
            {menuCols.map((col) => (
              <AccordionItem key={col.heading} value={col.heading} className="border-off-white/10">
                <AccordionTrigger className="font-display text-sm font-bold uppercase tracking-wider text-white hover:no-underline">
                  {col.heading}
                </AccordionTrigger>
                <AccordionContent>
                  <LinkList links={col.links} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
          {/* Klaviyo signup on mobile below accordions */}
          <div className="mt-8">
            <p className="mb-1 text-base font-bold text-white">{contact.newsletterTitle}</p>
            <p className="mb-4 text-sm text-off-white/70">{contact.newsletterSubtitle}</p>
            <div className="klaviyo-form-TXvrLy"></div>
          </div>
        </div>
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────── */}
      <div className="border-t border-off-white/10">
        <div className="container mx-auto flex flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-off-white/60 sm:flex-row">
          <span>© {year} {contact.copyright}</span>
          {contact.bottomTagline && <span>{contact.bottomTagline}</span>}
        </div>
      </div>
    </footer>
  );
}

function BrandCol({ contact }: { contact: ContactData }) {
  const whatsappHref = "https://wa.me/971504516403";

  return (
    <div className="min-w-[240px] max-w-[300px] flex-1">
      {/* Logo */}
      <div className="mb-4">
        <img src={logo} alt="MLS Oman" className="h-14 w-auto brightness-0 invert" />
      </div>
      {/* Company name */}
      <p className="text-sm font-bold text-white">{contact.companyName}</p>

      {/* Address */}
      {contact.address && (
        <p className="mt-3 whitespace-pre-line text-sm text-off-white/70 uppercase">
          {contact.address}
        </p>
      )}

      {/* Email + WhatsApp as plain text lines */}
      <div className="mt-4 space-y-1 text-sm">
        {contact.email && (
          <p>
            <span className="font-semibold text-white">Email: </span>
            <a href={`mailto:${contact.email}`} className="text-off-white/80 hover:text-white">
              {contact.email}
            </a>
          </p>
        )}
        {contact.phone && (
          <p>
            <span className="font-semibold text-white">Whatsapp</span>
            <a
              href={whatsappHref}
              className="text-off-white/80 hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              {contact.phone}
            </a>
          </p>
        )}
      </div>

      {/* Social icons */}
      <div className="mt-5 flex flex-wrap gap-4">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} aria-label="Phone" className="text-off-white/70 hover:text-white">
            <Phone className="h-5 w-5" />
          </a>
        )}
        {contact.facebook && (
          <a href={contact.facebook} aria-label="Facebook" className="text-off-white/70 hover:text-white" target="_blank" rel="noopener noreferrer">
            <Facebook className="h-5 w-5" />
          </a>
        )}
        {contact.instagram && (
          <a href={contact.instagram} aria-label="Instagram" className="text-off-white/70 hover:text-white" target="_blank" rel="noopener noreferrer">
            <Instagram className="h-5 w-5" />
          </a>
        )}
        {contact.whatsapp && (
          <a href={whatsappHref} aria-label="WhatsApp" className="text-off-white/70 hover:text-white" target="_blank" rel="noopener noreferrer">
            <WhatsAppIcon className="h-5 w-5" />
          </a>
        )}
        {contact.linkedin && (
          <a href={contact.linkedin} aria-label="LinkedIn" className="text-off-white/70 hover:text-white" target="_blank" rel="noopener noreferrer">
            <Linkedin className="h-5 w-5" />
          </a>
        )}
        {contact.twitter && (
          <a href={contact.twitter} aria-label="Twitter / X" className="text-off-white/70 hover:text-white" target="_blank" rel="noopener noreferrer">
            <Twitter className="h-5 w-5" />
          </a>
        )}
        {contact.tiktok && (
          <a href={contact.tiktok} aria-label="TikTok" className="text-off-white/70 hover:text-white" target="_blank" rel="noopener noreferrer">
            <TikTokIcon className="h-5 w-5" />
          </a>
        )}
      </div>
    </div>
  );
}

function NavCol({ heading, links }: { heading: string; links: FooterLink[] }) {
  return (
    <div className="min-w-[140px] flex-1">
      <h4 className="mb-4 font-display text-sm font-bold text-white">
        {heading}
      </h4>
      <LinkList links={links} />
    </div>
  );
}

function NewsletterCol({ title, subtitle }: { title: string; subtitle: string }) {
  useEffect(() => {
    // Klaviyo scans DOM on load — after hydration we must re-trigger it
    if (typeof window !== "undefined") {
      const kl = (window as any).klaviyo;
      if (kl && typeof kl.push === "function") {
        kl.push(["identify", {}]);
      }
      // Also fire the generic onsite re-init
      const onsite = (window as any)._klOnsite;
      if (Array.isArray(onsite)) {
        onsite.push(["openForm", "TXvrLy"]);
      }
    }
  }, []);

  return (
    <div className="min-w-[220px] max-w-[280px] flex-1">
      <h4 className="mb-2 font-display text-base font-bold text-white">{title}</h4>
      <p className="mb-4 text-sm text-off-white/70">{subtitle}</p>
      <div className="klaviyo-form-TXvrLy"></div>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.76a4.85 4.85 0 01-1.01-.07z"/>
    </svg>
  );
}

function LinkList({ links }: { links: FooterLink[] }) {
  const lp = useLocalePath();
  return (
    <ul className="space-y-2.5 text-sm">
      {links.map((l) => (
        <li key={l.label}>
          {l.url.startsWith("http") ? (
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-off-white/80 hover:text-white">
              {l.label}
            </a>
          ) : (
            <Link to={lp(l.url)} className="text-off-white/80 hover:text-white">
              {l.label}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

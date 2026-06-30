import type { LoaderFunctionArgs, MetaFunction } from "@shopify/remix-oxygen";
import { useLoaderData, useFetcher } from "react-router";
import { useState, useEffect } from "react";
import { ShieldCheck, PenLine, User, Loader2 } from "lucide-react";
import type { JudgemeReview } from "~/lib/judgeme";
import { cn } from "~/lib/utils";
import { StarRating } from "~/components/reviews/StarRating";
export const meta: MetaFunction = () => [
  { title: "Customer Reviews — MLS Oman" },
  { name: "description", content: "Read genuine customer reviews for MLS Oman. Over 7000 verified buyers share their experience." },
  { tagName: "link", rel: "canonical", href: "https://mls.om/pages/customer-reviews" },
  { "script:ld+json": {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "MLS Oman Customer Reviews",
    url: "https://mls.om/pages/customer-reviews",
    description: "Verified customer reviews for MLS Oman — premium halal meat delivery in Dubai, Abu Dhabi and UAE.",
  }},
];

interface ParsedReview {
  id: string;
  rating: number;
  author: string;
  date: string;
  title: string;
  body: string;
  product: string;
  verified: boolean;
  pictures: { small: string; original: string }[];
}

function parseReviews(html: string): ParsedReview[] {
  const reviews: ParsedReview[] = [];
  const parts = html.split(/(?=<div class='jdgm-rev jdgm-divider)/);
  for (const part of parts) {
    if (!part.includes("data-review-id")) continue;
    const id      = part.match(/data-review-id='([^']+)'/)?.[1] ?? "";
    const verified= part.match(/data-verified-buyer='([^']+)'/)?.[1] === "true";
    const rating  = parseInt(part.match(/data-score='(\d+)'/)?.[1] ?? "5");
    const author  = part.match(/class='jdgm-rev__author'[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
    const date    = part.match(/data-created-at='([^']+)'/)?.[1] ?? "";
    const title   = part.match(/class='jdgm-rev__title'[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
    const body    = part.match(/class='jdgm-rev__content'[^>]*>([\s\S]*?)<\/p>/)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
    const product = part.match(/class='jdgm-rev__product-title'[^>]*>([^<]+)/)?.[1]?.replace(/^about\s+/i, "").trim() ?? "";

    // Extract pictures — Judge.me lazy-loads with data-src, href holds the full-res URL
    const pictures: { small: string; original: string }[] = [];
    const picMatches = part.matchAll(/href='(https?:\/\/[^']*(?:imgix\.net|judge\.me)[^']*)'[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)='([^']+)'/g);
    for (const m of picMatches) {
      if (m[1] && m[2]) pictures.push({ original: m[1], small: m[2] });
    }
    // Fallback: if data-src/src thumbnail is a placeholder, use the href URL for both
    for (const pic of pictures) {
      if (!pic.small || pic.small.startsWith("data:") || pic.small.length < 10) {
        pic.small = pic.original;
      }
    }

    if (!id) continue;
    reviews.push({ id, rating, author, date, title, body, product, verified, pictures });
  }
  return reviews;
}

function parseHistogram(headerHtml: string): [number, number, number, number, number] {
  const counts = headerHtml.match(/\((\d+)\)/g)?.map(m => parseInt(m.replace(/[()]/g, ""))) ?? [];
  const h: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  if (counts.length >= 5) {
    h[4] = counts[0]; h[3] = counts[1]; h[2] = counts[2]; h[1] = counts[3]; h[0] = counts[4];
  }
  return h;
}

const METAFIELD_QUERY = `{
  shop {
    header:   metafield(namespace: "judgeme", key: "all_reviews_header") { value }
    reviews0: metafield(namespace: "judgeme", key: "all_reviews_0")      { value }
    reviews1: metafield(namespace: "judgeme", key: "all_reviews_1")      { value }
    count:    metafield(namespace: "judgeme", key: "all_reviews_count")  { value }
    rating:   metafield(namespace: "judgeme", key: "all_reviews_rating") { value }
    medals:   metafield(namespace: "judgeme", key: "medals")             { value }
  }
}`;

export async function loader({ context }: LoaderFunctionArgs) {
  const { env } = context as any;
  const shopDomain = env?.PUBLIC_STORE_DOMAIN ?? "muscat-livestock.myshopify.com";
  const apiToken   = env?.JUDGEME_API_TOKEN ?? "";

  // Fetch metafields for count/rating/histogram and REST API reviews in parallel
  const [metaData, page1, page2] = await Promise.all([
    context.adminFetch(METAFIELD_QUERY),
    apiToken
      ? fetch(`https://judge.me/api/v1/reviews?api_token=${encodeURIComponent(apiToken)}&shop_domain=${encodeURIComponent(shopDomain)}&page=1&per_page=50`, { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : { reviews: [] }).catch(() => ({ reviews: [] }))
      : Promise.resolve({ reviews: [] }),
    apiToken
      ? fetch(`https://judge.me/api/v1/reviews?api_token=${encodeURIComponent(apiToken)}&shop_domain=${encodeURIComponent(shopDomain)}&page=2&per_page=50`, { headers: { Accept: "application/json" } }).then(r => r.ok ? r.json() : { reviews: [] }).catch(() => ({ reviews: [] }))
      : Promise.resolve({ reviews: [] }),
  ]);

  const shop = metaData?.shop ?? {};
  const header    = shop.header?.value ?? "";
  const count     = Number(shop.count?.value ?? 0);
  const rating    = Number(shop.rating?.value ?? 0);
  const medals    = shop.medals?.value ?? "";
  const histogram = parseHistogram(header);

  // Map REST API reviews to ParsedReview — pictures come with correct URLs directly
  const apiReviews: ParsedReview[] = [...((page1 as any).reviews ?? []), ...((page2 as any).reviews ?? [])].map((r: any) => ({
    id:       String(r.id),
    rating:   r.rating ?? 5,
    author:   r.reviewer?.name ?? "Customer",
    date:     r.created_at ?? "",
    title:    r.title ?? "",
    body:     r.body ?? "",
    product:  r.product_title ?? "",
    verified: r.verified === "verified_buyer",
    pictures: (r.pictures ?? [])
      .filter((p: any) => !p.hidden)
      .map((p: any) => ({ small: p.urls?.small ?? p.urls?.compact ?? p.urls?.original ?? "", original: p.urls?.original ?? "" })),
  }));

  // Fall back to HTML parsing from metafields if REST API returned nothing
  const reviews0 = shop.reviews0?.value ?? "";
  const reviews1 = shop.reviews1?.value ?? "";
  const reviews = apiReviews.length > 0 ? apiReviews : parseReviews(reviews0 + reviews1);

  return { reviews, count, rating, histogram, medals };
}

export default function CustomerReviewsPage() {
  const { reviews: initialReviews, count, rating, histogram, medals } = useLoaderData<typeof loader>();
  const [allReviews, setAllReviews] = useState<ParsedReview[]>(initialReviews);
  const [page, setPage] = useState(6); // loader fetched 100 reviews = pages 1-5 at 20/page
  const fetcher = useFetcher<{ reviews: JudgemeReview[]; totalCount: number }>();

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.reviews) return;
    const incoming: ParsedReview[] = fetcher.data.reviews.map((r: JudgemeReview) => ({
      id:       String(r.id),
      rating:   r.rating ?? 5,
      author:   r.reviewer?.name ?? "Customer",
      date:     r.created_at ?? "",
      title:    r.title ?? "",
      body:     r.body ?? "",
      product:  "",
      verified: r.verified === "verified_buyer",
      pictures: (r.pictures ?? []).map(p => ({
        small:    p.urls?.small ?? p.urls?.original ?? "",
        original: p.urls?.original ?? "",
      })),
    }));
    setAllReviews(prev => {
      const seen = new Set(prev.map(r => r.id));
      return [...prev, ...incoming.filter(r => !seen.has(r.id))];
    });
  }, [fetcher.state, fetcher.data]);

  const loadMore = () => {
    fetcher.load(`/api/reviews/store?page=${page}`);
    setPage(p => p + 1);
  };

  const hasMore = allReviews.length < count;
  const allPhotos = allReviews.flatMap(r => r.pictures);

  const starLabels = ["1 star", "2 stars", "3 stars", "4 stars", "5 stars"];
  const histTotal = histogram.reduce((s, n) => s + n, 0);

  return (
    <div className="min-h-screen bg-background">

      {/* Hero */}
      <div
        className="relative overflow-hidden py-12 md:py-16"
        style={{ background: "linear-gradient(135deg, #1a0a0a 0%, #3d0000 50%, #1a0a0a 100%)" }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="relative container mx-auto px-4 text-center text-white">
          <span className="mb-4 inline-block rounded-full border border-crimson/40 bg-crimson/20 px-4 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
            Verified Reviews
          </span>
          <h1 className="font-display text-4xl font-extrabold md:text-5xl">
            Take our customers' words<br className="hidden md:block" /> for our products
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-white/70">
            {count.toLocaleString()} verified buyers share their honest experience
          </p>
        </div>
      </div>

      <div className="container mx-auto max-w-5xl px-4 py-14">

        {/* Rating Summary */}
        {count > 0 && (
          <div className="mb-12 flex flex-col items-center gap-8 rounded-2xl border border-border bg-card p-8 shadow-sm sm:flex-row sm:items-start sm:justify-between">

            {/* Score */}
            <div className="flex shrink-0 flex-col items-center gap-2 text-center">
              <span className="font-display text-6xl font-extrabold tabular-nums text-foreground">{rating.toFixed(2)}</span>
              <StarRating rating={rating} size="lg" />
              <span className="text-sm text-muted-foreground">Based on {count.toLocaleString()} reviews</span>
            </div>

            {/* Histogram */}
            <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-1 sm:px-8">
              {[4, 3, 2, 1, 0].map((idx) => {
                const pct = histTotal > 0 ? Math.round((histogram[idx] / histTotal) * 100) : 0;
                return (
                  <div key={idx} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-right text-muted-foreground">{starLabels[idx]}</span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right tabular-nums text-muted-foreground">
                      {pct}% ({histogram[idx].toLocaleString()})
                    </span>
                  </div>
                );
              })}
            </div>

            {/* CTA + medals */}
            <div className="flex shrink-0 flex-col items-center gap-3">
              <a
                href="https://judge.me/stores/muscat-livestock.myshopify.com/reviews/new"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-300"
              >
                <PenLine className="h-4 w-4" />
                Write a Review
              </a>
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Verified by Judge.me
              </span>
              {medals && (
                <div
                  className="mt-2 [&_.jdgm-medals-wrapper]:flex [&_.jdgm-medals-wrapper]:flex-wrap [&_.jdgm-medals-wrapper]:gap-2 [&_.jdgm-medal]:w-16"
                  dangerouslySetInnerHTML={{ __html: medals }}
                />
              )}
            </div>
          </div>
        )}

        {/* Customer photos strip */}
        {allPhotos.length > 0 && (
          <div className="mb-10">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Customer photos &amp; videos
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {allPhotos.map((pic, i) => (
                <a key={i} href={pic.original} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  <img
                    src={pic.small}
                    alt={`Customer photo ${i + 1}`}
                    className="h-24 w-24 rounded-xl object-cover ring-1 ring-border transition hover:ring-crimson"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Reviews Grid */}
        {allReviews.length > 0 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {allReviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={fetcher.state === "loading"}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-8 py-3 text-sm font-semibold transition-colors hover:border-crimson hover:text-crimson disabled:opacity-50"
                >
                  {fetcher.state === "loading" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Loading...</>
                  ) : (
                    `Load more (${count - allReviews.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-muted-foreground">No reviews found.</p>
        )}
      </div>
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({ review }: { review: ParsedReview }) {
  const initials = review.author.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  const dateStr = review.date
    ? new Date(review.date).toLocaleDateString("en-AE", { year: "numeric", month: "short", day: "numeric" })
    : "";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-crimson/10 text-sm font-bold text-crimson">
            {initials || <User className="h-4 w-4" />}
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">{review.author}</p>
            {dateStr && <p className="text-xs text-muted-foreground">{dateStr}</p>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StarRating rating={review.rating} size="sm" />
          {review.verified && (
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          )}
        </div>
      </div>

      {/* Product */}
      {review.product && (
        <p className="text-[11px] font-medium text-crimson/80 uppercase tracking-wide truncate">
          {review.product}
        </p>
      )}

      {/* Review content */}
      {review.title && <p className="text-sm font-semibold">{review.title}</p>}
      {review.body && <p className="text-sm leading-relaxed text-muted-foreground">{review.body}</p>}

      {/* Photos */}
      {review.pictures.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {review.pictures.map((pic, i) => (
            <a key={i} href={pic.original} target="_blank" rel="noopener noreferrer">
              <img
                src={pic.small}
                alt={`Review photo ${i + 1}`}
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-border transition hover:ring-crimson"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}


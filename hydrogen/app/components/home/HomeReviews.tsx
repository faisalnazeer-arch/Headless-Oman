import { Star, ShieldCheck, User } from "lucide-react";
import { Link } from "react-router";
import type { JudgemeReview } from "~/lib/judgeme";
import { HScroller } from "./HScroller";
import { useT } from "~/i18n/strings";
import { useLocalePath } from "~/stores/localeStore";

interface HomeReviewsProps {
  reviews: JudgemeReview[];
  totalCount: number;
  averageRating: number;
}

function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const rounded = Math.round(rating);
  const sz = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${sz} ${n <= rounded ? "fill-amber-400 text-amber-400" : "fill-muted-foreground/25 text-muted-foreground/25"}`}
        />
      ))}
    </div>
  );
}

function ReviewCard({ review }: { review: JudgemeReview }) {
  const t = useT();
  return (
    <div className="flex w-72 shrink-0 snap-start flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm sm:w-80">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
            <User className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{review.reviewer.name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(review.created_at).toLocaleDateString("en-GB", {
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "Asia/Muscat",
              })}
            </p>
          </div>
        </div>
        {review.verified === "verified_buyer" && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-600/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <ShieldCheck className="h-3 w-3" /> {t("reviews.verified")}
          </span>
        )}
      </div>
      <Stars rating={review.rating} />
      {review.title && (
        <p className="text-sm font-semibold text-foreground">{review.title}</p>
      )}
      {review.body && (
        <p className="line-clamp-4 text-sm leading-relaxed text-foreground/70">{review.body}</p>
      )}
    </div>
  );
}

export function HomeReviews({ reviews, totalCount, averageRating }: HomeReviewsProps) {
  const t = useT();
  const lp = useLocalePath();
  if (!reviews.length) return null;

  return (
    <section className="bg-background py-3 md:py-6">
      <div className="container mx-auto px-4">
        <div className="mb-3 text-center md:mb-4">
          <div className="mb-1.5 flex items-center justify-center gap-3">
            <span className="h-px w-6 rounded-full bg-crimson" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">{t("reviews.verified_buyers")}</span>
            <span className="h-px w-6 rounded-full bg-crimson" />
          </div>
          <h2 className="font-display text-2xl font-bold leading-snug tracking-tight text-foreground md:text-3xl">
            {t("reviews.heading")}
          </h2>
          {averageRating > 0 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <Stars rating={averageRating} size="lg" />
              <span className="font-display text-xl font-extrabold text-foreground">
                {averageRating.toFixed(1)}
              </span>
              {totalCount > 0 && (
                <span className="text-sm text-muted-foreground">({totalCount.toLocaleString()} {t("reviews.count_suffix")})</span>
              )}
            </div>
          )}
        </div>

        <HScroller>
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </HScroller>

        <div className="mt-5 flex justify-center">
          <Link
            to={lp("/pages/customer-reviews")}
            className="inline-flex items-center gap-2 rounded-xl bg-crimson px-6 py-3 text-sm font-bold uppercase tracking-wide shadow-sm transition-opacity hover:opacity-90"
            style={{ color: "#ffffff" }}
          >
            {t("reviews.see_all")}
          </Link>
        </div>
      </div>
    </section>
  );
}

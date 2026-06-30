import { cn } from "~/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { useT } from "~/i18n/strings";

export interface SellingPlan {
  id: string;
  name: string;
  discount: number;
}

export interface SellingPlanGroup {
  name: string;
  plans: SellingPlan[];
}

interface SubscriptionSelectorProps {
  groups: SellingPlanGroup[];
  selectedPlanId: string | null;
  onSelect: (planId: string | null) => void;
  regularPrice?: string;
  currency?: string;
  className?: string;
  /** Exact subscription prices from Shopify allocations: planId → price amount string */
  planPrices?: Record<string, string>;
}

export function SubscriptionSelector({
  groups,
  selectedPlanId,
  onSelect,
  regularPrice = "0",
  currency = "OMR",
  className,
  planPrices = {},
}: SubscriptionSelectorProps) {
  const t = useT();

  if (groups.length === 0) return null;

  const allPlans = groups.flatMap((g) => g.plans);
  const isSubscribing = selectedPlanId !== null;
  const activePlan = allPlans.find((p) => p.id === selectedPlanId) ?? allPlans[0];
  const bestDiscount = Math.max(...allPlans.map((p) => p.discount), 0);

  const regularPriceNum = parseFloat(regularPrice) || 0;

  // Use exact Shopify allocation price when available, fall back to percentage calc
  const activePlanExactPrice = activePlan ? planPrices[activePlan.id] : undefined;
  const subscriptionPriceNum = activePlanExactPrice
    ? parseFloat(activePlanExactPrice)
    : activePlan?.discount > 0
    ? regularPriceNum * (1 - activePlan.discount / 100)
    : regularPriceNum;

  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* ── One-time ── */}
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors",
          !isSubscribing
            ? "border-crimson bg-crimson/5 ring-1 ring-crimson"
            : "border-border hover:border-muted-foreground",
        )}
      >
        <div className="flex items-center gap-3">
          <RadioDot active={!isSubscribing} />
          <span className="font-semibold">{t("subscription.one_time")}</span>
        </div>
        <span className="text-sm font-semibold">{fmt(regularPriceNum)}</span>
      </button>

      {/* ── Subscribe & save ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (!isSubscribing) onSelect(allPlans[0]?.id ?? null); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!isSubscribing) onSelect(allPlans[0]?.id ?? null); } }}
        className={cn(
          "relative rounded-lg border transition-colors",
          isSubscribing
            ? "border-crimson ring-1 ring-crimson"
            : "cursor-pointer border-border hover:border-muted-foreground",
        )}
      >
        {/* Badge — sits on top-right border, vertically aligned with prices */}
        {bestDiscount > 0 && (
          <span className="absolute end-4 top-0 -translate-y-1/2 rounded-full bg-crimson px-3 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">
            {t("subscription.save_up_to")} {bestDiscount}%
          </span>
        )}

        {/* Header row */}
        <div className={cn("flex items-center justify-between px-4 pb-3", bestDiscount > 0 ? "pt-5" : "pt-4")}>
          <div className="flex items-center gap-3">
            <RadioDot active={isSubscribing} />
            <span className="text-base font-bold">{t("subscription.subscribe_save")}</span>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            {subscriptionPriceNum < regularPriceNum && (
              <span className="text-xs text-muted-foreground line-through">
                {fmt(regularPriceNum)}
              </span>
            )}
            <span className="text-sm font-bold text-crimson">
              {fmt(subscriptionPriceNum)}
            </span>
          </div>
        </div>

        {/* Benefits + frequency — only shown when subscribe is selected */}
        {isSubscribing && (
          <div className="px-4 pb-4">
            <ul className="flex flex-col gap-1.5">
              <BenefitItem text={t("subscription.benefit_10_off")} />
              <BenefitItem text={t("subscription.benefit_delivery_small")} />
              <BenefitItem text={t("subscription.benefit_cancel")} />
            </ul>

            <p className="mt-3 text-sm">
              <span className="font-semibold">{t("subscription.note_prefix")}</span>{" "}
              {t("subscription.note_detail")}
            </p>

            <ul className="mt-1.5 flex flex-col gap-1.5">
              <BenefitItem text={t("subscription.free_delivery")} />
              <BenefitItem text={t("subscription.free_steak")} />
              <BenefitItem text={t("subscription.no_commitment")} />
            </ul>

            {/* Frequency picker */}
            {allPlans.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-bold">{t("subscription.deliver_every")}</p>
                <div className="flex gap-2">
                  {allPlans.map((plan) => (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelect(plan.id); }}
                      className={cn(
                        "flex flex-1 flex-col items-center rounded-lg border px-2 py-2.5 text-sm font-semibold transition-colors",
                        plan.id === selectedPlanId
                          ? "border-crimson bg-crimson text-white"
                          : "border-border bg-muted/50 hover:border-crimson",
                      )}
                    >
                      <span>{shortPlanName(plan.name)}</span>
                      {plan.discount > 0 && (
                        <span
                          className={cn(
                            "text-[11px]",
                            plan.id === selectedPlanId
                              ? "text-white/80"
                              : "text-muted-foreground",
                          )}
                        >
                          {t("subscription.save_pct")} {plan.discount}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RadioDot({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
        active ? "border-crimson" : "border-muted-foreground/50",
      )}
    >
      {active && <span className="h-2 w-2 rounded-full bg-crimson" />}
    </span>
  );
}

function shortPlanName(name: string): string {
  const lower = name.toLowerCase();
  const num = parseInt(name.match(/^(\d+)/)?.[1] ?? "0", 10);
  if (!num) return name;
  if (lower.includes("month")) return num === 1 ? "Monthly" : `${num} Months`;
  if (lower.includes("week"))  return num === 1 ? "Weekly"  : `${num} Weeks`;
  if (lower.includes("day"))   return `${num} Days`;
  return name;
}

function BenefitItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
      <span>{text}</span>
    </li>
  );
}

export function parseSellingPlanGroups(
  raw: any[],
  discountMap: Record<string, number> = {},
): SellingPlanGroup[] {
  if (!raw?.length) return [];
  const seenIds = new Set<string>();
  return raw
    .map((group: any) => ({
      name: group.name ?? "Subscription",
      plans: (group.sellingPlans?.nodes ?? [])
        .filter((plan: any) => {
          if (!plan.id || seenIds.has(plan.id)) return false;
          seenIds.add(plan.id);
          return true;
        })
        .map((plan: any) => ({
          id: plan.id as string,
          name: plan.name as string,
          discount: discountMap[plan.id] ?? 0,
        })),
    }))
    .filter((g: SellingPlanGroup) => g.plans.length > 0);
}

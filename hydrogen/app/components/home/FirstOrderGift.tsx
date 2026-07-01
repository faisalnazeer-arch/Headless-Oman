// "A gift in your first box" section

export interface GiftItem {
  emoji: string;
  title: string;
  subtitle: string;
}

export interface FirstOrderGiftData {
  eyebrow: string;
  heading: string;
  description: string;
  items: GiftItem[];
}

export function parseFirstOrderGift(nodes: any[]): FirstOrderGiftData | null {
  const node = nodes[0];
  if (!node) return null;
  const f = Object.fromEntries(node.fields.map((x: any) => [x.key, x]));

  const items: GiftItem[] = [];
  for (let i = 1; i <= 3; i++) {
    const emoji = f[`item_${i}_emoji`]?.value?.trim();
    const title = f[`item_${i}_title`]?.value?.trim();
    if (!title) continue;
    items.push({
      emoji: emoji ?? "🎁",
      title,
      subtitle: f[`item_${i}_subtitle`]?.value?.trim() ?? "",
    });
  }

  return {
    eyebrow:     f["eyebrow"]?.value     ?? "First Order, On Us",
    heading:     f["heading"]?.value     ?? "A gift in your first box.",
    description: f["description"]?.value ?? "",
    items,
  };
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  data?: FirstOrderGiftData | null;
}

export function FirstOrderGift({ data }: Props) {
  if (!data || data.items.length === 0) return null;

  return (
    <section className="bg-background py-3 md:py-6">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-5xl">

          {/* ── Header ── */}
          <div className="mb-3 text-center md:mb-4">
            <div className="mb-1.5 flex items-center justify-center gap-3">
              <span className="h-px w-6 rounded-full bg-gradient-brand" />
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-crimson">
                {data.eyebrow}
              </span>
              <span className="h-px w-6 rounded-full bg-gradient-brand" />
            </div>
            <h2 className="font-display text-2xl font-bold leading-snug tracking-tight text-gradient-brand md:text-3xl">
              {data.heading}
            </h2>
            {data.description && (
              <p className="mx-auto mt-2 hidden max-w-lg text-[15px] leading-relaxed text-foreground/50 md:block md:mt-3">
                {data.description}
              </p>
            )}
          </div>

          {/* ── Mobile: one row, 3 cols ── */}
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm md:hidden">
            <div className="grid grid-cols-3 divide-x divide-border">
              {data.items.map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-1.5 px-2 py-3.5 text-center">
                  {/* Emoji circle */}
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-crimson/8 text-xl">
                    {item.emoji}
                  </div>
                  {/* Title */}
                  <p className="text-[10px] font-bold leading-tight text-foreground">{item.title}</p>
                  {/* Subtitle */}
                  {item.subtitle && (
                    <p className="-mt-1 text-[9px] leading-tight text-muted-foreground">{item.subtitle}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Desktop: elegant 3-col cards (no top line) ── */}
          <div className="hidden grid-cols-3 gap-4 md:grid lg:gap-5">
            {data.items.map((item, i) => (
              <div
                key={i}
                className="group flex flex-col rounded-2xl border border-border/60 bg-card p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                {/* Emoji */}
                <div className="mb-4 flex items-start">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-crimson/8 text-2xl">
                    {item.emoji}
                  </div>
                </div>

                {/* Title */}
                <p className="text-[15px] font-bold leading-snug text-foreground">
                  {item.title}
                </p>

                {/* Subtitle */}
                {item.subtitle && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/50">
                    {item.subtitle}
                  </p>
                )}

                {/* Crimson dash — grows on hover */}
                <div className="mt-5 h-[2px] w-6 rounded-full bg-crimson transition-all duration-300 group-hover:w-10" />
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

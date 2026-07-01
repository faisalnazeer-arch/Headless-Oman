interface AnnouncementBarProps {
  messages?: string[];
}

export function AnnouncementBar({ messages = [] }: AnnouncementBarProps) {
  if (messages.length === 0) return null;
  // Triple so the loop never shows a gap regardless of message count
  const items = [...messages, ...messages, ...messages];
  return (
    <div className="bg-gradient-brand-deep text-crimson-foreground overflow-hidden">
      <div className="flex py-2 text-xs sm:text-sm">
        <div className="announcement-scroll flex gap-12 whitespace-nowrap font-medium tracking-wide">
          {items.map((m, i) => (
            <span key={i} className="flex-shrink-0">★ {m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

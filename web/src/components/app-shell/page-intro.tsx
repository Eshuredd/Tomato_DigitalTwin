import { Badge } from "@/components/ui/badge";

export function PageIntro({ eyebrow, title, description, badge = "Live FastAPI workflow" }: { eyebrow: string; title: string; description: string; badge?: string }) {
  return (
    <div className="mb-6 grid gap-3 border-b border-[var(--border-subtle)] pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--agronomy-accent)]">{eyebrow}</p>
        <h2 className="mt-2 text-[clamp(1.75rem,3vw,2.5rem)] font-semibold leading-tight tracking-[-0.045em] text-[var(--text-strong)]">{title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--text-muted)] sm:text-base">{description}</p>
      </div>
      <Badge variant="neutral">{badge}</Badge>
    </div>
  );
}

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
            {item.href ? <Link prefetch={false} className="rounded-sm hover:text-[var(--text-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" href={item.href}>{item.label}</Link> : <span aria-current="page" className="text-[var(--text-default)]">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

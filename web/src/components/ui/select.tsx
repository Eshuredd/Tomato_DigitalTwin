import type { SelectHTMLAttributes } from "react";

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm outline-none transition focus:border-[var(--color-leaf)] focus:ring-2 focus:ring-[var(--color-focus)]"
      {...props}
    />
  );
}

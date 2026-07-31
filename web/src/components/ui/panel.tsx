import type { ReactNode } from "react";

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}

export type BadgeTone = "neutral" | "success" | "warning" | "danger";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-[var(--color-border)] bg-[var(--color-surface-raised)]",
  success: "border-[var(--color-success)] bg-[var(--color-success-soft)]",
  warning: "border-[var(--color-warning)] bg-[var(--color-warning-soft)]",
  danger: "border-[var(--color-danger)] bg-[var(--color-danger-soft)]",
};

export function StatusBadge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

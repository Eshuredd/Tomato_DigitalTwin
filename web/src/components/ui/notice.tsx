import type { ReactNode } from "react";

type NoticeTone = "info" | "success" | "warning" | "danger";

const toneClass: Record<NoticeTone, string> = {
  info: "border-[var(--color-leaf)] bg-[var(--color-leaf-soft)]",
  success: "border-[var(--color-success)] bg-[var(--color-success-soft)]",
  warning: "border-[var(--color-warning)] bg-[var(--color-warning-soft)]",
  danger: "border-[var(--color-danger)] bg-[var(--color-danger-soft)]",
};

export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: NoticeTone;
}) {
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${toneClass[tone]}`}>
      {children}
    </div>
  );
}

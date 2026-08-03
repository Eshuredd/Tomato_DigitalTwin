import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", {
  variants: {
    variant: {
      neutral: "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-muted)]",
      success: "border-[var(--state-success-border)] bg-[var(--state-success-soft)] text-[var(--state-success-strong)]",
      warning: "border-[var(--state-warning-border)] bg-[var(--state-warning-soft)] text-[var(--state-warning-strong)]",
      info: "border-[var(--state-info-border)] bg-[var(--state-info-soft)] text-[var(--state-info-strong)]",
      destructive: "border-[var(--state-destructive-border)] bg-[var(--state-destructive-soft)] text-[var(--state-destructive-strong)]",
      agronomy: "border-[var(--agronomy-border)] bg-[var(--agronomy-soft)] text-[var(--agronomy-strong)]",
      evidence: "border-[var(--evidence-border)] bg-[var(--evidence-soft)] text-[var(--evidence-strong)]",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-[var(--radius-control)] border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-[var(--state-info-border)] bg-[var(--state-info-soft)] text-[var(--state-info-strong)]",
      success: "border-[var(--state-success-border)] bg-[var(--state-success-soft)] text-[var(--state-success-strong)]",
      warning: "border-[var(--state-warning-border)] bg-[var(--state-warning-soft)] text-[var(--state-warning-strong)]",
      destructive: "border-[var(--state-destructive-border)] bg-[var(--state-destructive-soft)] text-[var(--state-destructive-strong)]",
      neutral: "border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-default)]",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div role="status" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("col-start-2 font-semibold", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("col-start-2 leading-5", className)} {...props} />;
}

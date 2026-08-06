import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-[var(--action-primary)] text-white shadow-[var(--shadow-control)] hover:bg-[var(--action-primary-hover)]",
        primary: "bg-[var(--action-primary)] text-white shadow-[var(--shadow-control)] hover:bg-[var(--action-primary-hover)]",
        outline: "border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]",
        secondary: "border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text-strong)] hover:bg-[var(--surface-subtle)]",
        ghost: "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-strong)]",
        destructive: "bg-[var(--state-destructive)] text-white hover:bg-[var(--state-destructive-strong)]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };

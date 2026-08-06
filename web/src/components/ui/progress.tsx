"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]", className)} value={value} {...props}>
      <ProgressPrimitive.Indicator className="h-full bg-[var(--agronomy-accent)] transition-transform" style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }} />
    </ProgressPrimitive.Root>
  );
}

"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;

export function SheetContent({ className, children, ...props }: React.ComponentProps<typeof SheetPrimitive.Content>) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]" />
      <SheetPrimitive.Content className={cn("fixed inset-y-0 left-0 z-50 w-[min(22rem,88vw)] border-r border-[var(--border-subtle)] bg-[var(--surface-raised)] p-0 shadow-2xl outline-none", className)} {...props}>
        {children}
        <SheetPrimitive.Close className="absolute right-4 top-4 rounded-md p-2 text-[var(--text-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">Close navigation</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

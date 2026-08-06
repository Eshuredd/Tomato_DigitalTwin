"use client";

import Link from "next/link";
import { Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { navigationItems } from "./navigation";
import { AuthorityLegend } from "@/lib/design-system/authority";
import { Separator } from "@/components/ui/separator";

export function AppSidebar({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--sidebar-surface)] text-[var(--sidebar-text)]">
      <div className="flex h-[var(--shell-header-height)] items-center gap-3 px-5">
        <span className="grid size-10 place-items-center rounded-xl bg-[var(--agronomy-accent)] text-white shadow-sm" aria-hidden="true"><Sprout className="size-5" /></span>
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">Tomato decision support</p>
          <p className="mt-0.5 text-lg font-semibold tracking-[-0.03em] text-white">CropTwin</p>
        </div>
      </div>
      <Separator className="bg-white/10" />
      <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul className="grid gap-1">
          {navigationItems.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} prefetch={false} onClick={onNavigate} aria-current={active ? "page" : undefined} className={cn("group flex items-center gap-3 rounded-lg border px-3 py-2.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus-ring-on-dark)]", active ? "border-white/12 bg-white/12 text-white" : "border-transparent text-[var(--sidebar-muted)] hover:bg-white/7 hover:text-white")}>
                  <Icon className="size-[1.1rem] shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className={cn("mt-0.5 block truncate text-[0.68rem]", active ? "text-white/65" : "text-[var(--sidebar-muted)]")}>{item.description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="p-3">
        <AuthorityLegend />
      </div>
    </div>
  );
}

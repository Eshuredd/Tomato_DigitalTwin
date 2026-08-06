"use client";

import { useState } from "react";
import { Menu, PanelLeft } from "lucide-react";
import { usePathname } from "next/navigation";
import { AppSidebar } from "./app-sidebar";
import { navigationItemForPath } from "./navigation";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = navigationItemForPath(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[var(--surface-canvas)] text-[var(--text-default)] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)]">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside className="sticky top-0 hidden h-dvh border-r border-black/10 lg:block" aria-label="Application sidebar">
        <AppSidebar pathname={pathname} />
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[color:var(--surface-canvas)/0.94] backdrop-blur-xl">
          <div className="flex min-h-[var(--shell-header-height)] items-center gap-3 px-4 sm:px-6 xl:px-8">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="secondary" size="icon" className="lg:hidden" aria-label="Open primary navigation"><Menu className="size-5" aria-hidden="true" /></Button>
              </SheetTrigger>
              <SheetContent>
                <SheetTitle className="sr-only">Primary navigation</SheetTitle>
                <SheetDescription className="sr-only">Navigate between CropTwin application areas.</SheetDescription>
                <AppSidebar pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <div className="min-w-0 flex-1">
              <Breadcrumb items={[{ label: "CropTwin", href: "/" }, { label: current.label }]} />
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <PanelLeft className="hidden size-4 text-[var(--text-faint)] lg:block" aria-hidden="true" />
                <h1 className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--text-strong)]">{current.label}</h1>
              </div>
            </div>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[var(--workspace-max)] px-4 py-6 outline-none sm:px-6 xl:px-8 xl:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

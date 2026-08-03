import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { Activity, ClipboardCheck, History, LayoutDashboard, Map, Network, Settings2 } from "lucide-react";

export interface NavigationItem {
  href: string;
  label: string;
  shortLabel: string;
  description: string;
  icon: ComponentType<LucideProps>;
}

export const navigationItems: NavigationItem[] = [
  { href: "/", label: "Overview", shortLabel: "Overview", description: "Farm context and decision readiness", icon: LayoutDashboard },
  { href: "/farms", label: "Farms and plots", shortLabel: "Farms", description: "Stored agricultural locations", icon: Map },
  { href: "/cycle", label: "Active crop cycle", shortLabel: "Crop cycle", description: "Selected tomato cycle context", icon: Activity },
  { href: "/workflow", label: "Workflow", shortLabel: "Workflow", description: "Evidence-to-recommendation sequence", icon: Network },
  { href: "/history", label: "History", shortLabel: "History", description: "Authoritative twin snapshots", icon: History },
  { href: "/actions", label: "Actual actions", shortLabel: "Actions", description: "Physical actions performed", icon: ClipboardCheck },
  { href: "/system", label: "System information", shortLabel: "System", description: "Runtime and model metadata", icon: Settings2 },
];

export function navigationItemForPath(pathname: string) {
  if (pathname.startsWith("/plots/")) return navigationItems.find((item) => item.href === "/farms")!;
  return navigationItems.find((item) => item.href === pathname || (item.href !== "/" && pathname.startsWith(`${item.href}/`))) ?? navigationItems[0];
}

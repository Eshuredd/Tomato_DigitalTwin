import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell/app-shell";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CropTwin", template: "%s · CropTwin" },
  description: "Tomato irrigation and disease digital twin decision support.",
  applicationName: "CropTwin",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth"><body><Providers><AppShell>{children}</AppShell></Providers></body></html>;
}

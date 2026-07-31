import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CropTwin",
  description: "Tomato Irrigation and Disease Digital Twin",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

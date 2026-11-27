import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";
import "./globals.css";

export const metadata: Metadata = {
  title: brand.name,
  description: cs.common.appDescription,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}

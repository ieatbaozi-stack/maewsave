import type { Metadata, Viewport } from "next";
import { Anuphan, Inter } from "next/font/google";
import { headers } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ThemeColorSync } from "@/components/providers/theme-color-sync";
import { ThemeProvider } from "@/components/providers/theme-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const anuphan = Anuphan({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-anuphan",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8F9FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0D0F12" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const tBrand = await getTranslations("brand");

  return {
    title: tBrand("name"),
    description: tBrand("subtitle"),
    manifest: "/manifest.json",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "maewsave",
    },
    icons: {
      icon: [
        { url: "/icon.svg", type: "image/svg+xml" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

interface RootLayoutProps {
  children: ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const [locale, messages, headerStore] = await Promise.all([
    getLocale(),
    getMessages(),
    headers(),
  ]);
  const rawNonce = headerStore.get("x-nonce") ?? undefined;
  const nonce = rawNonce && /^[A-Za-z0-9+/=]{16,64}$/.test(rawNonce) ? rawNonce : undefined;

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${anuphan.variable}`}
    >
      <body className="bg-canvas text-text-primary antialiased">
        <ThemeProvider nonce={nonce}>
          <ThemeColorSync />
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

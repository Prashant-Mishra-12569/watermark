import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { RouteHeader } from "./_site/route-header";
import { SiteFooter } from "./_site/site-footer";
import "./globals.css";

// Self-hosted at build time by next/font: no request to Google at runtime, so the CSP stays font-src 'self'.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["italic", "normal"],
  variable: "--font-instrument-serif",
  display: "swap",
});

// SITE_FINAL.md hero, page 1. Pages may set their own title.
export const metadata: Metadata = {
  title: "Watermark · Stop bots from farming your airdrop",
  description:
    "Watermark lets only wallets backed by a real bank card claim. Add it with one line. No KYC. Your users pay no fees.",
  referrer: "no-referrer",
  // Absolute URLs for the share images (opengraph-image.png / twitter-image.png in this folder).
  metadataBase: new URL("https://usewatermark.xyz"),
  applicationName: "Watermark",
  openGraph: {
    type: "website",
    siteName: "Watermark",
    url: "https://usewatermark.xyz",
    title: "Watermark · Stop bots from farming your airdrop",
    description: "Only wallets backed by a real bank card can claim. One line of code. No KYC. Users pay no fees.",
  },
  twitter: {
    card: "summary_large_image",
    site: "@usewatermark",
    title: "Watermark · Stop bots from farming your airdrop",
    description: "Only wallets backed by a real bank card can claim. One line of code. No KYC. Users pay no fees.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

/**
 * Header (site or flow mode, chosen from the route) and footer on every page. Pages render their own <main> inside
 * #content and no header or footer of their own.
 */
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="flex min-h-dvh flex-col bg-bg font-sans text-ink antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <RouteHeader />
        <div id="content" tabIndex={-1} className="flex-1">
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Masthead } from "@/components/Masthead";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const sans = Public_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-face",
});

const display = Familjen_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-face",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-mono-face",
});

export const metadata: Metadata = {
  title: "BörsBråket",
  description:
    "A monthly stock-picking league. Five stocks a month, prices checked every week, one table that settles the argument.",
  // A private league. Keeping it out of search results costs nothing.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        {/* The scroll reveal is the only thing that hides content until
            script runs, so it is switched off when there is none. */}
        <noscript>
          <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        <AuthProvider>
          <Masthead />
          <main className="shell">{children}</main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}

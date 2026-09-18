import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Masthead } from "@/components/Masthead";
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
  // Each route names itself in a thin layout; this frames it, so the tab
  // reads "BörsBråket - League" rather than just the app name everywhere.
  title: {
    default: "BörsBråket",
    template: "BörsBråket - %s",
  },
  description:
    "A monthly stock-picking league. Five stocks a month, prices checked every week, one table that settles the argument.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <AuthProvider>
          <Masthead />
          <main className="shell">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}

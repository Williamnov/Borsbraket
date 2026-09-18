import type { Metadata } from "next";
import { Familjen_Grotesk, IBM_Plex_Mono, Public_Sans } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { LeagueProvider } from "@/components/LeagueProvider";
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
  // Each route names itself in a thin layout; this frames it, so the tab
  // reads "BörsBråket - League" rather than just the app name everywhere.
  title: {
    default: "BörsBråket",
    template: "BörsBråket - %s",
  },
  description:
    "A monthly stock-picking league. Five stocks a month, prices checked every week, one table that settles the argument.",
  // A private league. Keeping it out of search results costs nothing.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        {/*
          Runs before the masthead below it is parsed, so the navigation
          paints with the right links in the very first frame.

          Every page here is prerendered, so the HTML is the same for a
          visitor and an admin — it has to be, or hydration would
          disagree with it. Which links are visible is therefore a CSS
          question, and this answers it from the last visit before React
          exists. Without it the nav shows one link until hydration
          finishes and then snaps to seven.

          A hint about what to paint, never a permission: /admin
          redirects anyone who does not belong and firestore.rules
          refuses the reads regardless. The key matches HINT_KEY in
          lib/authHint.ts.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=JSON.parse(localStorage.getItem("borsbraket:auth-hint")||"null");if(!h)return;var d=document.documentElement;if(h.signedIn)d.setAttribute("data-signed-in","1");if(h.canPlay)d.setAttribute("data-player","1");if(h.isAdmin)d.setAttribute("data-admin","1")}catch(e){}})()`,
          }}
        />
        {/* The scroll reveal is the only thing that hides content until
            script runs, so it is switched off when there is none. */}
        <noscript>
          <style>{`.reveal { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        <AuthProvider>
          {/* One set of Firestore listeners for the whole session, rather
              than five per page. See components/LeagueProvider.tsx. */}
          <LeagueProvider>
            <Masthead />
            <main className="shell">{children}</main>
            <SiteFooter />
          </LeagueProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

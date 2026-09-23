import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { LeagueProvider } from "@/components/LeagueProvider";
import { Masthead } from "@/components/Masthead";
import { SiteFooter } from "@/components/SiteFooter";
import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans-face",
});

/**
 * Headings, in a serif.
 *
 * This is the one decision that does most of the work in making the page
 * read as research rather than as an app. Everything else here — the
 * slate palette, the square corners, the wide-tracked labels — is
 * quiet; a serif headline over a table of numbers is not, and it is what
 * the eye recognises.
 *
 * Source Serif 4 rather than a display serif on purpose: it was drawn
 * for screen text, so it holds up at 16px in a panel header as well as
 * at 29px in a page title.
 */
const display = Source_Serif_4({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-face",
});

/**
 * The wordmark only — one word, in the masthead and nowhere else.
 *
 * It used to be Poppins, a geometric sans chosen to match the supplied
 * artwork. That had circular bowls and soft corners, which sat oddly
 * against square panels and a serif headline once the rest of the page
 * changed, so the wordmark is now the text face, set uppercase and
 * widely tracked in .brand-word. One font fewer to download, too.
 *
 * Drop the real wordmark into public/ and .brand-word becomes an <img>.
 * There is no separate brand face any more; --font-brand in globals.css
 * points at the text face.
 */

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

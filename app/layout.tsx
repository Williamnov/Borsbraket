import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Plus_Jakarta_Sans, Poppins } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";
import { Backdrop } from "@/components/Backdrop";
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
 * Headings.
 *
 * This was Source Serif 4, and the serif was doing a lot of work: it made
 * a page of returns read as a research note rather than as an app. It
 * also made it read as a printed one. The brief now is clean rather than
 * bookish, so the headline face is a sans again.
 *
 * Plus Jakarta Sans rather than another grotesque, for two reasons. Its
 * bowls are close to circular, which is what the crown in the masthead is
 * built from, so a headline under the logo looks related to it. And it
 * has enough character at 40px — the flat-sided g, the open apertures —
 * to carry a hero on its own, which Inter, set large, does not.
 *
 * Inter still sets everything below heading size. It is the better face
 * at 13px in a table, and the two are near enough in proportion that the
 * switch between them is not something you notice.
 */
/*
 * No `weight` list on purpose. Plus Jakarta Sans is a variable font, and
 * naming weights makes next/font fetch a static instance per weight —
 * four files where the variable one covers 200 to 800 in a single
 * request of about the same size as one of them.
 */
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-face",
});

/**
 * The wordmark only — one word, in the masthead and nowhere else.
 *
 * The supplied logo is a geometric sans with circular bowls, which the
 * body and display faces here are not. A single weight of one subset is
 * a few kilobytes and next/font serves it from our own origin, so this
 * costs no third-party request.
 *
 * It is a close match rather than the artwork itself. Drop the real
 * wordmark into public/ and .brand-word becomes an <img>.
 *
 * The logo does not follow the rest of the design. It was briefly set in
 * the text face, uppercase and tracked, to go with the square corners —
 * which was a change nobody asked for to the one element that is not
 * ours to restyle. A brand is a fixed point; the page is built around it.
 */
const brand = Poppins({
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
  variable: "--font-brand-face",
});

/*
 * Not a variable font, so every weight here is another file. The page
 * uses exactly two — 400 for plain figures, 600 for the ones that are
 * the point of their row — and 500 was listed without ever being set.
 */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
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
    <html lang="en" className={`${sans.variable} ${display.variable} ${brand.variable} ${mono.variable}`}>
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
            {/* The landing page's sky. Out of flow and behind everything,
                so it can run up under the masthead — which is why it is
                here and not in the page. */}
            <Backdrop />
            <Masthead />
            <main className="shell">{children}</main>
            <SiteFooter />
          </LeagueProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

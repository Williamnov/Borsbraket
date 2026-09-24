"use client";

import Link from "next/link";
import { Reveal } from "@/components/ui";
import { WEEKS_PER_ROUND } from "@/lib/scoring";

const POINTS = [
  {
    label: "Picking",
    text: "Up to five stocks a month, equal weight, from the Nordic exchanges plus the S&P 500, NYSE, Nasdaq, TSX and the London main market. Established companies only.",
  },
  {
    label: "Scoring",
    text: "Prices are recorded once a week. Your return is the average across your holdings, measured from the opening price. Monthly finishes pay 10/7/5/4/3/2, one point for everyone else who submitted.",
  },
  {
    label: "Sealed picks",
    text: "Nobody sees anyone else's picks until the month locks. That is enforced in the database, not hidden in the interface.",
  },
  {
    label: "Invite only",
    text: "Anyone can reach the site and sign in, but an admin has to approve the account before it can pick or see the league.",
  },
];

/**
 * The three numbers the whole game runs on, pulled straight out of the
 * prose beside them. Nothing here is a claim the rules do not already
 * make: the five is the pick limit, the four is WEEKS_PER_ROUND, and the
 * six is how many places the monthly table pays.
 */
const FIGURES = [
  { figure: "5", unit: "stocks", caption: "picked at the start of each month" },
  { figure: String(WEEKS_PER_ROUND), unit: "checkpoints", caption: "one price recorded every week" },
  { figure: "6", unit: "places", caption: "pay 10 / 7 / 5 / 4 / 3 / 2 points" },
];

/**
 * The home screen, and what the masthead name links to. It used to bounce
 * approved players straight to /league, which made clicking the name look
 * like it did nothing. Now it stays put and simply points you onward.
 *
 * The navy behind the top of this page is not here — it is <Backdrop />,
 * rendered from the root layout so it can run up under the masthead. All
 * this page has to know is that its first screenful is light on dark.
 */
export default function LandingPage() {
  return (
    <div className="home">
      {/*
        The hero animates on a plain CSS delay rather than through
        <Reveal>. It is above the fold on every window, so there is
        nothing to observe an intersection with — and going through the
        observer would mean the first thing a visitor sees is invisible
        until React has hydrated.
      */}
      <section className="home-hero">
        <h1 style={{ animationDelay: "60ms" }}>
          Five stocks.
          <br />
          One month.
          <br />
          <em>One table.</em>
        </h1>
        <p style={{ animationDelay: "220ms" }}>
          BörsBråket is a private stock-picking league. Everyone picks up to five stocks at the
          start of the month, prices are checked once a week, and the month&rsquo;s return decides
          who takes the points.
        </p>
        {/* Both buttons are in the markup and CSS shows one, the same way
            the masthead decides its links. Choosing in React meant the
            button could not appear until hydration had finished, which on
            a prerendered page is the few hundred milliseconds you could
            see. See the inline script in app/layout.tsx. */}
        <div className="home-actions" style={{ animationDelay: "320ms" }}>
          <Link href="/league" className="button primary cta-player">
            Go to the league
          </Link>
          <Link href="/login" className="button primary cta-guest">
            Sign in to play
          </Link>
          <Link href="/instructions" className="button ghost">
            Read the rules
          </Link>
        </div>
      </section>

      {/* Still over the blue, so this row is glass rather than paper. It
          is also the join: below it the sky has run out and the page is
          white. */}
      <div className="home-figures">
        {FIGURES.map((item, index) => (
          <div
            key={item.unit}
            className="home-figure"
            style={{ animationDelay: `${420 + index * 90}ms` }}
          >
            <strong className="mono">{item.figure}</strong>
            <span className="home-figure-unit">{item.unit}</span>
            <span className="home-figure-caption">{item.caption}</span>
          </div>
        ))}
      </div>

      <section className="home-points">
        {POINTS.map((point, index) => (
          <Reveal key={point.label} delay={index * 80}>
            <article className="home-point">
              <span className="label">{point.label}</span>
              <p>{point.text}</p>
            </article>
          </Reveal>
        ))}
      </section>
    </div>
  );
}

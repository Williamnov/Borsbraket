import Link from "next/link";
import type { Metadata } from "next";
import { Reveal } from "@/components/ui";
import { POINTS, TAIL_POINTS, MAX_PICKS, WEEKS_PER_ROUND } from "@/lib/scoring";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The rules of the league: picking, scoring, eligible markets and the weekly price checkpoints.",
};

/**
 * The rules, as something you can scan.
 *
 * Four sections: the shape of a month, the four rules that surprise
 * people, the points, and where you can pick from. It used to be eight,
 * and about twice as many words — a second explanation of the weekly
 * checkpoints as a timeline under the four steps that already listed
 * them, three cards of commentary beside the points table, four cards
 * of prose for four market regions, and a paragraph about the message
 * board on a page nobody reaches looking for the message board. A rules
 * page is read once, quickly, by somebody deciding whether to join.
 *
 * The numbers come from lib/scoring.ts rather than being written out, so
 * the page cannot drift from what the code actually does.
 */

const STEPS = [
  {
    title: "Get approved",
    body: "The site is public; the league is not. Sign in, and an admin lets you in.",
  },
  {
    title: "Pick up to five",
    body: `Any time before the lock. Equal weight — ${MAX_PICKS} picks means a fifth each, three means a third each.`,
  },
  {
    title: "Picks seal",
    body: "Everyone's picks appear at once and the baseline price is taken.",
  },
  {
    title: `${WEEKS_PER_ROUND} weekly checkpoints`,
    body: "A price every seven days. The table moves once a week, not tick by tick.",
  },
];

const RULES = [
  {
    title: "Sealed until the lock",
    body: "Other players' picks are never sent to your browser while the month is open. That is enforced in the database, not hidden in the interface.",
  },
  {
    title: "Measured from the lock",
    body: "Not from the first of the month — otherwise whoever picked last could choose something that had already moved.",
  },
  {
    title: "No size floor",
    body: "Anything an admin has marked eligible, micro caps included. Ask for anything missing; it takes seconds.",
  },
  {
    title: "Local currency, no dividends",
    body: "Each stock in its own currency, so the game stays about stock picking rather than currency timing.",
  },
];

const REGIONS = [
  {
    name: "Nordics",
    lists: "Stockholm, Helsinki, Copenhagen and Reykjavík, all caps — plus Oslo Børs, First North, Spotlight, NGM and Euronext Growth.",
  },
  { name: "North America", lists: "NYSE, Nasdaq, NYSE American and Toronto." },
  {
    name: "Europe",
    lists: "London main market, Xetra, Euronext Paris and Amsterdam, SIX Swiss, Madrid and Milan.",
  },
  { name: "Asia-Pacific", lists: "Tokyo and the ASX." },
];

export default function InstructionsPage() {
  const podium = POINTS.map((points, i) => ({ place: i + 1, points }));

  return (
    <div className="guide">
      <header className="guide-hero">
        <h1>How it works</h1>
        <p>
          Five stocks a month. Prices are checked every week from the moment picks seal, and the
          best return takes the points.
        </p>
        <div className="guide-chips">
          <span className="guide-chip">
            <strong>{MAX_PICKS}</strong> picks a month
          </span>
          <span className="guide-chip">
            <strong>{WEEKS_PER_ROUND}</strong> weekly checkpoints
          </span>
          <span className="guide-chip">
            <strong>{POINTS[0]}</strong> points for a win
          </span>
        </div>
      </header>

      <Reveal>
        <section className="guide-section">
          <h2>A month, start to finish</h2>
          <ol className="guide-steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="guide-step-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <span className="secondary">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="guide-section">
          <h2>Worth knowing</h2>
          <div className="guide-cards">
            {RULES.map((rule) => (
              <div key={rule.title} className="guide-card">
                <h3>{rule.title}</h3>
                <p>{rule.body}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="guide-section">
          <h2>Points</h2>
          <div className="guide-split">
            <table className="guide-points">
              <thead>
                <tr>
                  <th>Finish</th>
                  <th className="right">Points</th>
                </tr>
              </thead>
              <tbody>
                {podium.map(({ place, points }) => (
                  <tr key={place} className={place <= 3 ? `medal-${place}` : undefined}>
                    <td>
                      {place}
                      {place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}
                    </td>
                    <td className="right mono">{points}</td>
                  </tr>
                ))}
                <tr>
                  <td className="secondary">Everyone else who picked</td>
                  <td className="right mono">{TAIL_POINTS}</td>
                </tr>
                <tr>
                  <td className="secondary">No picks submitted</td>
                  <td className="right mono">—</td>
                </tr>
              </tbody>
            </table>

            <div className="stack-sm">
              <p className="secondary">
                A holding&rsquo;s return is the latest checkpoint over the baseline; your month is
                the average across your holdings. One with no price yet is left out of that average
                rather than counted as zero.
              </p>
              <p className="secondary">
                Points are awarded when an admin settles the month. OMXS30 and the S&amp;P 500 are
                priced alongside as a reference line — they cannot be picked, and losing to them is
                its own punishment.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="guide-section">
          <h2>Where you can pick from</h2>
          {/* A list, not four cards. Nobody reads this section — they
              scan it for one exchange name. */}
          <dl className="guide-markets">
            {REGIONS.map((region) => (
              <div key={region.name}>
                <dt>{region.name}</dt>
                <dd>{region.lists}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Reveal>

      <div className="guide-end">
        <Link href="/login" className="button primary">
          Sign in to join
        </Link>
        <Link href="/league" className="button">
          See the league table
        </Link>
      </div>
    </div>
  );
}

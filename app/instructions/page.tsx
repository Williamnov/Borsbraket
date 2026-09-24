import Link from "next/link";
import type { Metadata } from "next";
import { Reveal } from "@/components/ui";
import { MAX_MONTHLY_POINTS, MAX_PICKS, POINTS, WEEKS_PER_ROUND } from "@/lib/scoring";

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
    title: "Pick in the last week",
    body: `Picking for a month opens on the last Monday of the month before. Up to ${MAX_PICKS} stocks, equal weight — five means a fifth each, three means a third each.`,
  },
  {
    title: "Picks seal on the last weekday",
    body: "Everyone's picks appear at once and the closing price that evening becomes the baseline.",
  },
  {
    title: "The month runs",
    body: `A price every seven days, and a last one when the month closes on its own final Monday — ${WEEKS_PER_ROUND} checkpoints, then the next month's picking week begins.`,
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
    title: "No index to beat",
    body: "The only thing you are measured against is what the other players picked. There is no benchmark line.",
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
  return (
    <div className="guide">
      <header className="guide-hero">
        <h1>How it works</h1>
        <p>
          Five stocks a month, picked in the last week of the month before. Prices are checked
          every week from the moment picks seal, and you are measured against the other players
          and nothing else.
        </p>
        <div className="guide-chips">
          <span className="guide-chip">
            <strong>{MAX_PICKS}</strong> picks a month
          </span>
          <span className="guide-chip">
            <strong>{WEEKS_PER_ROUND}</strong> weekly checkpoints
          </span>
          <span className="guide-chip">
            <strong>{MAX_MONTHLY_POINTS}</strong> points in a perfect month
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
                  <th>For</th>
                  <th className="right">Points</th>
                </tr>
              </thead>
              <tbody>
                <tr className="medal-1">
                  <td>Best portfolio of the month</td>
                  <td className="right mono">{POINTS.bestPortfolio}</td>
                </tr>
                <tr className="medal-2">
                  <td>Holding the month&rsquo;s best single stock</td>
                  <td className="right mono">{POINTS.bestStock}</td>
                </tr>
                <tr className="medal-3">
                  <td>Finishing the month up</td>
                  <td className="right mono">{POINTS.positive}</td>
                </tr>
                <tr>
                  <td className="secondary">Down, and beaten</td>
                  <td className="right mono">0</td>
                </tr>
              </tbody>
            </table>

            <div className="stack-sm">
              <p className="secondary">
                Three separate awards, so one good month can win all {MAX_MONTHLY_POINTS} and a
                quiet one can still be worth something. Ties share rather than split — two
                identical portfolios have both beaten the field.
              </p>
              <p className="secondary">
                <strong>Beating everyone always pays</strong>, even in a month where everyone is
                down: &minus;1% against &minus;2% is still the best portfolio in the league.
                Holding the best single stock does not work that way — a stock that fell is not
                the month&rsquo;s best call, however much less it fell than the rest, so that
                award goes unpaid when nothing is up.
              </p>
              <p className="secondary">
                Your month is the average across your holdings; one with no price yet is left out
                of that average rather than counted as zero. Points are awarded when an admin
                settles the month.
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

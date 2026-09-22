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
 * It was a page of prose, and nobody reads a page of prose to find out
 * how many points second place gets. The substance is unchanged — the
 * shape is: four steps for the shape of a month, cards for the rules
 * that have exceptions, a real table for the points, and a timeline for
 * the checkpoints, which is the part that changed most recently and is
 * the easiest to get wrong from a paragraph.
 *
 * The numbers come from lib/scoring.ts rather than being written out, so
 * the page cannot drift from what the code actually does.
 */

const STEPS = [
  {
    title: "Get approved",
    body: "The site is public; the league is not. Sign in, then an admin lets you in. Until then you sit in the waiting room and see nothing.",
  },
  {
    title: "Pick up to five",
    body: `Any time between the month opening and the lock. Equal weight, no position sizing — ${MAX_PICKS} picks means a fifth each, three means a third each.`,
  },
  {
    title: "Picks seal",
    body: "At the lock, everyone's picks become visible at once and the baseline price is taken. Nothing can be changed after that.",
  },
  {
    title: "Four weekly checkpoints",
    body: "A price is recorded every seven days from the lock. The table moves once a week rather than tick by tick.",
  },
];

const REGIONS = [
  {
    name: "Nordics",
    lists: "Stockholm, Helsinki, Copenhagen and Reykjavík — Large, Mid and Small Cap — plus Oslo Børs, First North, Spotlight, NGM and the Euronext growth lists.",
  },
  {
    name: "North America",
    lists: "NYSE, Nasdaq and NYSE American, which between them cover the S&P 500, plus the Toronto Stock Exchange.",
  },
  {
    name: "Europe",
    lists: "London main market, Xetra, Euronext Paris and Amsterdam, SIX Swiss, Bolsa de Madrid and Borsa Italiana.",
  },
  {
    name: "Asia-Pacific",
    lists: "Tokyo Stock Exchange and the Australian Securities Exchange.",
  },
];

export default function InstructionsPage() {
  const podium = POINTS.map((points, i) => ({ place: i + 1, points }));

  return (
    <div className="guide">
      <header className="guide-hero">
        <h1>How it works</h1>
        <p>
          Everyone picks up to five stocks a month. Prices are recorded every week from the moment
          picks seal. The best return takes the points, and the season table settles the argument.
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
          <h2>What you can and cannot do</h2>
          <div className="guide-cards">
            <div className="guide-card">
              <h3>Up to five, equally weighted</h3>
              <p>
                Fewer is allowed, more is not, and every holding carries the same weight. There is
                no way to concentrate a bet — the same ticker cannot be entered twice.
              </p>
            </div>
            <div className="guide-card">
              <h3>Sealed until the lock</h3>
              <p>
                Nobody sees your picks before the month locks, and that is enforced in the database
                rather than hidden in the interface: other players&rsquo; picks are never sent to
                your browser while the month is open.
              </p>
            </div>
            <div className="guide-card">
              <h3>A list, not a filter</h3>
              <p>
                Only instruments an admin has marked eligible can be picked, checked when your picks
                are saved. There is <strong>no size floor</strong>: Stockholm&rsquo;s Mid Cap, Small
                Cap, First North and Spotlight lists are all in, micro caps included, so a
                well-judged small company counts the same as a well-judged large one. Ask an admin
                to add anything missing; it takes seconds.
              </p>
            </div>
            <div className="guide-card">
              <h3>Local currency, no dividends</h3>
              <p>
                Returns are measured in each stock&rsquo;s own currency. A Stockholm pick and a New
                York pick are compared on local performance, which keeps the game about stock
                picking rather than currency timing.
              </p>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="guide-section">
          <h2>How a month is measured</h2>
          <p className="secondary measure">
            Five prices are recorded per holding. The first is the <strong>baseline</strong>, taken
            when picks seal — not when the month opens. That matters: if the baseline were the
            first of the month, whoever submitted last would already have seen several days of
            trading and could pick something that had <em>already</em> moved. Sealing and measuring
            at the same instant gives everyone the same starting price.
          </p>

          <ol className="guide-timeline">
            <li>
              <span className="guide-dot" aria-hidden="true" />
              <strong>Baseline</strong>
              <span className="secondary">The price at the lock. Everything is measured from here.</span>
            </li>
            {[1, 2, 3, 4].map((week) => (
              <li key={week}>
                <span className="guide-dot" aria-hidden="true" />
                <strong>Week {week}</strong>
                <span className="secondary">{week * 7} days after the lock.</span>
              </li>
            ))}
          </ol>

          <p className="secondary measure">
            A holding&rsquo;s return is <code>latest checkpoint ÷ baseline − 1</code>, and your month
            is the plain average across your holdings. A holding with no price yet is left out of
            that average rather than counted as zero, and the table says the portfolio is only
            partly priced until it catches up.
          </p>
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
              <div className="guide-card">
                <h3>Settled, then awarded</h3>
                <p>
                  Points appear only once an admin settles the month. A month with no picks does not
                  count towards your average either.
                </p>
              </div>
              <div className="guide-card">
                <h3>Four ways to be top</h3>
                <p>
                  The season table sorts by points, compounded return, average month or monthly
                  wins. They tell different stories, and arguing about which one counts is part of
                  the fun.
                </p>
              </div>
              <div className="guide-card">
                <h3>The benchmark</h3>
                <p>
                  OMXS30 and the S&amp;P 500 are priced alongside the picks as a reference line. They
                  cannot be picked and do not compete. Losing to the index is its own punishment.
                </p>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="guide-section">
          <h2>Where you can pick from</h2>
          <div className="guide-cards">
            {REGIONS.map((region) => (
              <div key={region.name} className="guide-card">
                <h3>{region.name}</h3>
                <p>{region.lists}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal delay={60}>
        <section className="guide-section">
          <h2>Chat</h2>
          <p className="secondary measure">
            The <Link href="/chat">message board</Link> is threads with one level of replies, visible
            to every approved player. A posted message cannot be edited by anyone, so nobody gets to
            rewrite a call after the fact — you can delete your own, and admins can delete anything.
            None of it touches the scoring.
          </p>
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

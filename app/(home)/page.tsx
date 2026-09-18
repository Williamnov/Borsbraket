"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Reveal } from "@/components/ui";

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
 * The home screen, and what the masthead name links to. It used to bounce
 * approved players straight to /league, which made clicking the name look
 * like it did nothing. Now it stays put and simply points you onward.
 */
export default function LandingPage() {
  const { canPlay } = useAuth();

  return (
    <div className="stack" style={{ paddingTop: 56 }}>
      <div className="measure">
        <h1 style={{ fontSize: 38, letterSpacing: "-0.03em" }}>
          Five stocks. One month. One table.
        </h1>
        <p className="secondary" style={{ marginTop: 14, fontSize: 17 }}>
          BörsBråket is a private stock-picking league. Everyone picks up to five stocks at the
          start of the month, prices are checked once a week, and the month&rsquo;s return decides
          who takes the points.
        </p>
        {/* No loading gate. Waiting for the real answer meant the primary
            button appeared a few hundred milliseconds late and shoved the
            row sideways; useAuth now answers immediately from the last
            visit's cached hint and corrects itself if it was wrong. The
            worst case is a link that redirects to sign-in. */}
        <div className="row" style={{ marginTop: 28 }}>
          {canPlay ? (
            <Link href="/league" className="button primary">
              Go to the league
            </Link>
          ) : (
            <Link href="/login" className="button primary">
              Sign in to play
            </Link>
          )}
          <Link href="/instructions" className="button">
            Read the rules
          </Link>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 24 }}>
        {POINTS.map((point, index) => (
          <Reveal key={point.label} delay={index * 70}>
            <div className="stack-sm" style={{ gap: 6 }}>
              <span className="label">{point.label}</span>
              <p className="secondary">{point.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

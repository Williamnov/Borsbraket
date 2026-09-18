"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

/**
 * The home screen, and what the masthead name links to. It used to bounce
 * approved players straight to /league, which made clicking the name look
 * like it did nothing. Now it stays put and simply points you onward.
 */
export default function LandingPage() {
  const { canPlay, loading } = useAuth();

  return (
    <div className="stack" style={{ paddingTop: 48 }}>
      <div className="measure">
        <h1 style={{ fontSize: 34 }}>Five stocks. One month. One table.</h1>
        <p className="secondary" style={{ marginTop: 12, fontSize: 16 }}>
          BörsBråket is a private stock-picking league. Everyone picks up to five stocks at the
          start of the month, prices are checked once a week, and the month&rsquo;s return decides
          who takes the points.
        </p>
        <div className="row" style={{ marginTop: 24 }}>
          {!loading &&
            (canPlay ? (
              <Link href="/league" className="button primary">
                Go to the league
              </Link>
            ) : (
              <Link href="/login" className="button primary">
                Sign in to play
              </Link>
            ))}
          <Link href="/instructions" className="button">
            Read the rules
          </Link>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-body">
          <div className="grid-2">
            <div className="stack-sm">
              <span className="label">Picking</span>
              <p className="secondary">
                Up to five stocks per month, equal weight, from the Nordic exchanges plus the S&amp;P
                500, NYSE, Nasdaq, TSX and the London main market. Established companies only — no
                penny stocks that can swing 1000% in a week.
              </p>
            </div>
            <div className="stack-sm">
              <span className="label">Scoring</span>
              <p className="secondary">
                Prices are recorded four times a month, once a week. Your return is the average
                across your holdings, measured from the opening price. Monthly finishes pay
                10/7/5/4/3/2 points, one point for everyone else who submitted.
              </p>
            </div>
            <div className="stack-sm">
              <span className="label">Sealed picks</span>
              <p className="secondary">
                Nobody sees anyone else&rsquo;s picks until the month locks. That is enforced in the
                database, not just hidden in the interface.
              </p>
            </div>
            <div className="stack-sm">
              <span className="label">Invite only</span>
              <p className="secondary">
                Anyone can reach the site and sign in, but an admin has to approve the account
                before it can pick or see the league.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

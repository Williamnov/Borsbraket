"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";

/**
 * One footer for the whole site, rendered from the layout.
 *
 * The scoring caveat used to be repeated at the bottom of every league
 * page; it only means anything to someone who can see a table, so it is
 * shown to approved players and skipped on the sign-in pages.
 */
export function SiteFooter() {
  const { canPlay } = useAuth();

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div>
          {canPlay ? (
            <p className="site-footer-note">
              Returns are equal-weighted across your holdings, measured in each stock&rsquo;s own
              currency, excluding dividends and currency moves.
            </p>
          ) : null}
          <span className="byline">Built by William Novak, 2026</span>
        </div>
        <Link href="/instructions">How it works</Link>
      </div>
    </footer>
  );
}

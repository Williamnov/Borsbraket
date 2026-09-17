"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { direction, displayName, formatPercent } from "@/lib/format";
import type { Profile } from "@/lib/types";

export function Avatar({ profile, large }: { profile: Profile | null | undefined; large?: boolean }) {
  const color = profile?.color ?? 1;
  return (
    <span className={`avatar c${color}${large ? " lg" : ""}`} aria-hidden="true">
      {profile?.emoji ?? "📈"}
    </span>
  );
}

export function PlayerCell({
  profile,
  you,
  withMotto,
}: {
  profile: Profile | null | undefined;
  you?: boolean;
  withMotto?: boolean;
}) {
  return (
    <div className="player">
      <Avatar profile={profile} />
      <span style={{ minWidth: 0 }}>
        <span className="name">
          {displayName(profile)}
          {you ? " (you)" : ""}
        </span>
        {withMotto && profile?.motto ? <span className="motto">{profile.motto}</span> : null}
      </span>
    </div>
  );
}

export function Value({ value, precise }: { value: number | null | undefined; precise?: boolean }) {
  const dir = direction(value);
  const className = dir === "up" ? "value up" : dir === "down" ? "value down" : dir === "none" ? "value none" : "value";
  return <span className={className}>{formatPercent(value, precise)}</span>;
}

/**
 * A bar per period, sized by magnitude and coloured by sign. Used for
 * the four weekly checkpoints inside a month, and for the run of
 * settled months on the season table.
 */
export function WeekBars({
  path,
  labels,
  unit = "Week",
}: {
  path: (number | null)[];
  labels?: string[];
  unit?: string;
}) {
  const scale = Math.max(0.03, ...path.map((v) => Math.abs(v ?? 0)));
  return (
    <span className="weeks" role="img" aria-label={`${unit} by ${unit.toLowerCase()} progression`}>
      {path.map((value, i) => {
        const height = value === null ? 4 : Math.max(4, Math.round((Math.abs(value) / scale) * 20));
        const dir = direction(value);
        return (
          <i
            key={i}
            className={`week-bar${dir === "up" ? " up" : dir === "down" ? " down" : ""}`}
            style={{ height }}
            title={`${labels?.[i] ?? `${unit} ${i + 1}`}: ${formatPercent(value)}`}
          />
        );
      })}
    </span>
  );
}

export function StatusPill({ phase }: { phase: "open" | "live" | "settled" }) {
  const label = phase === "open" ? "Open for picks" : phase === "live" ? "Running" : "Settled";
  return <span className={`pill ${phase}`}>{label}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Panel({
  title,
  action,
  children,
  flush,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="panel">
      <header>
        <h2>{title}</h2>
        {action ? <span className="grow">{action}</span> : null}
      </header>
      <div className={flush ? "panel-body flush" : "panel-body"}>{children}</div>
    </section>
  );
}

/**
 * Wraps the pages only approved players may see. The rules already
 * refuse the data; this just avoids rendering an empty table at someone
 * who is signed out or still waiting.
 */
export function RequirePlayer({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { loading, user, profile, canPlay, isAdmin, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !configured) return;
    if (!user) router.replace("/login");
    else if (!canPlay) router.replace("/pending");
    else if (admin && !isAdmin) router.replace("/league");
  }, [loading, configured, user, canPlay, isAdmin, admin, router]);

  if (!configured) {
    return (
      <div className="page-head">
        <h1>Not connected yet</h1>
        <p>
          This deployment has no Firebase configuration. Add the{" "}
          <code>NEXT_PUBLIC_FIREBASE_*</code> variables in the Vercel project settings and redeploy.
        </p>
      </div>
    );
  }

  if (loading) return <div className="empty">Loading…</div>;
  if (!user || !canPlay || (admin && !isAdmin)) return <div className="empty">Redirecting…</div>;
  if (!profile) return <div className="empty">Loading your profile…</div>;

  return <>{children}</>;
}

export function PageHead({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div className="spread">
        <h1>{title}</h1>
        {action}
      </div>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      Returns are equal-weighted across your holdings, measured in each stock&rsquo;s own currency,
      excluding dividends and currency moves. <Link href="/instructions">Full rules</Link>.
    </footer>
  );
}

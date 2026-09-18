"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";
import { direction, displayName, formatPercent } from "@/lib/format";
import type { SortDirection } from "@/lib/scoring";
import type { Profile } from "@/lib/types";

export function Avatar({
  profile,
  large,
  size,
}: {
  profile: Profile | null | undefined;
  large?: boolean;
  size?: "lg" | "xl";
}) {
  const color = profile?.color ?? 1;
  const scale = size ?? (large ? "lg" : null);
  const photo = profile?.photoUrl;

  return (
    <span className={`avatar c${color}${scale ? ` ${scale}` : ""}`} aria-hidden="true">
      {photo ? (
        // A data URL from the player's own upload. next/image would need a
        // loader and gains nothing here: the bytes are already inline and
        // already resized.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" />
      ) : (
        (profile?.emoji ?? "📈")
      )}
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

/**
 * A clickable column heading. The arrow only appears on the column that
 * is actually doing the sorting, so the header row stays quiet.
 */
export function SortHeader<T extends string>({
  column,
  active,
  direction: dir,
  onSort,
  align,
  children,
}: {
  column: T;
  active: T;
  direction: SortDirection;
  onSort: (column: T) => void;
  align?: "right" | "center";
  children: ReactNode;
}) {
  const isActive = column === active;
  return (
    <th
      className={`sortable${align ? ` ${align}` : ""}${isActive ? " is-sorted" : ""}`}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="sort-button" onClick={() => onSort(column)}>
        <span>{children}</span>
        <span className={`sort-arrow${isActive ? ` ${dir}` : ""}`} aria-hidden="true" />
      </button>
    </th>
  );
}

/**
 * Fades a block in the first time it reaches the viewport, once only —
 * nothing re-plays on the way back up the page.
 *
 * The block starts transparent, so the two ways that could strand it are
 * both closed: `prefers-reduced-motion` pins it visible in CSS, and a
 * <noscript> block in the layout does the same when no script runs.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <div
      ref={ref}
      className={`reveal${shown ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

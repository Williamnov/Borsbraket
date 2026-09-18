"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLeagueBase } from "@/components/LeagueProvider";
import { Avatar } from "@/components/ui";
import { displayName } from "@/lib/format";
import { profileDescription, type Profile } from "@/lib/types";

/**
 * Find a player or a page, from the masthead.
 *
 * A magnifying glass that slides a field out in place rather than a
 * dialog over the page: the search belongs to the navigation, so it
 * stays in the navigation. It closes on Escape, on a click anywhere
 * else, and on picking a result.
 *
 * Deliberately not a search over stocks or messages. Those want different
 * answers — a stock search belongs in the pick editor next to the list it
 * filters, and Firestore cannot do text search over chat without either
 * an index nobody wants to run or loading the board first.
 *
 * Everything this searches is already in memory: the pages are a constant
 * and the players come from the provider's existing subscription. So it
 * opens instantly and costs nothing to run.
 */

type Target =
  | { kind: "page"; href: string; label: string; hint: string }
  | { kind: "player"; href: string; profile: Profile };

const PAGES: { href: string; label: string; hint: string; admin?: boolean }[] = [
  { href: "/league", label: "League", hint: "The season table" },
  { href: "/month", label: "This month", hint: "Picks and standings" },
  { href: "/chat", label: "Chat", hint: "The message board" },
  { href: "/history", label: "History", hint: "Every settled month" },
  { href: "/instructions", label: "How it works", hint: "The rules" },
  { href: "/profile", label: "Profile", hint: "Your own page" },
  { href: "/admin", label: "Admin", hint: "Run the league", admin: true },
];

/** Case- and accent-insensitive, so "bjorn" finds "Björn". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function Search() {
  const router = useRouter();
  const { canPlay, isAdmin } = useAuth();
  const { profiles } = useLeagueBase();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  /**
   * Escape closes it, and so does a click anywhere outside.
   *
   * Both are bound only while it is open, so the app is not listening to
   * every click on every page for the sake of a field nobody has opened.
   * mousedown rather than click, so pressing on the page closes it at
   * once instead of waiting for the button to come back up.
   */
  useEffect(() => {
    if (!open) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  // Focus follows the field out, once it has somewhere to go.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const results = useMemo<Target[]>(() => {
    const needle = fold(query.trim());

    const pages: Target[] = PAGES.filter((p) => !p.admin || isAdmin)
      .filter((p) => needle === "" || fold(p.label).includes(needle))
      .map((p) => ({ kind: "page", href: p.href, label: p.label, hint: p.hint }));

    const players: Target[] = profiles
      .filter((p) => p.status === "approved" || p.isAdmin)
      .filter((p) => {
        if (needle === "") return true;
        return (
          fold(displayName(p)).includes(needle) ||
          fold(p.handle ?? "").includes(needle) ||
          fold(profileDescription(p)).includes(needle)
        );
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "sv", { sensitivity: "base" }))
      .map((p) => ({ kind: "player", href: `/players/${p.uid}`, profile: p }));

    // Pages first before anything is typed, players first once something
    // is: a typed name is almost always a person.
    const ordered = needle === "" ? [...pages, ...players] : [...players, ...pages];
    return ordered.slice(0, 10);
  }, [query, profiles, isAdmin]);

  useEffect(() => setActive(0), [query]);

  function go(target: Target | undefined) {
    if (!target) return;
    router.push(target.href);
    close();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % Math.max(1, results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(1, results.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  }

  return (
    <div ref={rootRef} className={`search${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="search-trigger"
        aria-label={open ? "Close search" : "Search players and pages"}
        aria-expanded={open}
        onClick={() => (open ? close() : canPlay && setOpen(true))}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="search-icon">
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Always in the markup so the field has a width to slide out from,
          and out of the tab order while it is closed. */}
      <input
        ref={inputRef}
        className="search-field"
        value={query}
        placeholder="Player or page…"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        aria-label="Search players and pages"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
      />

      {open ? (
        <div className="search-drop" role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <p className="search-none">Nothing matches “{query}”.</p>
          ) : (
            <ul>
              {results.map((target, i) => (
                <li key={`${target.kind}:${target.href}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    className={`search-result${i === active ? " is-active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(target)}
                  >
                    {target.kind === "player" ? (
                      <>
                        <Avatar profile={target.profile} />
                        <span className="search-result-text">
                          <span className="search-result-title">
                            {displayName(target.profile)}
                          </span>
                          <span className="search-result-hint">
                            {profileDescription(target.profile) || "Player"}
                          </span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="search-result-glyph" aria-hidden="true">
                          →
                        </span>
                        <span className="search-result-text">
                          <span className="search-result-title">{target.label}</span>
                          <span className="search-result-hint">{target.hint}</span>
                        </span>
                      </>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

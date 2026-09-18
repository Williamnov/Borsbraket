"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useLeagueBase } from "@/components/LeagueProvider";
import { Avatar } from "@/components/ui";
import { displayName } from "@/lib/format";
import { profileDescription, type Profile } from "@/lib/types";

/**
 * Find a player or a page.
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
  { href: "/admin", label: "Admin", hint: "Run the league" },
];

/** Case- and accent-insensitive, so "bjorn" finds "Björn". */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  // Ctrl/Cmd-K from anywhere, Escape to leave. The shortcut is ignored
  // while typing somewhere else, so it cannot eat a chat message.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (canPlay) setOpen((current) => !current);
        return;
      }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, canPlay]);

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

    // Pages first on an empty query — they are what someone reaching for
    // a keyboard shortcut usually wants — and players first once there is
    // something to match, since a typed name is almost always a person.
    const ordered = needle === "" ? [...pages, ...players] : [...players, ...pages];
    return ordered.slice(0, 12);
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
    <>
      <button
        type="button"
        className="search-trigger"
        onClick={() => canPlay && setOpen(true)}
        aria-label="Search players and pages"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true" className="search-icon">
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M13 13 L17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="search-trigger-label">Search</span>
        <kbd className="search-kbd">⌘K</kbd>
      </button>

      {open ? (
        <div className="search-scrim" onMouseDown={close} role="presentation">
          <div
            className="search-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            // The scrim closes on click; the panel must not pass its own
            // clicks up to it.
            onMouseDown={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="search-input"
              value={query}
              placeholder="Find a player or a page…"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Search players and pages"
            />

            {results.length === 0 ? (
              <p className="empty">Nothing matches “{query}”.</p>
            ) : (
              <ul className="search-results">
                {results.map((target, i) => (
                  <li key={`${target.kind}:${target.href}`}>
                    <button
                      type="button"
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

            <p className="search-foot hint">
              ↑↓ to move · Enter to open · Esc to close
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

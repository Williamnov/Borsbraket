"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useChatUnread } from "@/lib/hooks";

const PLAYER_LINKS = [
  { href: "/league", label: "League" },
  { href: "/month", label: "This month" },
  { href: "/chat", label: "Chat" },
  { href: "/history", label: "History" },
  { href: "/instructions", label: "How it works" },
  { href: "/profile", label: "Profile" },
];

export function Masthead() {
  const pathname = usePathname();
  const { user, profile, canPlay, isAdmin, loading, signOut } = useAuth();
  const [lifted, setLifted] = useState(false);

  // Only for players, and only away from the board itself — standing on
  // the page is what clears the mark, so a badge there would be a count
  // of what you are already looking at.
  const onChat = pathname === "/chat";
  const unread = useChatUnread(profile?.uid ?? null, canPlay && !onChat);

  // The masthead earns a hairline shadow once the page has moved under it.
  useEffect(() => {
    const onScroll = () => setLifted(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // The Admin link is only built for admins, and /admin redirects anyone
  // else away. Both are conveniences: firestore.rules is what actually
  // refuses the writes.
  const links = canPlay
    ? isAdmin
      ? [...PLAYER_LINKS, { href: "/admin", label: "Admin" }]
      : PLAYER_LINKS
    : [{ href: "/instructions", label: "How it works" }];

  return (
    <header className={`masthead${lifted ? " is-lifted" : ""}`}>
      <div className="masthead-inner">
        <Link href="/" className="brand">
          {/* The five diamonds from app/icon.png — five picks a month —
              redrawn inline so the tab and the page carry the same mark
              and it takes its colour from the text beside it. */}
          <svg className="brand-mark" viewBox="0 0 512 512" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="26">
              {[
                [170, 180],
                [341, 180],
                [85, 325],
                [256, 325],
                [427, 325],
              ].map(([cx, cy]) => (
                <rect
                  key={`${cx}-${cy}`}
                  x={cx - 53}
                  y={cy - 53}
                  width="106"
                  height="106"
                  rx="14"
                  transform={`rotate(45 ${cx} ${cy})`}
                />
              ))}
            </g>
          </svg>
          BörsBråket
        </Link>

        <nav className="nav">
          {links.map((link) => {
            const badge = link.href === "/chat" ? unread : 0;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
              >
                {link.label}
                {badge > 0 ? (
                  <span className="nav-badge">
                    {badge > 9 ? "9+" : badge}
                    {/* The number alone reads as part of the label to a
                        screen reader, so it says what it counts. */}
                    <span className="visually-hidden">
                      {` unread ${badge === 1 ? "message" : "messages"}`}
                    </span>
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {!loading &&
          (user ? (
            <>
              <span className="nav-divider" aria-hidden="true" />
              <button type="button" className="signout small" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <Link href="/login" className="button primary small">
              Sign in
            </Link>
          ))}
      </div>
    </header>
  );
}

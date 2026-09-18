"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandMark } from "@/components/BrandMark";
import { useChatUnread } from "@/lib/hooks";

/**
 * Every link the masthead can show, in order, with who it is for.
 *
 * The list does not change with who is signed in — the markup is
 * identical for every visitor, because these pages are prerendered and
 * React must hydrate against HTML that was written before anyone knew
 * who would ask for it. `scope` becomes a class, and globals.css hides
 * what does not apply. See the inline script in app/layout.tsx.
 */
const LINKS: { href: string; label: string; scope: "all" | "player" | "admin" }[] = [
  { href: "/league", label: "League", scope: "player" },
  { href: "/month", label: "This month", scope: "player" },
  { href: "/chat", label: "Chat", scope: "player" },
  { href: "/history", label: "History", scope: "player" },
  { href: "/instructions", label: "How it works", scope: "all" },
  { href: "/profile", label: "Profile", scope: "player" },
  { href: "/admin", label: "Admin", scope: "admin" },
];

export function Masthead() {
  const pathname = usePathname();
  const { profile, canPlay, signOut } = useAuth();
  const [lifted, setLifted] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Only for players, and only away from the board itself — standing on
  // the page is what clears the mark, so a badge there would be a count
  // of what you are already looking at.
  const onChat = pathname === "/chat";
  const unread = useChatUnread(profile?.uid ?? null, canPlay && !onChat);

  /**
   * The masthead earns a hairline shadow once the page has moved under
   * it, and gets out of the way when you scroll down.
   *
   * Three things keep the hiding from being annoying. It only starts
   * below REVEAL_AT, so short pages and the top of long ones never lose
   * the bar. It ignores movements under DEADBAND, so a trackpad's jitter
   * or the rubber-band at the end of a page does not flicker it. And any
   * upward scroll at all brings it straight back, which is what someone
   * reaching for the nav is already doing.
   *
   * The reads are batched into a rAF because scroll fires far more often
   * than the screen repaints, and touching scrollY forces layout.
   */
  useEffect(() => {
    const REVEAL_AT = 140;
    const DEADBAND = 6;
    let last = window.scrollY;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - last;
      setLifted(y > 4);

      if (Math.abs(delta) > DEADBAND) {
        setHidden(delta > 0 && y > REVEAL_AT);
        last = y;
      }
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      className={`masthead${lifted ? " is-lifted" : ""}${hidden ? " is-hidden" : ""}`}
    >
      <div className="masthead-inner">
        <Link href="/" className="brand">
          <BrandMark className="brand-mark" />
          <span className="brand-word">BörsBråket</span>
        </Link>

        <nav className="nav">
          {LINKS.map((link) => {
            const badge = link.href === "/chat" ? unread : 0;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={link.scope === "all" ? undefined : `is-${link.scope}`}
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

        {/* Both are always in the markup; CSS shows one. Gating on
            `loading` meant neither appeared until hydration finished. */}
        <span className="auth-in">
          <span className="nav-divider" aria-hidden="true" />
          <button type="button" className="signout small" onClick={() => void signOut()}>
            Sign out
          </button>
        </span>
        <Link href="/login" className="button primary small auth-out">
          Sign in
        </Link>
      </div>
    </header>
  );
}

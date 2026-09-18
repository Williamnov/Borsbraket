"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";

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
  const { user, canPlay, isAdmin, loading, signOut } = useAuth();
  const [lifted, setLifted] = useState(false);

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
        <Link href={canPlay ? "/league" : "/"} className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          BörsBråket
        </Link>

        <nav className="nav">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
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

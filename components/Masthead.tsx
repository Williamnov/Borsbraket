"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

const PLAYER_LINKS = [
  { href: "/league", label: "League" },
  { href: "/month", label: "This month" },
  { href: "/history", label: "History" },
  { href: "/instructions", label: "How it works" },
  { href: "/profile", label: "Profile" },
];

export function Masthead() {
  const pathname = usePathname();
  const { user, canPlay, isAdmin, loading, signOut } = useAuth();

  const links = canPlay
    ? isAdmin
      ? [...PLAYER_LINKS, { href: "/admin", label: "Admin" }]
      : PLAYER_LINKS
    : [{ href: "/instructions", label: "How it works" }];

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <Link href={canPlay ? "/league" : "/"} className="brand">
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
            <button type="button" className="quiet small" onClick={() => void signOut()}>
              Sign out
            </button>
          ) : (
            <Link href="/login" className="button primary small">
              Sign in
            </Link>
          ))}
      </div>
    </header>
  );
}

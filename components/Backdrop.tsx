"use client";

import { usePathname } from "next/navigation";

/**
 * The wash behind the top of every page.
 *
 * Two versions of one idea. The landing page gets the logo's gradient at
 * full strength — navy overhead, steel blue through the middle, white by
 * the time the content starts. Everywhere else gets the pale end of the
 * same thing: enough blue in the first few hundred pixels that a panel
 * reads as floating on a tinted field rather than sitting on a flat
 * sheet, and not enough to compete with a table of numbers.
 *
 * It lives in the root layout rather than in the pages because it has to
 * start above them. The masthead is the first thing in the document and
 * the wash runs up behind it, so the bar floats on the tint rather than
 * sitting on a strip above it. From inside <main> that is not reachable
 * without negative offsets that guess the masthead's height.
 *
 * Absolute, not fixed, so it scrolls away with the top of the page it
 * belongs to. A fixed sky would still be navy under the masthead after
 * you had scrolled past everything that was on it.
 */
export function Backdrop() {
  const pathname = usePathname();
  return <div className={pathname === "/" ? "home-sky" : "page-sky"} aria-hidden="true" />;
}

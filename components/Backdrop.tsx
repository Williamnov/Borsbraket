"use client";

import { usePathname } from "next/navigation";

/**
 * The gradient behind the landing page: navy overhead, steel blue through
 * the middle, white by the time the content starts.
 *
 * It lives in the root layout rather than in the page because it has to
 * start above the page. The masthead is the first thing in the document
 * and the sky runs up behind it, so the bar floats on the dark rather
 * than sitting on a white strip above it. From inside <main> that is not
 * reachable without negative offsets that guess the masthead's height.
 *
 * Absolute, not fixed, so it scrolls away with the hero it belongs to.
 * A fixed sky would still be dark under the masthead after you had
 * scrolled past everything that was on it.
 *
 * Rendering nothing elsewhere is the whole route test: every other page
 * is white, and the ones that show tables should stay that way.
 */
export function Backdrop() {
  const pathname = usePathname();
  if (pathname !== "/") return null;
  return <div className="home-sky" aria-hidden="true" />;
}

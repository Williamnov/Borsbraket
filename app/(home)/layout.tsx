import type { Metadata } from "next";

/**
 * Every route carries its own title so the browser tab says where you are.
 * The pages themselves are client components and cannot export metadata,
 * so each segment gets a thin layout that does nothing but name itself.
 * The "BörsBråket - " prefix comes from the template in app/layout.tsx.
 */
export const metadata: Metadata = { title: "Home" };

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}

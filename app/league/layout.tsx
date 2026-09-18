import type { Metadata } from "next";

export const metadata: Metadata = { title: "League" };

export default function LeagueLayout({ children }: { children: React.ReactNode }) {
  return children;
}

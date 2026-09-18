import type { Metadata } from "next";

export const metadata: Metadata = { title: "Player" };

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return children;
}

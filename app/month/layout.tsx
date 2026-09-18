import type { Metadata } from "next";

export const metadata: Metadata = { title: "This month" };

export default function MonthLayout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Waiting for approval" };

export default function PendingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function PendingPage() {
  const { loading, user, profile, canPlay, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (canPlay) router.replace("/");
  }, [loading, user, canPlay, router]);

  if (loading) return <div className="empty">Loading…</div>;

  const rejected = profile?.status === "rejected";

  return (
    <div className="gate wide">
      <h1>{rejected ? "Not in this league" : "Waiting for approval"}</h1>

      {rejected ? (
        <p className="secondary">
          This account was not approved for BörsBråket. If that looks like a mistake, talk to
          whoever runs the league.
        </p>
      ) : (
        <>
          {/* The address comes from the auth session rather than the
              profile document: it is not stored on the profile any more,
              and this is the one browser that is entitled to it anyway. */}
          <p className="secondary">
            You are signed in as <strong>{user?.email}</strong>. An admin has to approve the
            account before you can see the league or submit picks. This page updates by itself the
            moment that happens.
          </p>
          <p className="secondary">
            While you wait, the <Link href="/instructions">rules</Link> are worth a read — there are
            only five picks a month, so they matter.
          </p>
        </>
      )}

      <button type="button" style={{ marginTop: 24 }} onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

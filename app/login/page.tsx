"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
} from "firebase/auth";
import { useAuth } from "@/components/AuthProvider";
import { firebaseAuth } from "@/lib/firebase/client";

const STORAGE_KEY = "borsbraket:signin-email";

export default function LoginPage() {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Completing a magic link: the address comes back in the URL.
  useEffect(() => {
    if (!configured) return;
    const auth = firebaseAuth();
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const stored = window.localStorage.getItem(STORAGE_KEY);
    const address = stored ?? window.prompt("Confirm the email address you used") ?? "";
    if (!address) return;

    setBusy(true);
    signInWithEmailLink(auth, address, window.location.href)
      .then(() => {
        window.localStorage.removeItem(STORAGE_KEY);
        router.replace("/league");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [configured, router]);

  useEffect(() => {
    if (!loading && user) router.replace("/league");
  }, [loading, user, router]);

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await sendSignInLinkToEmail(firebaseAuth(), email.trim(), {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(STORAGE_KEY, email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link.");
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(firebaseAuth(), new GoogleAuthProvider());
      router.replace("/league");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="page-head">
        <h1>Not connected yet</h1>
        <p>
          This deployment has no Firebase configuration, so sign-in is unavailable. Add the{" "}
          <code>NEXT_PUBLIC_FIREBASE_*</code> variables in the Vercel project settings and redeploy.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "56px auto 0" }}>
      <h1>Sign in</h1>
      <p className="secondary" style={{ marginTop: 8, marginBottom: 24 }}>
        New accounts need an admin&rsquo;s approval before they can pick. Signing in is the first
        step — you will land in the waiting room until you are let in.
      </p>

      {sent ? (
        <div className="notice good">
          Check <strong>{email}</strong> for a sign-in link. Open it on this device.
        </div>
      ) : (
        <form onSubmit={sendLink} className="stack-sm">
          <label className="field" htmlFor="email">
            <span>Email address</span>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Sending…" : "Email me a sign-in link"}
          </button>
        </form>
      )}

      <div className="row" style={{ marginTop: 20, justifyContent: "center" }}>
        <span className="hint">or</span>
      </div>

      <button type="button" style={{ width: "100%", marginTop: 12 }} onClick={() => void withGoogle()} disabled={busy}>
        Continue with Google
      </button>

      {error ? (
        <div className="notice bad" style={{ marginTop: 16 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}

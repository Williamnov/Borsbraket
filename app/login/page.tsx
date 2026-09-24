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

/**
 * Remembering the address between sending a magic link and following it.
 *
 * Wrapped, because localStorage is not always there to be written to: a
 * private window, storage switched off, an embedded browser. Elsewhere
 * in the app that only costs a badge (lib/chatRead.ts) or a first-paint
 * guess (lib/authHint.ts). Here it was the difference between a sign-in
 * page and a blank one — the read below happens inside an effect, so an
 * exception took the whole page down, on the one page a locked-out
 * player has to be able to use.
 *
 * Without storage the flow still works: the link asks for the address
 * instead of remembering it, which is exactly what the prompt is for.
 */
function remembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function remember(address: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, address);
  } catch {
    // The link still arrives; following it will ask for the address.
  }
}

function forget(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing was stored in the first place.
  }
}

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

    const address = remembered() ?? window.prompt("Confirm the email address you used") ?? "";
    if (!address) return;

    setBusy(true);
    signInWithEmailLink(auth, address, window.location.href)
      .then(() => {
        forget();
        router.replace("/");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  }, [configured, router]);

  useEffect(() => {
    if (!loading && user) router.replace("/");
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
      // After the send, and separately from it: a storage failure must
      // not be reported as "could not send the link" when the link is
      // already on its way.
      remember(email.trim());
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
      router.replace("/");
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
    <div className="gate">
      <h1>Sign in</h1>
      <p className="secondary" style={{ marginBottom: 24 }}>
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

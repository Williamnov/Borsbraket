"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { firebaseAuth, firestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { getHint, getServerHint, setHint, subscribeHint } from "@/lib/authHint";
import type { Profile } from "@/lib/types";

/**
 * The public half of an address: everything before the @.
 *
 * This is what the league table falls back to when a player has not
 * chosen a display name. The address itself goes to contacts/{uid},
 * which only its owner and admins can read.
 */
function handleFrom(email: string | null): string {
  const local = (email ?? "").split("@")[0].trim();
  return local ? local.slice(0, 64) : "player";
}

type AuthValue = {
  configured: boolean;
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  /** Approved players and admins. */
  canPlay: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue>({
  configured: false,
  loading: true,
  user: null,
  profile: null,
  canPlay: false,
  isAdmin: false,
  signOut: async () => {},
});

export function useAuth(): AuthValue {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isFirebaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!configured) {
      setAuthReady(true);
      setProfileReady(true);
      return;
    }
    return onAuthStateChanged(firebaseAuth(), (next) => {
      setUser(next);
      setAuthReady(true);
      if (!next) {
        setProfile(null);
        setProfileReady(true);
      } else {
        setProfileReady(false);
      }
    });
  }, [configured]);

  useEffect(() => {
    if (!configured || !user) return;
    const ref = doc(firestore(), "profiles", user.uid);

    return onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setProfile({ ...(snap.data() as Profile), uid: snap.id });
          setProfileReady(true);
          return;
        }
        // First sign-in: register as a pending player. The rules pin
        // status to 'pending' and isAdmin to false, so this cannot be
        // used to walk straight into the league.
        //
        // Two documents, one batch. The profile is league-wide readable
        // and carries only the handle; the address goes to contacts/{uid}
        // where the rules check it against the one on the auth token. A
        // batch means an admin never sees an approval request with no
        // address attached to it.
        const batch = writeBatch(firestore());
        batch.set(ref, {
          uid: user.uid,
          handle: handleFrom(user.email),
          alias: null,
          emoji: "📈",
          color: 1,
          motto: null,
          photoUrl: null,
          status: "pending",
          isAdmin: false,
          createdAt: serverTimestamp(),
        });
        // Only when there is one to record. The rules pin the value to
        // the address on the auth token, so writing a placeholder for a
        // provider that gave us none would fail the batch and leave the
        // player without a profile at all.
        if (user.email) {
          batch.set(doc(firestore(), "contacts", user.uid), {
            uid: user.uid,
            email: user.email,
          });
        }

        void batch
          .commit()
          .catch(() => {
            /* A second tab won the race, or rules refused. The snapshot
               below reports whichever is true. */
          })
          .finally(() => setProfileReady(true));
      },
      () => setProfileReady(true),
    );
  }, [configured, user]);

  const signOut = useCallback(async () => {
    // Clear the hint first: if the sign-out round trip is slow, the next
    // paint should already have stopped offering the league.
    setHint(null);
    if (configured) await fbSignOut(firebaseAuth());
  }, [configured]);

  const hint = useSyncExternalStore(subscribeHint, getHint, getServerHint);
  const resolved = authReady && profileReady;

  // Remember the answer for the next visit, once it is actually known.
  useEffect(() => {
    if (!resolved) return;
    const isAdmin = profile?.isAdmin === true;
    const canPlay = isAdmin || profile?.status === "approved";
    setHint(user ? { canPlay, isAdmin } : null);
  }, [resolved, user, profile]);

  const value = useMemo<AuthValue>(() => {
    const realIsAdmin = profile?.isAdmin === true;
    const realCanPlay = realIsAdmin || profile?.status === "approved";

    return {
      configured,
      // Still reports the truth: anything that needs certainty rather
      // than a good guess — RequirePlayer, the admin panel — waits on it.
      loading: !resolved,
      user,
      profile,
      // Optimistic until the real answer lands, so the first frame can
      // show the right thing instead of an empty gap. A stale hint costs
      // a redirect, never access: the rules are unmoved by it.
      isAdmin: resolved ? realIsAdmin : (hint?.isAdmin ?? false),
      canPlay: resolved ? realCanPlay : (hint?.canPlay ?? false),
      signOut,
    };
  }, [configured, resolved, user, profile, hint, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

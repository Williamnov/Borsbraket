"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore, isFirebaseConfigured } from "@/lib/firebase/client";
import type { Profile } from "@/lib/types";

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
        void setDoc(ref, {
          uid: user.uid,
          email: user.email ?? "",
          alias: null,
          emoji: "📈",
          color: 1,
          motto: null,
          photoUrl: null,
          status: "pending",
          isAdmin: false,
          createdAt: serverTimestamp(),
        })
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
    if (configured) await fbSignOut(firebaseAuth());
  }, [configured]);

  const value = useMemo<AuthValue>(() => {
    const isAdmin = profile?.isAdmin === true;
    return {
      configured,
      loading: !authReady || !profileReady,
      user,
      profile,
      isAdmin,
      canPlay: isAdmin || profile?.status === "approved",
      signOut,
    };
  }, [configured, authReady, profileReady, user, profile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

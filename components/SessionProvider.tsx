

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { restoreKey, isSignedIn, getUser, updateUser, clearSession, isOnboardingPending, type User } from "@/lib/session";
import { getMe, checkSession, getAuthControls } from "@/lib/auth";

interface SessionContextType {
  isInitialized: boolean;
  isLoggedIn: boolean;
  user: User | null;
  refreshUser: () => Promise<void>;
  /** AppLayout reports session rejection because this provider sits above ToastProvider and cannot use its context. */
  sessionExpired: boolean;
  sessionVerified: boolean;
  appPaused: boolean;
}

const SessionContext = createContext<SessionContextType>({
  isInitialized: false,
  isLoggedIn: false,
  user: null,
  refreshUser: async () => {},
  sessionExpired: false,
  sessionVerified: false,
  appPaused: false,
});

export function useSession(): SessionContextType {
  return useContext(SessionContext);
}

/**
 * Redirect auth visitors only after verifying a complete session, including the IndexedDB AES key.   Return
 * true while loading or redirecting so callers hide the form.
 */
export function useRedirectIfLoggedIn(): boolean {
  const { isInitialized, isLoggedIn, user, sessionVerified } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isInitialized || !sessionVerified || !isLoggedIn) return;
    router.replace(isOnboardingPending(user) ? "/onboarding" : "/new");
  }, [isInitialized, sessionVerified, isLoggedIn, user, router]);

  return !isInitialized || !sessionVerified || isLoggedIn;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionVerified, setSessionVerified] = useState(false);
  const [appPaused, setAppPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Restore the IndexedDB key before startup; verify the session separately so network outages do not
      // block cached use.
      const signedIn = isSignedIn();
      const storedUser = getUser();
      const hasKey = await restoreKey();
      if (cancelled) return;

      if (signedIn && storedUser && hasKey) {
        setUser(storedUser);
        setIsLoggedIn(true);

        // Clear the session only on confirmed rejection; network failures do not prove invalidity and must
        // not delete the AES key.
        checkSession().then((result) => {

          if (cancelled) return;

          if (result.status === "ok") {
            updateUser(result.user);
            setUser(result.user);
            return;
          }

          if (result.status === "rejected") {
            void clearSession().catch(() => {});
            setIsLoggedIn(false);
            setUser(null);
            setSessionExpired(true);
          }
          if (result.status === "paused") setAppPaused(true);
          // Backend unreachable: keep the cached session.
        }).finally(() => {
          if (!cancelled) setSessionVerified(true);
        });
      } else {

        setSessionVerified(true);
      }

      setIsInitialized(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isInitialized || !isLoggedIn) return;
    const refresh = () => {
      getAuthControls().then((controls) => setAppPaused(!controls.login_enabled), () => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [isInitialized, isLoggedIn]);

  const refreshUser = async (): Promise<void> => {
    const freshUser = await getMe();
    if (freshUser) {
      updateUser(freshUser);
      setUser(freshUser);
    }
  };

  return (
    <SessionContext.Provider value={{ isInitialized, isLoggedIn, user, refreshUser, sessionExpired, sessionVerified, appPaused }}>
      {children}
    </SessionContext.Provider>
  );
}

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { isOnboardingPending } from "@/lib/session";
import { logout } from "@/lib/auth";
import { settingsHref } from "@/lib/settingsOverlay";
import { AppShell } from "@/components/app/AppShell";
import { LibraryContext, useLibrary } from "@/components/wired/useLibrary";
import { SettingsOverlay } from "@/components/wired/Settings";
import { SearchHost } from "@/components/wired/SearchHost";
import { ToolApprovalHost } from "@/components/app/ToolApprovalHost";
import { ConfirmIdentityHost } from "@/components/wired/ConfirmIdentityHost";
import { AuthShell } from "@/components/auth/AuthShell";
import { StatusView } from "@/components/auth/StatusView";

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const library = useLibrary();
  const [searchOpen, setSearchOpen] = useState(false);
  const isFree = (user?.tier ?? "free") === "free";

  return (
    <>
      <AppShell
        sidebar={{
          chats: library.chats,
          starredProjects: library.starredProjects,
          loading: library.loading,
          active: library.active,
          user: {
            name: user?.display_name || null,
            email: user?.email ?? "",
            plan: isFree ? "Free plan" : "Pro plan",
            isFree,
          },
          ...library.actions,
          onOpenSettings: () => router.push(settingsHref(pathname, "general", new URLSearchParams(window.location.search))),
          onOpenSearch: () => setSearchOpen(true),
          onUpgrade: () => router.push("/plans"),
          onLogout: logout,
        }}
      >
        <LibraryContext.Provider value={{ chats: library.chats, raw: library.raw, loading: library.loading, actions: library.actions }}>
          {children}
        </LibraryContext.Provider>
      </AppShell>
      {library.dialogs}
      <SearchHost open={searchOpen} onClose={() => setSearchOpen(false)} chats={library.raw.chats} projects={library.raw.projects} />
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isInitialized, isLoggedIn, user, sessionExpired, appPaused } = useSession();
  const router = useRouter();
  const { showError } = useToast();
  const expiryAnnounced = useRef(false);

  useEffect(() => {
    if (!sessionExpired || expiryAnnounced.current) return;
    expiryAnnounced.current = true;
    showError("Your session has expired. Please sign in again.");
  }, [sessionExpired, showError]);

  useEffect(() => {
    if (!isInitialized) return;
    if (appPaused) return;
    if (!isLoggedIn) {
      router.replace("/login");
    } else if (isOnboardingPending(user)) {
      router.replace("/onboarding");
    }
  }, [isInitialized, isLoggedIn, user, appPaused, router]);

  if (!isInitialized || !isLoggedIn) return null;

  if (appPaused) return (
    <AuthShell>
      <StatusView label="App access" state="error" title="Karui is paused." text="The app is temporarily unavailable. Please try again later." />
    </AuthShell>
  );

  if (isOnboardingPending(user)) return null;

  return (
    <>
      <Shell>{children}</Shell>
      <Suspense fallback={null}>
        <SettingsOverlay />
      </Suspense>
      <ToolApprovalHost />
      <ConfirmIdentityHost />
    </>
  );
}

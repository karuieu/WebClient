"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/SessionProvider";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { isInitialized, isLoggedIn } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isInitialized && !isLoggedIn) {
      router.replace("/login");
    }
  }, [isInitialized, isLoggedIn, router]);

  if (!isInitialized || !isLoggedIn) return null;

  return <>{children}</>;
}

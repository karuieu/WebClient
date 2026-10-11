"use client";

import { useEffect, useState } from "react";
import { getAuthControls, type AuthControls } from "@/lib/auth";

export function useAuthControls(): AuthControls | null {
  const [controls, setControls] = useState<AuthControls | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      getAuthControls().then((next) => { if (active) setControls(next); }, () => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return controls;
}

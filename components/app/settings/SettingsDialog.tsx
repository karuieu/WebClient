"use client";

import * as React from "react";
import { AlertCircle, CreditCard, Gauge, Layers, Lock, ShieldCheck, Sliders } from "@/components/kit/icons";
import { SettingsFrame, type FrameTab } from "./SettingsFrame";

export type SettingsTab = "general" | "usage" | "memory" | "providers" | "billing" | "security" | "danger";

const TABS: FrameTab<SettingsTab>[] = [
  { id: "general", label: "General", icon: <Sliders className="size-4" /> },
  { id: "usage", label: "Usage", icon: <Gauge className="size-4" /> },
  { id: "memory", label: "Memory", icon: <Layers className="size-4" /> },
  { id: "providers", label: "Providers", icon: <ShieldCheck className="size-4" /> },
  { id: "billing", label: "Billing", icon: <CreditCard className="size-4" /> },
  { id: "security", label: "Security", icon: <Lock className="size-4" /> },
  { id: "danger", label: "Danger zone", icon: <AlertCircle className="size-4" />, danger: true },
];

export function SettingsDialog(props: {
  open: boolean;
  tab: SettingsTab;
  onTab: (t: SettingsTab) => void;
  onClose: () => void;
  sections: Record<SettingsTab, React.ReactNode>;
  badges?: Partial<Record<SettingsTab, string>>;
}) {
  return <SettingsFrame title="Settings" tabs={TABS} {...props} />;
}

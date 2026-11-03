import { redirect } from "next/navigation";

import { DEFAULT_SETTINGS_TAB, isSettingsTab } from "@/lib/ui/settingsOverlay";

// These tabs left settings for the Workspace page.
const MOVED_TO_WORKSPACE: Record<string, string> = { connectors: "connectors", skills: "skills", "your-memory": "memory" };

export default async function LegacySettingsRedirect({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const requested = slug?.[0];
  const moved = requested ? MOVED_TO_WORKSPACE[requested] : undefined;
  if (moved) redirect(`/workspace?tab=${moved}`);
  const tab = isSettingsTab(requested) ? requested : DEFAULT_SETTINGS_TAB;
  redirect(`/new?settings=${tab}`);
}

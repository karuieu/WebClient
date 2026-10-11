import { redirect } from "next/navigation";

import { DEFAULT_SETTINGS_TAB, isSettingsTab } from "@/lib/settingsOverlay";

export default async function LegacySettingsRedirect({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  const requested = slug?.[0];
  const tab = isSettingsTab(requested) ? requested : DEFAULT_SETTINGS_TAB;
  redirect(`/new?settings=${tab}`);
}

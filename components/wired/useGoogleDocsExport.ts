"use client";

import * as React from "react";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import type { Artifact } from "@/lib/artifacts";
import { CONNECTORS_UPDATED_EVENT, loadConnectors } from "@/lib/userConnectors";

export function useGoogleDocsExport(id: string | null, artifact: Artifact | undefined): {
  onExportGoogleDocs?: (source: string) => void;
  exportingGoogleDocs: boolean;
} {
  const { user } = useSession();
  const { showError, showInfo, showSuccess } = useToast();
  const [connected, setConnected] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const busy = React.useRef(false);

  React.useEffect(() => {
    let generation = 0;
    setConnected(false);
    const refresh = () => {
      const attempt = ++generation;
      if (user?.tier !== "pro") { setConnected(false); return; }
      loadConnectors({ fresh: true }).then((list) => {
        if (attempt === generation) setConnected(list.some((c) => c.api === "docs" && !!c.oauth && !c.signedOut));
      }).catch(() => { if (attempt === generation) setConnected(false); });
    };
    refresh();
    window.addEventListener(CONNECTORS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      generation++;
      window.removeEventListener(CONNECTORS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [user?.id, user?.tier]);

  const save = async (source: string): Promise<void> => {
    if (!id || !artifact || busy.current) return;
    busy.current = true;
    setExporting(true);
    let tab: Window | null = null;
    try {
      tab = window.open("about:blank", "_blank");
      if (tab) tab.opener = null;
      showInfo("Exporting to Google Docs…");
      const { saveArtifactToGoogleDocs } = await import("@/lib/artifactGoogleDocs");
      const result = await saveArtifactToGoogleDocs(id, { ...artifact, content: source });
      if (tab && !tab.closed) tab.location.href = result.url;
      showSuccess(result.updated ? "Google copy updated" : "Exported to Google Docs and saved in Drive");
    } catch (error) {
      tab?.close();
      showError(error instanceof Error ? error.message : "Couldn't export to Google Docs. Try again.");
    } finally {
      busy.current = false;
      setExporting(false);
    }
  };

  return { onExportGoogleDocs: connected && id && artifact && !artifact.edit && !artifact.streaming ? save : undefined, exportingGoogleDocs: exporting };
}

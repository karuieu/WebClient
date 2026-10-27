"use client";

import { Suspense, useContext, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createChat, deleteChat, ensureChatModelAvailable, type ModelType } from "@/lib/chat/chat";
import { assignChatToProject } from "@/lib/projects/projects";
import { useSession } from "@/components/SessionProvider";
import { useToast } from "@/components/Toast";
import { truncateName, GREETING_NAME_MAX_CHARS } from "@/lib/account/auth";
import { DRAFT_OFFERED_EVENT, registerDraftRescue, takeDraft } from "@/lib/ui/draftRescue";
import { stashFirstMessage, type FirstMessage } from "@/lib/ui/handoff";
import { NewChatView } from "@/components/app/NewChatView";
import { isHalloweenSeason, pickCostume } from "@/components/app/greeting";
import { useNow } from "@/components/kit/useMounted";
import { ProjectPickerDialog } from "@/components/app/Dialogs";
import { DropOverlay } from "@/components/app/DropOverlay";
import { IncognitoChat } from "@/components/wired/IncognitoChat";
import { useComposer } from "@/components/wired/useComposer";
import { LibraryContext } from "@/components/wired/useLibrary";

export default function NewChatPage() {
  return (
    <Suspense fallback={null}>
      <NewChat />
    </Suspense>
  );
}

function NewChat() {
  const router = useRouter();
  const incognito = useSearchParams().has("incognito");
  const [incognitoFirst, setIncognitoFirst] = useState<FirstMessage | null>(null);
  const { user } = useSession();
  const { showError } = useToast();
  const { chats, raw, loading } = useContext(LibraryContext);
  const [isLoading, setIsLoading] = useState(false);
  const [memoryOn, setMemoryOn] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const project = raw.projects.find((p) => p.id === projectId);
  const textRef = useRef("");
  const now = useNow();
  // Drawn once per visit: toggling incognito only changes the query, so the costume stays and the chat header gets the same one.
  const [costume] = useState(pickCostume);
  const halloween = now && isHalloweenSeason(now) ? costume : undefined;

  const composer = useComposer({ onSubmit: () => handleSend() });
  textRef.current = composer.text;

  useEffect(() => {
    if (!incognito) setIncognitoFirst(null);
  }, [incognito]);

  useEffect(() => registerDraftRescue(() => textRef.current), []);
  useEffect(() => {
    const take = () => {
      const draft = takeDraft();
      if (draft) composer.setText(draft);
    };
    take();
    window.addEventListener(DRAFT_OFFERED_EVENT, take);
    return () => window.removeEventListener(DRAFT_OFFERED_EVENT, take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstMessage = (): FirstMessage => ({
    content: composer.text.trim(),
    model: composer.model as ModelType,
    webSearch: composer.webSearch,
    images: composer.images,
    files: composer.files,
  });

  const handleSend = async () => {
    if (composer.isEmpty || isLoading) return;
    if (incognito) {
      setIncognitoFirst(firstMessage());
      composer.reset();
      return;
    }
    setIsLoading(true);
    try {
      await ensureChatModelAvailable(composer.model as ModelType);
      const newChat = await createChat(undefined, memoryOn);
      if (project) {
        // Remove a chat if project assignment fails so it cannot inherit user memory instead of project context.
        await assignChatToProject(project.id, newChat.id).catch(async () => {
          await deleteChat(newChat.id).catch(() => {});
          throw new Error("Failed to add to project");
        });
      }
      stashFirstMessage(newChat.id, firstMessage());
      router.push(project ? `/projects/${project.id}/${newChat.id}` : `/chat/${newChat.id}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create chat");
      setIsLoading(false);
    }
  };

  const name = truncateName(user?.display_name || "", GREETING_NAME_MAX_CHARS) || null;

  if (incognito && incognitoFirst) return <IncognitoChat first={incognitoFirst} halloween={halloween} />;

  return (
    <div className="relative flex min-h-full flex-1 flex-col" {...composer.drop.dropHandlers}>
      <DropOverlay active={composer.drop.isDragging} note={composer.props.attachNote} />
      <NewChatView
        key={loading ? "loading" : "ready"}
        name={name}
        returning={chats.length > 0}
        incognito={{ on: incognito, onToggle: () => router.replace(incognito ? "/new" : "/new?incognito") }}
        halloween={halloween}
        composer={{
          ...composer.props,
          sending: isLoading,
          memory:
            composer.memoryAvailable && !project && !incognito
              ? { on: memoryOn, onToggle: () => setMemoryOn((m) => !m) }
              : undefined,
          project: incognito
            ? undefined
            : { name: project?.name ?? null, onPick: () => setPicking(true), onClear: () => setProjectId(null) },
        }}
      />
      <ProjectPickerDialog
        open={picking}
        onClose={() => setPicking(false)}
        onMove={(id) => {
          setProjectId(id);
          setPicking(false);
        }}
        onCreateProject={() => router.push("/projects")}
        currentProjectId={project?.id ?? null}
        projects={raw.projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </div>
  );
}

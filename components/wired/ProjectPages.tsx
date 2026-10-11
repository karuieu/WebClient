"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createChat, deleteChat, type ModelType } from "@/lib/chat";
import { stashFirstMessage } from "@/lib/handoff";
import { assignChatToProject } from "@/lib/projects";
import { useToast } from "@/components/Toast";
import { DropOverlay } from "@/components/app/DropOverlay";
import { ProjectHome } from "@/components/app/project/ProjectWorkspace";
import { ChatScreen } from "./ChatScreen";
import { enclaveFor } from "./messageView";
import { ProjectFrameContext } from "./ProjectScreen";
import { useComposer } from "./useComposer";


export function ProjectNewChat({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { showError } = useToast();
  const frame = React.useContext(ProjectFrameContext);
  const [starting, setStarting] = React.useState(false);
  const composer = useComposer({ onSubmit: () => void start() });

  async function start() {
    if (composer.isEmpty || starting) return;
    setStarting(true);
    try {
      const chat = await createChat();
      // A chat left outside the project would get the user's memory instead of
      // the project's, so it goes rather than stays.
      await assignChatToProject(projectId, chat.id).catch(async () => {
        await deleteChat(chat.id).catch(() => {});
        throw new Error("Couldn't start a chat in this project");
      });
      stashFirstMessage(chat.id, {
        content: composer.text.trim(),
        model: composer.model as ModelType,
        webSearch: composer.webSearch,
        images: composer.images,
        files: composer.files,
      });
      window.dispatchEvent(new CustomEvent("karui-reload-chats"));
      router.push(`/projects/${projectId}/${chat.id}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Couldn't start the chat");
      setStarting(false);
    }
  }

  if (!frame) return null;
  const name = frame.project?.name ?? "";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...composer.drop.dropHandlers}>
      <DropOverlay active={composer.drop.isDragging} note={composer.props.attachNote} />
      <ProjectHome
        name={name}
        goal={frame.project?.goal ?? ""}
        header={frame.header}
        enclave={enclaveFor(composer.model, false)}
        libraryNote={frame.libraryNote}
        onAddGoal={frame.openSettings}
        composer={{ ...composer.props, sending: starting, placeholder: name ? `Start a chat in ${name}…` : undefined }}
      />
    </div>
  );
}


export function ProjectChat({ projectId, chatId }: { projectId: string; chatId: string }) {
  const frame = React.useContext(ProjectFrameContext);
  return (
    <ChatScreen
      key={chatId}
      chatId={chatId}
      project={frame ? { routeProjectId: projectId, header: frame.header, onDocumentOpen: frame.setDocumentOpen } : undefined}
    />
  );
}

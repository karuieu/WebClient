"use client";

import * as React from "react";
import { INCOGNITO_CHAT_ID, sendIncognitoMessage, type Message, type ModelType } from "@/lib/chat/chat";
import type { FirstMessage } from "@/lib/ui/handoff";
import { clearQuoted, markQuoted } from "@/lib/messages/quotedHighlight";
import { packMessageContent, type ChatImage, type ChatTextFile } from "@/lib/messages/vision";
import { downloadArtifact } from "@/lib/artifacts/artifacts";
import { toBlockquote } from "@/lib/messages/messageBlocks";
import { thinkingSince } from "@/lib/messages/streamTags";
import { useToast } from "@/components/Toast";
import { ChatView } from "@/components/app/chat/ChatView";
import { DropOverlay } from "@/components/app/DropOverlay";
import type { Costume } from "@/components/kit/icons";
import { useComposer } from "./useComposer";
import { artifactPanelOf, enclaveFor, errorText, pendingQuestions, toViewData, type Streaming } from "./messageView";

/** Keep incognito messages only in component memory; navigation, reload, and tab closure discard the conversation. */
export function IncognitoChat({ first, halloween }: { first: FirstMessage; halloween?: Costume }): React.JSX.Element {
  const { showError } = useToast();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [stream, setStream] = React.useState<Streaming>(null);
  const [quote, setQuote] = React.useState<string | null>(null);
  const [openArtifact, setOpenArtifact] = React.useState<string | null>(null);
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const started = React.useRef(false);

  const composer = useComposer({ onSubmit: () => submit(), fixedModel: true });
  const streaming = stream !== null;
  const model = composer.model as ModelType;

  React.useEffect(() => clearQuoted, []);

  const send = (content: string, model: ModelType, images: ChatImage[], files: ChatTextFile[], webSearch: boolean) => {
    setQuote(null);
    clearQuoted();
    const history = messagesRef.current.map((m) => ({ role: m.role, content: m.content }));
    const pending: Message = {
      id: `pending-${Date.now()}`,
      chat_id: INCOGNITO_CHAT_ID,
      role: "user",
      content: packMessageContent(content, images, files),
      model,
      tokens: 0,
      pinned: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, pending]);
    setStream({ content: "", activity: null });
    sendIncognitoMessage(
      content,
      model,
      history,
      (token) => setStream((s) => {
        if (!s) return s;
        const content = s.content + token;
        return { ...s, activity: null, content, thinkingSince: thinkingSince(content, s.thinkingSince ?? null) };
      }),
      webSearch,
      (activity) => setStream((s) => s && { ...s, activity }),
      images,
      files,
    )
      .then((pair) => setMessages((prev) => [...prev.filter((m) => m.id !== pending.id), ...pair]))
      .catch((error: unknown) => {
        setMessages((prev) => prev.filter((m) => m.id !== pending.id));
        composer.setText(content);
        showError(errorText(error, "Failed to send message"));
      })
      .finally(() => setStream(null));
  };

  // A ref, not state: Strict Mode runs this effect twice and the first message must go once.
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (first.webSearch) composer.setWebSearch(true);
    composer.setModel(first.model);
    send(first.content, first.model, first.images, first.files, first.webSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    if (composer.isEmpty || streaming) return;
    const typed = composer.text.trim();
    const content = quote ? `${toBlockquote(quote)}\n\n${typed}`.trim() : typed;
    send(content, model, composer.images, composer.files, composer.webSearch);
    composer.reset();
  }

  const { data, artifacts } = React.useMemo(() => toViewData(messages, stream), [messages, stream]);
  const current = openArtifact ? artifacts.get(openArtifact) : undefined;
  const [dismissedQuestions, setDismissedQuestions] = React.useState<string | null>(null);
  const asking = pendingQuestions(data, dismissedQuestions);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" {...composer.drop.dropHandlers}>
      <DropOverlay active={composer.drop.isDragging} note={composer.props.attachNote} />
      <ChatView
        title="Incognito chat"
        halloween={halloween}
        enclave={enclaveFor(model, streaming)}
        messages={data}
        composer={{
          ...composer.props,
          sending: streaming,
          quote,
          onClearQuote: () => {
            setQuote(null);
            clearQuoted();
          },
        }}
        onQuote={(text) => {
          const sel = window.getSelection();
          clearQuoted();
          if (sel?.rangeCount) markQuoted(sel.getRangeAt(0));
          setQuote(text);
        }}
        questions={
          asking && {
            ...asking,
            onAnswer: (answer) => {
              setDismissedQuestions(asking.id);
              send(answer, model, [], [], composer.webSearch);
            },
            onSkip: () => setDismissedQuestions(asking.id),
          }
        }
        onOpenArtifact={(a) => setOpenArtifact(a.id)}
        onDownloadArtifact={(a) => {
          const art = artifacts.get(a.id);
          if (art) downloadArtifact(art);
        }}
        artifactPanel={artifactPanelOf(openArtifact, current, () => setOpenArtifact(null))}
      />
    </div>
  );
}

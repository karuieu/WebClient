import { SystemState } from "./SystemState";

const COPY = {
  chat: {
    label: "Chat not found",
    title: "This chat",
    titleMuted: "isn't here.",
    text: "We couldn't find a chat with this ID on your account.",
    caption: "Chat ID",
  },
  project: {
    label: "Project not found",
    title: "This project",
    titleMuted: "isn't here.",
    text: "We couldn't find a project with this ID on your account.",
    caption: "Project ID",
  },
  page: {
    label: "Not found",
    title: "This page",
    titleMuted: "wandered off.",
    text: undefined,
    caption: "Address",
  },
} as const;

export type NotFoundKind = keyof typeof COPY;

/** Shown inside the app shell when the id (or address) in the URL has nothing behind it on this account. */
export function ResourceNotFound({ kind, value }: { kind: NotFoundKind; value: string }) {
  const { caption, ...copy } = COPY[kind];
  return (
    <div className="grid flex-1 place-items-center px-5 py-14">
      <div className="w-full max-w-[26rem]">
        <SystemState {...copy} detail={{ caption, value }} />
      </div>
    </div>
  );
}

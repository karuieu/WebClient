import type { NotFoundKind } from "@/components/app/ResourceNotFound";

const CHAT = /^\/(?:chat|projects\/[^/]+)\/([^/]+)\/?$/;
const PROJECT = /^\/projects\/([^/]+)\/?$/;

/** What the address of a missing in-app page was pointing at: a chat, a project, or nothing we know. */
export function notFoundTarget(pathname: string): { kind: NotFoundKind; value: string } {
  const chat = CHAT.exec(pathname)?.[1];
  if (chat) return { kind: "chat", value: chat };
  const project = PROJECT.exec(pathname)?.[1];
  if (project) return { kind: "project", value: project };
  return { kind: "page", value: pathname };
}

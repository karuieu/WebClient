import type { Artifact } from "@/lib/artifacts";
import { googleDocContent, googleDocRequests } from "@/lib/googleDocContent";
import { GOOGLE_DOCS_URL, GoogleApiError, googleId, googleRequest } from "@/lib/googleWorkspace";
import { SignInRequired } from "@/lib/mcpClient";
import { getUser } from "@/lib/session";
import { loadConnectors, saveGoogleDocument, serverFor, type GoogleDocument } from "@/lib/userConnectors";

type DocumentBody = { content?: { endIndex?: number }[] };
type DocumentTab = { documentTab?: { body?: DocumentBody }; childTabs?: DocumentTab[] };
type DocumentState = { documentId?: string; revisionId?: string; body?: DocumentBody; tabs?: DocumentTab[] };
export type GoogleDocSave = { url: string; updated: boolean };

export function googleDocumentUrl(id: string): string {
  return `https://docs.google.com/document/d/${googleId(id)}/edit`;
}

function endOfDocument(state: DocumentState): number {
  if (state.tabs && (state.tabs.length !== 1 || state.tabs[0].childTabs?.length)) throw new Error("This Google Doc has multiple tabs. Karui won't replace it.");
  const body = state.tabs?.[0].documentTab?.body ?? state.body;
  const end = body?.content?.at(-1)?.endIndex;
  if (typeof end !== "number" || end < 2) throw new Error("Google didn't return the document's contents. Nothing was replaced.");
  return end;
}

async function saveArtifact(id: string, artifact: Pick<Artifact, "title" | "type" | "content">): Promise<GoogleDocSave> {
  if (getUser()?.tier !== "pro") throw new Error("Google Docs export comes with Pro.");
  const content = googleDocContent(artifact);
  const connector = (await loadConnectors({ fresh: true })).find((c) => c.api === "docs");
  if (!connector) throw new Error("Connect Google Docs in Settings, under Connectors, before saving.");
  const server = await serverFor(connector);
  if (!server) throw new SignInRequired();
  let binding: GoogleDocument | undefined = connector.documents?.[id];
  const updated = !!binding;
  if (!binding) {
    const created = await googleRequest(server, GOOGLE_DOCS_URL, { title: artifact.title }) as DocumentState;
    if (!created.documentId) throw new Error("Google didn't return a document ID. Check Google Docs before trying again.");
    binding = { id: googleId(created.documentId), revisionId: created.revisionId };
    // Remember the new document before writing: a retry must not create a second copy after a failed update.
    try { await saveGoogleDocument(connector.id, id, binding); }
    catch { throw new Error(`Google created ${googleDocumentUrl(binding.id)}, but Karui couldn't remember it on this device. Open that document before retrying.`); }
  }
  const url = `${GOOGLE_DOCS_URL}/${googleId(binding.id)}`;
  const state = await googleRequest(server, `${url}?includeTabsContent=true&fields=revisionId,body(content(endIndex)),tabs(documentTab(body(content(endIndex))),childTabs)`) as DocumentState;
  if (!state.revisionId) throw new Error("Google didn't return a revision ID. Nothing was replaced.");
  if (binding.revisionId && state.revisionId !== binding.revisionId) throw new Error("This Google Doc changed outside Karui. Nothing was replaced. Review the Google copy before continuing.");
  const endIndex = endOfDocument(state);
  if (updated && !binding.revisionId && endIndex > 2) throw new Error("Karui couldn't verify the last saved revision. Nothing was replaced. Review the Google copy.");
  await saveGoogleDocument(connector.id, id, { id: binding.id, revisionId: state.revisionId });
  let result: { writeControl?: { requiredRevisionId?: string } };
  try {
    result = await googleRequest(server, `${url}:batchUpdate`, { requests: googleDocRequests(content, endIndex), writeControl: { requiredRevisionId: state.revisionId } }) as typeof result;
  } catch (error) {
    if (error instanceof GoogleApiError && error.status === 400) throw new Error("Google couldn't apply this version. The document may have changed outside Karui; review its Google copy before retrying.");
    throw error;
  }
  const revisionId = result.writeControl?.requiredRevisionId;
  await saveGoogleDocument(connector.id, id, { id: binding.id, revisionId });
  if (!revisionId) throw new Error(`Saved to ${googleDocumentUrl(binding.id)}, but Google didn't confirm the revision. Further updates are blocked to protect outside edits.`);
  return { url: googleDocumentUrl(binding.id), updated };
}

export async function saveArtifactToGoogleDocs(id: string, artifact: Pick<Artifact, "title" | "type" | "content">): Promise<GoogleDocSave> {
  const userId = getUser()?.id;
  if (!userId) throw new Error("Sign in before saving to Google Docs.");
  if (!navigator.locks) return saveArtifact(id, artifact);
  return navigator.locks.request(`karui-google-doc:${userId}:${id}`, () => saveArtifact(id, artifact));
}

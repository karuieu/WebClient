import { parseArtifacts } from "@/lib/artifacts/artifacts";
import { chatFiles } from "@/lib/artifacts/chatFiles";
import { visibleMessages, type HistoryMessage } from "@/lib/messages/conversation";
import type { ArtifactReference } from "@/lib/messages/artifactReference";
import { listFileVersions, listProjectFiles, readFileVersion, readProjectFiles } from "@/lib/projects/projects";
import { byteSize, libraryBlock } from "@/lib/projects/projectFiles";

type ArtifactSource = HistoryMessage & { created_at: string };

export type ReferencedArtifact = {
  reference: ArtifactReference;
  current: { content: string; version: number; updatedAt: string } | null;
  versions: { version: number; read: () => Promise<string> }[];
  historyUnavailable?: boolean;
};

async function readLibraryArtifact(
  reference: ArtifactReference,
  projectId: string,
  listing: ReturnType<typeof listProjectFiles>,
): Promise<ReferencedArtifact | null> {
  const file = (await listing).files.find((file) => file.path === reference.path);
  if (!file) return null;
  const [contents, versions] = await Promise.all([
    readProjectFiles(projectId, [file]),
    file.version > 1 ? listFileVersions(projectId, file.id).catch(() => null) : [],
  ]);
  const content = contents.get(file.id);
  if (content === undefined) return null;
  return {
    reference,
    current: { content, version: file.version, updatedAt: file.updated_at },
    versions: (versions ?? []).filter(({ number }) => number < file.version).map(({ id, number }) => ({
      version: number,
      read: () => readFileVersion(projectId, file.id, id),
    })),
    historyUnavailable: versions === null,
  };
}

export function referencedArtifactContext(artifacts: ReferencedArtifact[]): {
  current: string;
  versions: { id: string; artifact: number; title: string; version: number }[];
  readVersions: (ids: string[], tokenCap: number) => Promise<string>;
} {
  const current = artifacts.map(({ reference, current, historyUnavailable }, index) => {
    const meta = JSON.stringify({
      artifact: index + 1,
      title: reference.title,
      type: reference.type,
      path: reference.path,
      ...(current ? { version: current.version, updatedAt: current.updatedAt, ...(historyUnavailable ? { historyUnavailable } : {}) } : { unavailable: true }),
    }).replace(/</g, "\\u003c");
    const content = current?.content.replace(/<\/(referenced_artifacts?)(?=[\s>])/gi, "</ $1");
    return `<referenced_artifact>\n${meta}\n${content ?? ""}\n</referenced_artifact>`;
  }).join("\n");
  const versions = artifacts.flatMap(({ reference, versions }, index) => versions.map(({ version, read }) => ({
    id: `${index + 1}:${version}`, artifact: index + 1, title: reference.title, version, read,
  })));
  const reads = new Map<string, Promise<string>>();
  const readVersions = async (ids: string[], tokenCap: number): Promise<string> => {
    if (tokenCap <= 0) return "";
    const files = await Promise.all(versions.filter(({ id }) => ids.includes(id)).map(async ({ id, artifact, version, read }) => {
      const cached = reads.get(id) ?? read().catch(() => "This version is unavailable.");
      reads.set(id, cached);
      const content = (await cached).replace(/<\/(referenced_artifacts?|artifact_versions|file)(?=[\s>])/gi, "</ $1");
      return { id, content, path: `Artifact ${artifact} (v${version})`, size: byteSize(content), preview: "" };
    }));
    return libraryBlock(files, new Map(files.map(({ id, content }) => [id, content])), tokenCap);
  };
  return { current, versions, readVersions };
}

export async function readReferencedArtifacts(
  references: ArtifactReference[],
  source: {
    messages: (chatId: string) => Promise<ArtifactSource[]>;
    projectId: (chatId: string) => Promise<string | null | undefined>;
  },
): Promise<ReferencedArtifact[]> {
  const chats = new Map([...new Set(references.map(({ chatId }) => chatId))].map((id) => [id, source.messages(id).then((rows) => {
    const messages = visibleMessages(rows, {}).filter((message) => !message.decryptionFailed);
    return { messages, files: chatFiles(messages) };
  })] as const));
  const projectIds = new Map<string, ReturnType<typeof source.projectId>>();
  const libraries = new Map<string, ReturnType<typeof listProjectFiles>>();

  return Promise.all(references.map(async (reference): Promise<ReferencedArtifact> => {
    const unavailable = { reference, current: null, versions: [] };
    const { chatId, path } = reference;
    try {
      const chat = await chats.get(chatId);
      const file = chat?.files.get(path);
      const latest = file?.versions.at(-1);
      if (!chat || !file || !latest) return unavailable;
      const message = chat.messages[latest.turn];
      const saved = parseArtifacts(message.content).artifacts[latest.block]?.saved;
      if (saved && saved !== "failed") {
        const project = projectIds.get(chatId) ?? source.projectId(chatId);
        projectIds.set(chatId, project);
        const projectId = await project;
        if (projectId) {
          const listing = libraries.get(projectId) ?? listProjectFiles(projectId);
          libraries.set(projectId, listing);
          return (await readLibraryArtifact(reference, projectId, listing)) ?? unavailable;
        }
      }
      return {
        reference: { ...reference, title: file.title, type: file.type },
        current: { content: latest.content, version: file.versions.length, updatedAt: message.created_at },
        versions: file.versions.slice(0, -1).map(({ content }, index) => ({
          version: index + 1,
          read: async () => content,
        })).reverse(),
      };
    } catch {
      return unavailable;
    }
  }));
}

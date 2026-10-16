import { type Message } from "@/lib/chat";
import { limitOf, statusOf } from "@/lib/errors";
import { isProviderVerified } from "@/lib/inference";
import { getModelProvider, PROVIDERS } from "@/lib/providers";
import type { EnclaveState } from "@/components/app/chat/ChatView";
import { parseMessageContent, type ChatImage, type ChatTextFile } from "@/lib/vision";
import { parseArtifacts, type Artifact } from "@/lib/artifacts";
import { modelLabel, parseMessageBlocks, splitQuote } from "@/lib/messageBlocks";
import { draftStatus, parseSkillDrafts, type Skill, type SkillDraft } from "@/lib/skills";
import { parseQuestions } from "@/lib/questions";
import type { AnswerActivity } from "@/lib/answerTools";
import type { ArtifactData, MessageData, SkillDraftData } from "@/components/app/chat/Messages";
import type { QuestionData } from "@/components/app/chat/Questions";


export function resetTime(iso?: string | Date | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

export function errorText(error: unknown, fallback: string): string {
  const msg = error instanceof Error ? error.message : fallback;
  const limit = limitOf(error);
  const at = resetTime(limit.resetAt);
  const reset = at ? ` It resets at ${at}.` : "";
  if (limit.code === "free_token_limit") return `You've used today's free allowance.${reset}`;
  if (limit.code === "pro_token_limit") return `You've reached the Pro limit for now.${reset}`;
  const status = statusOf(error);
  if (status === 400) return "That request didn't go through. Please try again.";
  if (status === 401 || msg.includes("unauthorized")) return "Your session has expired. Please sign in again.";
  return msg;
}

function artifactsOf(id: string, artifacts: Artifact[]): ArtifactData[] {
  return artifacts.map((a, i) => ({ id: `${id}:${i}`, title: a.title, streaming: a.streaming }));
}

export function toUser(m: Message): MessageData {
  const parsed = parseMessageContent(m.content);
  const { quote, text } = splitQuote(parsed.text);
  return {
    id: m.id,
    role: "user",
    text,
    quote,
    images: parsed.images.map((img: ChatImage) => ({ src: img.data, name: img.name })),
    files: parsed.files.map((f: ChatTextFile) => ({ name: f.name, meta: `${Math.max(1, Math.round(f.content.length / 1024))} KB` })),
    decryptionFailed: m.decryptionFailed,
  };
}

type AssistantData = Extract<MessageData, { role: "assistant" }>;

// What the chat knows about the user's saved skills, to label each drafted skill as new, an update or already saved.
type SkillContext = { saved: Skill[]; saving: string | null };
const NO_SKILLS: SkillContext = { saved: [], saving: null };

function skillsOf(id: string, drafts: SkillDraft[], skills: SkillContext): SkillDraftData[] {
  return drafts.map((d, i) => {
    const key = `${id}:skill:${i}`;
    return { ...d, id: key, name: d.name || "New skill", status: draftStatus(d, skills.saved).status, saving: skills.saving === key };
  });
}

export function toAssistant(
  id: string,
  content: string,
  extra: Partial<AssistantData>,
  skills: SkillContext = NO_SKILLS,
): { message: AssistantData; artifacts: Artifact[] } {
  const { artifacts, text } = parseArtifacts(content);
  const { steps, answer, preparation } = parseMessageBlocks(text);
  const { drafts, text: withoutDrafts } = parseSkillDrafts(answer);
  const { questions, text: shown } = parseQuestions(withoutDrafts);
  return {
    message: {
      id,
      role: "assistant" as const,
      text: shown,
      steps,
      preparation,
      artifacts: artifactsOf(id, artifacts),
      skills: skillsOf(id, drafts, skills),
      questions,
      ...extra,
    },
    artifacts,
  };
}

export type Streaming = { content: string; activity: AnswerActivity | null } | null;

function activityStatus(activity: AnswerActivity | null): string | null {
  if (!activity) return null;
  if (activity.kind === "search") return "Searching the web";
  try {
    return `Reading ${new URL(activity.url).hostname.replace(/^www\./, "")}`;
  } catch {
    return "Reading a page";
  }
}

type ShownMessage = Message & { variant?: { index: number; total: number } };

export function toViewData(
  messages: ShownMessage[],
  stream: Streaming,
  skills: SkillContext = NO_SKILLS,
): { data: MessageData[]; artifacts: Map<string, Artifact> } {
  const byId = new Map<string, Artifact>();
  const data: MessageData[] = messages.map((m) => {
    if (m.role === "user") return toUser(m);
    const { message, artifacts } = toAssistant(m.id, m.content, {
      model: modelLabel(m.model, m.provider),
      variant: m.variant,
      decryptionFailed: m.decryptionFailed,
    }, skills);
    artifacts.forEach((a, i) => byId.set(`${m.id}:${i}`, a));
    return message;
  });
  if (stream) {
    const { message, artifacts } = toAssistant("streaming", stream.content, {
      streaming: true,
      status: activityStatus(stream.activity),
    }, skills);
    artifacts.forEach((a, i) => byId.set(`streaming:${i}`, a));
    data.push(message);
  }
  return { data, artifacts: byId };
}

/** The questions Karui is waiting on: those of the latest message, once it has finished and unless the user skipped them. */
export function pendingQuestions(data: MessageData[], skipped: string | null): { id: string; questions: QuestionData[] } | null {
  const last = data[data.length - 1];
  if (last?.role !== "assistant" || last.streaming || last.error || !last.questions?.length || last.id === skipped) return null;
  return { id: last.id, questions: last.questions };
}

export function enclaveFor(model: string, streaming: boolean): EnclaveState | undefined {
  const provider = getModelProvider(model);
  if (!provider) return undefined;
  return {
    provider: PROVIDERS[provider].name,
    state: isProviderVerified(provider) ? "verified" : streaming ? "verifying" : "unverified",
  };
}

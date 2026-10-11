import { notFound } from "next/navigation";
import { ProjectChat } from "@/components/wired/ProjectPages";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectChatPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
  const { id, chatId } = await params;
  if (!UUID.test(chatId)) notFound();
  return <ProjectChat projectId={id} chatId={chatId} />;
}

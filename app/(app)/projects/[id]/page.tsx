import { notFound } from "next/navigation";
import { ProjectNewChat } from "@/components/wired/ProjectPages";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) notFound();
  return <ProjectNewChat projectId={id} />;
}

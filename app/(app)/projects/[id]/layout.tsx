import { notFound } from "next/navigation";
import { ProjectScreen } from "@/components/wired/ProjectScreen";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keep the workspace in a layout so its panel stays mounted across project-chat navigation. */
export default async function ProjectLayout({ params, children }: { params: Promise<{ id: string }>; children: React.ReactNode }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  return (
    <ProjectScreen key={id} projectId={id}>
      {children}
    </ProjectScreen>
  );
}

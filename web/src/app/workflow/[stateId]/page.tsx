import { WorkflowWorkspace } from "@/features/workflow/workflow-workspace";

export default async function StateWorkflowPage({ params }: { params: Promise<{ stateId: string }> }) {
  const { stateId } = await params;
  return <WorkflowWorkspace key={stateId} stateId={stateId} />;
}

import { HistoryWorkspace } from "@/features/history/history-workspace";
export default async function HistoryDetailPage({ params }: { params: Promise<{ stateId: string }> }) { const { stateId } = await params; return <HistoryWorkspace stateId={stateId} />; }

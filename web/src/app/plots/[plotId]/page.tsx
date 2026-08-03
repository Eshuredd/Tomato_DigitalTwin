import { PlotDetailWorkspace } from "@/features/plots/plot-detail-workspace";
export default async function PlotPage({ params }: { params: Promise<{ plotId: string }> }) { const { plotId } = await params; return <PlotDetailWorkspace plotId={plotId} />; }

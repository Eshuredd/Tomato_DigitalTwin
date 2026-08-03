import { FarmDetailWorkspace } from "@/features/farms/farm-detail-workspace";
export default async function FarmPage({ params }: { params: Promise<{ farmId: string }> }) { const { farmId } = await params; return <FarmDetailWorkspace farmId={farmId} />; }

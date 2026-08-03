import { Badge } from "@/components/ui/badge";

export function AuthorityLegend() {
  return (
    <section aria-labelledby="authority-heading" className="authority-legend">
      <div>
        <p id="authority-heading" className="text-sm font-semibold text-[var(--text-strong)]">Decision authority</p>
        <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Meaning is stated in text and shape, never color alone.</p>
      </div>
      <div className="flex flex-wrap gap-2" role="list" aria-label="CropTwin information sources">
        <Badge role="listitem" variant="agronomy"><span aria-hidden="true">◆</span> Deterministic agronomy · authoritative</Badge>
        <Badge role="listitem" variant="evidence"><span aria-hidden="true">◇</span> AI evidence · supporting</Badge>
      </div>
    </section>
  );
}

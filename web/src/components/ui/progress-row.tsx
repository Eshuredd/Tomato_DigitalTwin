export function ProgressRow({
  label,
  value,
  valueLabel,
}: {
  label: string;
  value: number;
  valueLabel: string;
}) {
  const width = Math.max(0, Math.min(100, value * 100));
  return (
    <div className="grid gap-1">
      <div className="flex min-w-0 justify-between gap-3 text-sm">
        <span className="break-words">{label}</span>
        <span className="shrink-0 font-medium">{valueLabel}</span>
      </div>
      <div
        aria-label={`${label}: ${valueLabel}`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={Math.round(width)}
        className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-raised)]"
        role="progressbar"
      >
        <div
          className="h-full bg-[var(--color-leaf)]"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

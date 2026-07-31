import type { JsonValue } from "@/lib/types/common";

export function TechnicalDetails({
  children,
  json,
  summary = "Technical details",
}: {
  children?: React.ReactNode;
  json?: JsonValue;
  summary?: string;
}) {
  return (
    <details className="mt-4 text-sm text-[var(--color-muted)]">
      <summary className="cursor-pointer font-medium text-[var(--color-text)]">
        {summary}
      </summary>
      <div className="mt-3 grid gap-3">
        {children}
        {json !== undefined ? (
          <pre className="max-h-72 overflow-auto rounded-md bg-[var(--color-code)] p-3 text-xs leading-5 text-[var(--color-text)]">
            {JSON.stringify(json, null, 2)}
          </pre>
        ) : null}
      </div>
    </details>
  );
}

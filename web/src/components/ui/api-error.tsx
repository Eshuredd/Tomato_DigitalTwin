import { CropTwinApiError } from "@/lib/api/errors";

export function ApiErrorView({ error }: { error: CropTwinApiError }) {
  return (
    <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm">
      <p className="font-semibold">{error.displayMessage()}</p>
      <p className="mt-1 text-[var(--color-muted)]">
        {error.status ? `HTTP ${error.status} · ` : ""}
        {error.code}
      </p>
      {Object.keys(error.details).length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium">Technical details</summary>
          <pre className="mt-2 overflow-auto rounded-md bg-[var(--color-code)] p-3 text-xs">
            {JSON.stringify(error.details, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

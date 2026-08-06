import * as React from "react";
import { cn } from "@/lib/utils";

const controlClass = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-strong)] outline-none transition focus:border-[var(--focus-ring)] focus:ring-2 focus:ring-[color:var(--focus-ring)/0.22] disabled:cursor-not-allowed disabled:opacity-55";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(controlClass, className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(controlClass, className)} {...props} />;
});

export function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: React.ReactNode }) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;
  return <div className="grid gap-1.5"><label htmlFor={htmlFor} className="text-sm font-semibold text-[var(--text-strong)]">{label}</label>{children}{hint ? <p id={hintId} className="text-xs leading-5 text-[var(--text-muted)]">{hint}</p> : null}{error ? <p id={errorId} role="alert" className="text-xs font-medium text-[var(--state-destructive-strong)]">{error}</p> : null}</div>;
}

export function describedBy(id: string, hasError: boolean, hasHint = false) {
  return [hasHint ? `${id}-hint` : "", hasError ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
}

import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  const variantClass =
    variant === "primary"
      ? "bg-[var(--color-tomato)] text-white hover:bg-[var(--color-tomato-strong)]"
      : "border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[var(--color-leaf)]";
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-60 ${variantClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

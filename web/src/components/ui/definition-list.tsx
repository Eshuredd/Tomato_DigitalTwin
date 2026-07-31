export function DefinitionList({
  className = "",
  items,
}: {
  className?: string;
  items: { term: string; description: string | number }[];
}) {
  return (
    <dl className={`grid gap-3 text-sm sm:grid-cols-2 ${className}`}>
      {items.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="font-medium text-[var(--color-muted)]">{item.term}</dt>
          <dd className="mt-1 break-words text-[var(--color-text)]">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}

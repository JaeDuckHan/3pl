export function CardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className={`mb-4 grid gap-4 ${count === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
      {Array.from({ length: count }).map((_, key) => (
        <div key={key} className="rounded-xl border bg-white p-5">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-8 w-28 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function FilterBarSkeleton() {
  return (
    <div className="mb-4 rounded-xl border bg-white p-4">
      <div className="grid gap-3 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-9 animate-pulse rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols }).map((_, index) => (
          <div key={`h-${index}`} className="h-4 animate-pulse rounded bg-slate-200" />
        ))}
      </div>
      <div className="space-y-2 border-t pt-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }).map((__, colIdx) => (
              <div key={`${index}-${colIdx}`} className="h-8 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SummaryCardsSkeleton() {
  return <CardsSkeleton count={3} />;
}

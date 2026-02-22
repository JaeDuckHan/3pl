import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white px-6 py-8 text-center">
      {icon && <div className="mb-2 flex justify-center text-slate-400">{icon}</div>}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {actions && <div className="mt-4 flex justify-center">{actions}</div>}
    </div>
  );
}

"use client";

import { Button } from "@/components/ui/button";

export default function InboundsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-white p-6">
      <p className="text-sm font-medium text-red-700">Failed to load inbound orders.</p>
      <p className="mt-1 text-xs text-slate-500">{error.message}</p>
      <Button className="mt-4" variant="secondary" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}

"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function InventoryError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Failed to load inventory." message={error.message} onRetry={reset} />;
}

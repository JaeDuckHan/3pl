"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function InboundDetailError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="Failed to load inbound detail." message={error.message} onRetry={reset} />;
}

"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function OutboundDetailError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return <ErrorState title="Failed to load outbound detail." message={error.message} onRetry={reset} />;
}

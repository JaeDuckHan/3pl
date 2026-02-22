"use client";

import { ErrorState } from "@/components/ui/ErrorState";

export default function InboundDetailError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="입고 상세를 불러오지 못했습니다." message={error.message} onRetry={reset} />;
}

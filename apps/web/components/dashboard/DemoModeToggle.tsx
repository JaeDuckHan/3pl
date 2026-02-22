"use client";

import { Button } from "@/components/ui/button";

export function DemoModeToggle({
  demoMode,
  onToggle,
}: {
  demoMode: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className={demoMode ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}
      onClick={onToggle}
    >
      Demo Mode: {demoMode ? "ON" : "OFF"}
    </Button>
  );
}

export function DemoModeBanner({ demoMode }: { demoMode: boolean }) {
  if (!demoMode) return null;
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      Demo Mode is ON presets + demo actions enabled.
    </div>
  );
}

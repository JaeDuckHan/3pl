"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function DemoModeToggle({
  demoMode,
  onToggle,
}: {
  demoMode: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  return (
    <Button
      type="button"
      variant="secondary"
      className={demoMode ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}
      onClick={onToggle}
    >
      {t("common.demoMode")}: {demoMode ? "ON" : "OFF"}
    </Button>
  );
}

export function DemoModeBanner({ demoMode }: { demoMode: boolean }) {
  const { t } = useI18n();
  if (!demoMode) return null;
  return (
    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
      {t("demo.banner")}
    </div>
  );
}

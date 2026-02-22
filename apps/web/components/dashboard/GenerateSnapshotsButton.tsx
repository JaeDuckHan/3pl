"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { generateSnapshotsForDate, generateStorageSnapshots } from "@/features/dashboard/api";
import { useDashboardToast } from "@/features/dashboard/toast";
import { useI18n } from "@/lib/i18n/I18nProvider";

function dateText(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function GenerateSnapshotsButton({
  warehouseId,
  clientId,
}: {
  warehouseId?: number;
  clientId?: number;
}) {
  const { t } = useI18n();
  const { toastError, toastSuccess } = useDashboardToast();
  const [pending, setPending] = useState(false);

  if (process.env.NODE_ENV === "production") return null;

  const run = async () => {
    setPending(true);
    try {
      for (let i = 0; i < 7; i += 1) {
        if (warehouseId == null && clientId == null) {
          const date = new Date();
          date.setDate(date.getDate() - i);
          await generateSnapshotsForDate(dateText(date));
        } else {
          const date = new Date();
          date.setDate(date.getDate() - i);
          await generateStorageSnapshots({
            date: dateText(date),
            warehouseId,
            clientId,
          });
        }
      }
      toastSuccess(t("demo.generateLast7days"));
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Failed to generate snapshots");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="secondary" onClick={() => void run()} disabled={pending}>
      {pending ? t("demo.generating") : t("demo.generateLast7days")}
    </Button>
  );
}

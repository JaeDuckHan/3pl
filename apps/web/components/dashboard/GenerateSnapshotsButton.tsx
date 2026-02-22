"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { generateSnapshotsForDate, generateStorageSnapshots } from "@/features/dashboard/api";
import { useDashboardToast } from "@/features/dashboard/toast";

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
      toastSuccess("Generated snapshots for last 7 days");
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Failed to generate snapshots");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="secondary" onClick={() => void run()} disabled={pending}>
      {pending ? "Generating..." : "Generate demo snapshots (last 7 days)"}
    </Button>
  );
}

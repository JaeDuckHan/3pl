"use client";

import { useToast } from "@/components/ui/toast";

export function useDashboardToast() {
  const { pushToast } = useToast();

  const toastSuccess = (message: string) => {
    pushToast({ title: message, variant: "success" });
  };

  const toastError = (message: string) => {
    pushToast({ title: message, variant: "error" });
  };

  const toastInfo = (message: string) => {
    pushToast({ title: message, variant: "info" });
  };

  return { toastSuccess, toastError, toastInfo };
}

"use client";

import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

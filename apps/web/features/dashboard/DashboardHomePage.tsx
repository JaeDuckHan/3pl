"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { GenerateSnapshotsButton } from "@/components/dashboard/GenerateSnapshotsButton";
import { DemoModeBanner, DemoModeToggle } from "@/components/dashboard/DemoModeToggle";
import { useDemoMode } from "@/features/dashboard/useDemoMode";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function DashboardHomePage() {
  const { t } = useI18n();
  const { demoMode, ready, toggleDemoMode } = useDemoMode();
  const items = [
    {
      href: "/dashboard/storage-trend",
      title: t("nav.trend"),
      description: t("dashboard.trendCardDesc"),
    },
    {
      href: "/dashboard/storage-billing",
      title: t("nav.billing"),
      description: t("dashboard.billingCardDesc"),
    },
    {
      href: "/dashboard/capacity",
      title: t("nav.capacity"),
      description: t("dashboard.capacityCardDesc"),
    },
  ];

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: t("nav.dashboard") }]}
        title={t("dashboard.title")}
        subtitle={t("dashboard.desc")}
        actions={
          <div className="flex items-center gap-2">
            {ready ? <DemoModeToggle demoMode={demoMode} onToggle={toggleDemoMode} /> : null}
            {demoMode ? <GenerateSnapshotsButton /> : null}
          </div>
        }
      />
      <DashboardTabs />
      {ready ? <DemoModeBanner demoMode={demoMode} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        {items.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
              <CardHeader>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

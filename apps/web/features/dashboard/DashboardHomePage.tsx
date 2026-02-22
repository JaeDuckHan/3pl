"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { GenerateSnapshotsButton } from "@/components/dashboard/GenerateSnapshotsButton";
import { DemoModeBanner, DemoModeToggle } from "@/components/dashboard/DemoModeToggle";
import { useDemoMode } from "@/features/dashboard/useDemoMode";

const items = [
  {
    href: "/dashboard/storage-trend",
    title: "Storage Trend",
    description: "Track CBM/Pallet/SKU totals by day, week, or month.",
  },
  {
    href: "/dashboard/storage-billing",
    title: "Storage Billing",
    description: "Preview monthly storage charges by warehouse and client.",
  },
  {
    href: "/dashboard/capacity",
    title: "Capacity",
    description: "Monitor warehouse usage status and risk alerts.",
  },
];

export function DashboardHomePage() {
  const { demoMode, ready, toggleDemoMode } = useDemoMode();

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Dashboard" }]}
        title="Dashboard"
        subtitle="Demo-ready storage dashboard modules."
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

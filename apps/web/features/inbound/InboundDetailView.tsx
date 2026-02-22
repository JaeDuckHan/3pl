"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { InboundAction, InboundOrder, InboundStatus } from "@/features/inbound/types";
import { ApiError } from "@/features/outbound/api";
import { transitionInboundStatus } from "@/features/inbound/api";
import { useToast } from "@/components/ui/toast";

const tabs = ["overview", "items", "timeline"] as const;
type TabValue = (typeof tabs)[number];

function normalizeTab(tab?: string): TabValue {
  if (tab && tabs.includes(tab as TabValue)) return tab as TabValue;
  return "overview";
}

function actionByStatus(status: InboundOrder["status"]): InboundAction | null {
  if (status === "draft") return "submit";
  if (status === "submitted") return "arrive";
  if (status === "arrived" || status === "qc_hold") return "receive";
  return null;
}

function actionLabel(action: InboundAction) {
  if (action === "submit") return "Submit";
  if (action === "arrive") return "Arrive";
  return "Receive";
}

function statusBadge(status: InboundStatus) {
  const map: Record<InboundStatus, { label: string; variant: "default" | "info" | "warning" | "success" }> = {
    draft: { label: "Draft", variant: "default" },
    submitted: { label: "Submitted", variant: "info" },
    arrived: { label: "Arrived", variant: "warning" },
    qc_hold: { label: "QC Hold", variant: "warning" },
    received: { label: "Received", variant: "success" },
    cancelled: { label: "Cancelled", variant: "default" },
  };
  const current = map[status];
  return <Badge variant={current.variant}>{current.label}</Badge>;
}

export function InboundDetailView({ order: initialOrder, initialTab }: { order: InboundOrder; initialTab?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const [order, setOrder] = useState(initialOrder);
  const [tab, setTab] = useState<TabValue>(normalizeTab(initialTab));
  const [loading, setLoading] = useState(false);
  const currentAction = actionByStatus(order.status);

  const setTabWithQuery = (nextTab: string) => {
    const normalized = normalizeTab(nextTab);
    setTab(normalized);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", normalized);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const runStatusAction = async () => {
    if (!currentAction) return;
    setLoading(true);
    try {
      const updated = await transitionInboundStatus(order.inbound_no, currentAction);
      setOrder(updated);
      pushToast({
        title: `${actionLabel(currentAction)} completed`,
        description: `Inbound status changed to ${updated.status}.`,
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Action failed";
      pushToast({ title: "Action failed", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const itemColumns = useMemo(
    () => [
      { key: "barcode_full", label: "barcode_full", render: (row: InboundOrder["items"][number]) => row.barcode_full },
      { key: "product_name", label: "product_name", render: (row: InboundOrder["items"][number]) => row.product_name },
      { key: "lot", label: "lot", render: (row: InboundOrder["items"][number]) => row.lot },
      { key: "location", label: "location", render: (row: InboundOrder["items"][number]) => row.location },
      { key: "qty", label: "qty", className: "tabular-nums", render: (row: InboundOrder["items"][number]) => row.qty },
      {
        key: "invoice_price",
        label: "invoice_price",
        className: "tabular-nums",
        render: (row: InboundOrder["items"][number]) => (row.invoice_price === null ? "-" : row.invoice_price),
      },
      { key: "currency", label: "currency", render: (row: InboundOrder["items"][number]) => row.currency ?? "-" },
    ],
    []
  );

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Operations" }, { label: "Inbounds", href: "/inbounds" }, { label: order.inbound_no }]}
        title={order.inbound_no}
        subtitle={`${order.client} | Date ${order.inbound_date}`}
        rightSlot={
          <div className="flex items-center gap-2">
            {statusBadge(order.status)}
            {currentAction && (
              <Button onClick={runStatusAction} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel(currentAction)}
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTabWithQuery}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>Client</CardTitle></CardHeader>
            <CardContent><p className="text-sm font-medium">{order.client}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Warehouse</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{order.warehouse}</p></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">{order.summary}</p>
              <p className="text-sm text-slate-500">{order.memo}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <DataTable rows={order.items} columns={itemColumns} emptyText="No inbound items." />
        </TabsContent>

        <TabsContent value="timeline">
          {order.timeline.length === 0 ? (
            <div className="rounded-xl border bg-white px-6 py-8 text-center text-sm text-slate-500">No timeline logs.</div>
          ) : (
            <div className="rounded-xl border bg-white px-6 py-2">
              {order.timeline.map((log, idx) => (
                <div key={log.id} className="relative flex gap-4 py-4">
                  <div className="flex w-5 flex-col items-center">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    {idx < order.timeline.length - 1 && <span className="mt-1 h-full w-px bg-slate-200" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{log.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {log.at} | {log.actor}
                    </p>
                    {log.note && <p className="mt-1 text-sm text-slate-600">{log.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

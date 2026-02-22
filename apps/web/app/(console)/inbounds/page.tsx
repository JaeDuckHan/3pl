import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import { AUTH_COOKIE_KEY } from "@/lib/auth";
import { getInboundOrders } from "@/features/inbound/api";
import type { InboundListStatus, InboundStatus } from "@/features/inbound/types";

const filterItems: Array<{ label: string; value: InboundListStatus }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Arrived", value: "arrived" },
  { label: "Received", value: "received" },
];

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

export default async function InboundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: InboundListStatus }>;
}) {
  const { q, status } = await searchParams;
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  const currentStatus = filterItems.some((item) => item.value === status) ? status : "all";
  const orders = await getInboundOrders({ q, status: currentStatus }, { token });

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Operations" }, { label: "Inbounds" }]}
        title="Inbounds"
        subtitle="Inbound order queue overview"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filterItems.map((item) => {
          const active = currentStatus === item.value;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (item.value !== "all") params.set("status", item.value);
          return (
            <Link key={item.value} href={`/inbounds?${params.toString()}`}>
              <Badge variant={active ? "info" : "default"}>{item.label}</Badge>
            </Link>
          );
        })}
      </div>

      <DataTable
        rows={orders}
        emptyText="No inbound orders found."
        columns={[
          {
            key: "inbound_no",
            label: "Inbound No",
            render: (row) => (
              <Link href={`/inbounds/${encodeURIComponent(row.inbound_no)}`} className="font-medium text-slate-900 hover:underline">
                {row.inbound_no}
              </Link>
            ),
          },
          { key: "client", label: "Client", render: (row) => row.client },
          { key: "inbound_date", label: "Date", render: (row) => <span className="tabular-nums">{row.inbound_date}</span> },
          { key: "summary", label: "Summary", render: (row) => row.summary },
          { key: "status", label: "Status", render: (row) => statusBadge(row.status) },
        ]}
      />
    </section>
  );
}

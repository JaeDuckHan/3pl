import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getOutboundOrders } from "@/features/outbound/api";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import type { OutboundListStatus } from "@/features/outbound/types";
import { AUTH_COOKIE_KEY } from "@/lib/auth";

const filterItems: Array<{ label: string; value: OutboundListStatus }> = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Allocated", value: "allocated" },
  { label: "Packing", value: "packing" },
  { label: "Shipped", value: "shipped" },
];

export default async function OutboundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: OutboundListStatus }>;
}) {
  const { q, status } = await searchParams;
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  const currentStatus = filterItems.some((item) => item.value === status) ? status : "all";
  const orders = await getOutboundOrders({ q, status: currentStatus }, { token });

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Operations" }, { label: "Outbounds" }]}
        title="Outbounds"
        subtitle="Outbound order queue overview"
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filterItems.map((item) => {
          const active = currentStatus === item.value;
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (item.value !== "all") params.set("status", item.value);

          return (
            <Link key={item.value} href={`/outbounds?${params.toString()}`}>
              <Badge variant={active ? "info" : "default"}>{item.label}</Badge>
            </Link>
          );
        })}
      </div>

      <DataTable
        rows={orders}
        emptyText="No outbound orders found."
        columns={[
          {
            key: "outbound_no",
            label: "Outbound No",
            render: (row) => (
              <Link href={`/outbounds/${encodeURIComponent(row.outbound_no)}`} className="font-medium text-slate-900 hover:underline">
                {row.outbound_no}
              </Link>
            ),
          },
          { key: "client", label: "Client", render: (row) => row.client },
          { key: "eta_date", label: "ETA", render: (row) => <span className="tabular-nums">{row.eta_date}</span> },
          { key: "summary", label: "Summary", render: (row) => row.summary },
          { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </section>
  );
}

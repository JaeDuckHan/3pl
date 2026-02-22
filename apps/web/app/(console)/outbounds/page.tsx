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
  { label: "전체", value: "all" },
  { label: "작성", value: "draft" },
  { label: "할당", value: "allocated" },
  { label: "피킹/포장", value: "packing" },
  { label: "출고완료", value: "shipped" },
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
        breadcrumbs={[{ label: "운영" }, { label: "출고" }]}
        title="출고"
        subtitle="출고 오더 현황"
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
        emptyText="출고 오더가 없습니다."
        columns={[
          {
            key: "outbound_no",
            label: "출고번호",
            render: (row) => (
              <Link href={`/outbounds/${encodeURIComponent(row.outbound_no)}`} className="font-medium text-slate-900 hover:underline">
                {row.outbound_no}
              </Link>
            ),
          },
          { key: "client", label: "고객사", render: (row) => row.client },
          { key: "eta_date", label: "출고예정일", render: (row) => <span className="tabular-nums">{row.eta_date}</span> },
          { key: "summary", label: "요약", render: (row) => row.summary },
          { key: "status", label: "상태", render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
    </section>
  );
}

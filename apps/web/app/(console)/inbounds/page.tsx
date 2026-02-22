import Link from "next/link";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import { AUTH_COOKIE_KEY } from "@/lib/auth";
import { getInboundOrders } from "@/features/inbound/api";
import type { InboundListStatus, InboundStatus } from "@/features/inbound/types";

const filterItems: Array<{ label: string; value: InboundListStatus }> = [
  { label: "전체", value: "all" },
  { label: "작성", value: "draft" },
  { label: "제출", value: "submitted" },
  { label: "도착", value: "arrived" },
  { label: "입고완료", value: "received" },
];

function statusBadge(status: InboundStatus) {
  const map: Record<InboundStatus, { label: string; variant: "default" | "info" | "warning" | "success" }> = {
    draft: { label: "작성", variant: "default" },
    submitted: { label: "제출", variant: "info" },
    arrived: { label: "도착", variant: "warning" },
    qc_hold: { label: "QC 보류", variant: "warning" },
    received: { label: "입고완료", variant: "success" },
    cancelled: { label: "취소", variant: "default" },
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
        breadcrumbs={[{ label: "운영" }, { label: "입고" }]}
        title="입고"
        subtitle="입고 오더 현황"
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
        emptyText="입고 오더가 없습니다."
        columns={[
          {
            key: "inbound_no",
            label: "입고번호",
            render: (row) => (
              <Link href={`/inbounds/${encodeURIComponent(row.inbound_no)}`} className="font-medium text-slate-900 hover:underline">
                {row.inbound_no}
              </Link>
            ),
          },
          { key: "client", label: "고객사", render: (row) => row.client },
          { key: "inbound_date", label: "일자", render: (row) => <span className="tabular-nums">{row.inbound_date}</span> },
          { key: "summary", label: "요약", render: (row) => row.summary },
          { key: "status", label: "상태", render: (row) => statusBadge(row.status) },
        ]}
      />
    </section>
  );
}

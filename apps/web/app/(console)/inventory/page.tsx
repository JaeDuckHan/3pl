import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/ErrorState";
import { AUTH_COOKIE_KEY } from "@/lib/auth";
import { getStockBalances, getStockTransactions } from "@/features/inventory/api";
import type { InventoryTab } from "@/features/inventory/types";
import { ApiError } from "@/features/outbound/api";

const tabs: Array<{ label: string; value: InventoryTab }> = [
  { label: "재고", value: "balances" },
  { label: "거래이력", value: "transactions" },
];

const txnTypeFilter = [
  { label: "전체 유형", value: "" },
  { label: "입고 확정", value: "inbound_receive" },
  { label: "출고 확정", value: "outbound_ship" },
  { label: "반품 입고", value: "return_receive" },
];

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: InventoryTab; txn_type?: string }>;
}) {
  const { q, tab, txn_type } = await searchParams;
  const currentTab = tabs.some((item) => item.value === tab) ? tab : "balances";
  const token = (await cookies()).get(AUTH_COOKIE_KEY)?.value;
  if (!token) redirect("/login?next=/inventory");

  let balances = [] as Awaited<ReturnType<typeof getStockBalances>>;
  let transactions = [] as Awaited<ReturnType<typeof getStockTransactions>>;
  let loadError: string | null = null;

  try {
    if (currentTab === "balances") {
      balances = await getStockBalances({ q }, { token });
    } else {
      transactions = await getStockTransactions({ q, txn_type }, { token });
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect("/login?next=/inventory");
    }
    loadError = error instanceof Error ? error.message : "재고 조회 중 오류가 발생했습니다.";
  }

  const table = loadError ? (
    <ErrorState title="재고 데이터를 불러오지 못했습니다." message={loadError} />
  ) :
    currentTab === "balances" ? (
      <DataTable
        rows={balances}
        emptyText="재고 데이터가 없습니다."
        columns={[
          { key: "client", label: "고객사", render: (row) => row.client },
          { key: "product", label: "상품", render: (row) => row.product },
          { key: "lot", label: "LOT", render: (row) => row.lot },
          { key: "warehouse", label: "창고", render: (row) => row.warehouse },
          { key: "location", label: "로케이션", render: (row) => row.location },
          { key: "available_qty", label: "가용수량", className: "tabular-nums", render: (row) => row.available_qty },
          { key: "reserved_qty", label: "예약수량", className: "tabular-nums", render: (row) => row.reserved_qty },
        ]}
      />
    ) : (
      <DataTable
        rows={transactions}
        emptyText="재고 거래이력이 없습니다."
        columns={[
          { key: "txn_date", label: "거래일시", className: "tabular-nums", render: (row) => row.txn_date },
          { key: "txn_type", label: "유형", render: (row) => row.txn_type },
          { key: "client", label: "고객사", render: (row) => row.client },
          { key: "product", label: "상품", render: (row) => row.product },
          { key: "lot", label: "LOT", render: (row) => row.lot },
          { key: "qty_in", label: "입고수량", className: "tabular-nums", render: (row) => row.qty_in },
          { key: "qty_out", label: "출고수량", className: "tabular-nums", render: (row) => row.qty_out },
          { key: "ref", label: "참조", render: (row) => row.ref },
        ]}
      />
    );

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "운영" }, { label: "재고" }]}
        title="재고"
        subtitle="실시간 재고 및 거래 이력"
      />

      <div className="mb-5 rounded-xl border bg-white px-4 py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">보기</p>
        <div className="flex flex-wrap items-center gap-2">
          {tabs.map((item) => {
            const params = new URLSearchParams();
            params.set("tab", item.value);
            if (q) params.set("q", q);
            if (txn_type) params.set("txn_type", txn_type);
            const active = currentTab === item.value;
            return (
              <Link key={item.value} href={`/inventory?${params.toString()}`}>
                <Badge variant={active ? "info" : "default"}>{item.label}</Badge>
              </Link>
            );
          })}
        </div>

        {currentTab === "transactions" && (
          <>
            <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">거래 유형</p>
            <div className="flex flex-wrap items-center gap-2">
              {txnTypeFilter.map((item) => {
                const params = new URLSearchParams();
                params.set("tab", "transactions");
                if (q) params.set("q", q);
                if (item.value) params.set("txn_type", item.value);
                const active = (txn_type ?? "") === item.value;
                return (
                  <Link key={item.label} href={`/inventory?${params.toString()}`}>
                    <Badge variant={active ? "info" : "default"}>{item.label}</Badge>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      {table}
    </section>
  );
}

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
  { label: "Balances", value: "balances" },
  { label: "Transactions", value: "transactions" },
];

const txnTypeFilter = [
  { label: "All Types", value: "" },
  { label: "Inbound Receive", value: "inbound_receive" },
  { label: "Outbound Ship", value: "outbound_ship" },
  { label: "Return Receive", value: "return_receive" },
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
    loadError = error instanceof Error ? error.message : "Unexpected inventory error";
  }

  const table = loadError ? (
    <ErrorState title="Failed to load inventory data." message={loadError} />
  ) :
    currentTab === "balances" ? (
      <DataTable
        rows={balances}
        emptyText="No stock balances found."
        columns={[
          { key: "client", label: "Client", render: (row) => row.client },
          { key: "product", label: "Product", render: (row) => row.product },
          { key: "lot", label: "Lot", render: (row) => row.lot },
          { key: "warehouse", label: "Warehouse", render: (row) => row.warehouse },
          { key: "location", label: "Location", render: (row) => row.location },
          { key: "available_qty", label: "Available Qty", className: "tabular-nums", render: (row) => row.available_qty },
          { key: "reserved_qty", label: "Reserved Qty", className: "tabular-nums", render: (row) => row.reserved_qty },
        ]}
      />
    ) : (
      <DataTable
        rows={transactions}
        emptyText="No stock transactions found."
        columns={[
          { key: "txn_date", label: "Txn Date", className: "tabular-nums", render: (row) => row.txn_date },
          { key: "txn_type", label: "Type", render: (row) => row.txn_type },
          { key: "client", label: "Client", render: (row) => row.client },
          { key: "product", label: "Product", render: (row) => row.product },
          { key: "lot", label: "Lot", render: (row) => row.lot },
          { key: "qty_in", label: "Qty In", className: "tabular-nums", render: (row) => row.qty_in },
          { key: "qty_out", label: "Qty Out", className: "tabular-nums", render: (row) => row.qty_out },
          { key: "ref", label: "Ref", render: (row) => row.ref },
        ]}
      />
    );

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Operations" }, { label: "Inventory" }]}
        title="Inventory"
        subtitle="Live stock balances and movement history"
      />

      <div className="mb-5 rounded-xl border bg-white px-4 py-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">View</p>
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
            <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">Transaction Type</p>
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

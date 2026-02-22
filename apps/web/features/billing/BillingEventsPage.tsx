"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { getMe } from "@/features/auth/api";
import { BillingTabs } from "@/components/billing/BillingTabs";
import {
  billingEventsCsvUrl,
  listBillingEvents,
  markBillingEventsPending,
  type BillingEvent,
} from "@/features/billing/api";

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function BillingEventsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [month, setMonth] = useState(thisMonth());
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [serviceCode, setServiceCode] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    getMe().then((me) => setIsAdmin(me.role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBillingEvents({
        invoice_month: month || undefined,
        client_id: clientId ? Number(clientId) : undefined,
        status: (status as "PENDING" | "INVOICED") || undefined,
        service_code: serviceCode || undefined,
      });
      setRows(data);
      setSelectedIds([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load billing events.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const csvHref = useMemo(
    () =>
      billingEventsCsvUrl({
        invoice_month: month || undefined,
        client_id: clientId ? Number(clientId) : undefined,
        status: (status as "PENDING" | "INVOICED") || undefined,
        service_code: serviceCode || undefined,
      }),
    [month, clientId, status, serviceCode]
  );

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  const onBulkMarkPending = async () => {
    if (!selectedIds.length) {
      pushToast({ title: "Select at least one event.", variant: "info" });
      return;
    }
    try {
      const result = await markBillingEventsPending(selectedIds);
      pushToast({ title: `Updated ${result.updated} events`, variant: "success" });
      await reload();
    } catch (e) {
      pushToast({ title: "Bulk update failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Billing" }, { label: "Billing Events" }]}
        title="Billing Events"
        subtitle="Review pending/invoiced billing events before monthly KRW invoice generation."
      />
      <BillingTabs />

      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <Input placeholder="Client ID" value={clientId} onChange={(e) => setClientId(e.target.value)} />
          <select className="h-9 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="PENDING">PENDING</option>
            <option value="INVOICED">INVOICED</option>
          </select>
          <Input placeholder="Service code" value={serviceCode} onChange={(e) => setServiceCode(e.target.value.toUpperCase())} />
          <Button variant="secondary" onClick={() => void reload()}>Filter</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={csvHref} className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-slate-50">Export CSV</a>
          {isAdmin && (
            <Button variant="secondary" onClick={() => void onBulkMarkPending()}>
              Mark as Pending (Admin)
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        {error ? (
          <ErrorState title="Failed to load billing events" message={error} onRetry={() => void reload()} />
        ) : (
          <DataTable
            rows={rows}
            emptyText={loading ? "Loading..." : "No billing events"}
            columns={[
              {
                key: "select",
                label: "",
                render: (row) =>
                  isAdmin ? (
                    <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                  ) : (
                    ""
                  ),
              },
              { key: "event_date", label: "Event Date", render: (row) => row.event_date.slice(0, 10) },
              { key: "client", label: "Client", render: (row) => `${row.client_code} (${row.client_id})` },
              { key: "service_code", label: "Service", render: (row) => row.service_code },
              { key: "qty", label: "Qty", render: (row) => Number(row.qty).toLocaleString() },
              { key: "amount_thb", label: "Amount THB", render: (row) => (row.amount_thb == null ? "-" : Number(row.amount_thb).toLocaleString()) },
              { key: "fx_rate_thbkrw", label: "FX", render: (row) => (row.fx_rate_thbkrw == null ? "-" : Number(row.fx_rate_thbkrw).toFixed(4)) },
              { key: "amount_krw", label: "Amount KRW", render: (row) => (row.amount_krw == null ? "-" : Number(row.amount_krw).toLocaleString()) },
              { key: "reference_type", label: "Ref Type", render: (row) => row.reference_type },
              { key: "reference_id", label: "Ref ID", render: (row) => row.reference_id || "-" },
              { key: "status", label: "Status", render: (row) => row.status },
            ]}
          />
        )}
      </div>
    </section>
  );
}

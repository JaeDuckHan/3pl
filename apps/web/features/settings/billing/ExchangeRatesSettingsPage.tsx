"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/DataTable";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/ErrorState";
import {
  createExchangeRate,
  deleteExchangeRate,
  listExchangeRates,
  type ExchangeRate,
  updateExchangeRate,
} from "@/features/billing/api";

const blank: Omit<ExchangeRate, "id" | "base_currency" | "quote_currency"> = {
  rate_date: new Date().toISOString().slice(0, 10),
  rate: 39,
  source: "manual",
  locked: 0,
  status: "active",
};

export function ExchangeRatesSettingsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(blank);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listExchangeRates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load exchange rates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const startCreate = () => {
    setEditingId(null);
    setForm(blank);
  };

  const startEdit = (row: ExchangeRate) => {
    setEditingId(row.id);
    setForm({
      rate_date: row.rate_date.slice(0, 10),
      rate: Number(row.rate),
      source: row.source,
      locked: Number(row.locked),
      status: row.status,
    });
  };

  const save = async () => {
    try {
      if (editingId) {
        await updateExchangeRate(editingId, form);
      } else {
        await createExchangeRate(form);
      }
      pushToast({ title: "Saved", variant: "success" });
      await reload();
      startCreate();
    } catch (e) {
      pushToast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteExchangeRate(id);
      pushToast({ title: "Deleted", variant: "info" });
      await reload();
      if (editingId === id) startCreate();
    } catch (e) {
      pushToast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Exchange Rates" }]}
        title="Exchange Rates"
        subtitle="Manage THB->KRW rates used as invoice-level snapshots."
      />
      <SettingsTabs />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-white p-6">
          {error ? (
            <ErrorState title="Failed to load exchange rates" message={error} onRetry={() => void reload()} />
          ) : (
            <DataTable
              rows={rows}
              emptyText={loading ? "Loading..." : "No exchange rates"}
              columns={[
                { key: "rate_date", label: "Rate Date", render: (row) => row.rate_date?.slice(0, 10) },
                { key: "pair", label: "Pair", render: () => "THB/KRW" },
                { key: "rate", label: "Rate", render: (row) => Number(row.rate).toFixed(4) },
                { key: "source", label: "Source", render: (row) => row.source },
                { key: "locked", label: "Locked", render: (row) => (Number(row.locked) ? "Y" : "N") },
                { key: "used", label: "Used By Invoices", render: (row) => Number(row.used_invoice_count || 0) },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(row)} disabled={Number(row.locked) === 1 || Number(row.used_invoice_count || 0) > 0}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(row.id)} disabled={Number(row.locked) === 1 || Number(row.used_invoice_count || 0) > 0}>Delete</Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId ? "Edit rate" : "New rate"}</h3>
            {editingId && <Button size="sm" variant="ghost" onClick={startCreate}>Reset</Button>}
          </div>
          <Input type="date" value={form.rate_date} onChange={(e) => setForm((p) => ({ ...p, rate_date: e.target.value }))} />
          <Input type="number" step="0.0001" value={form.rate} onChange={(e) => setForm((p) => ({ ...p, rate: Number(e.target.value || 0) }))} />
          <select className="h-9 rounded-md border px-3 text-sm" value={form.source} onChange={(e) => setForm((p) => ({ ...p, source: e.target.value as ExchangeRate["source"] }))}>
            <option value="manual">manual</option>
            <option value="api">api</option>
          </select>
          <select className="h-9 rounded-md border px-3 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ExchangeRate["status"] }))}>
            <option value="active">active</option>
            <option value="draft">draft</option>
            <option value="superseded">superseded</option>
          </select>
          <select className="h-9 rounded-md border px-3 text-sm" value={form.locked} onChange={(e) => setForm((p) => ({ ...p, locked: Number(e.target.value) }))}>
            <option value={0}>Unlocked</option>
            <option value={1}>Locked</option>
          </select>
          <Button onClick={() => void save()}>Save</Button>
        </div>
      </div>
    </section>
  );
}

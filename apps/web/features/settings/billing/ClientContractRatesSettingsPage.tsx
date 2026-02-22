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
  createClientContractRate,
  deleteClientContractRate,
  listClientContractRates,
  type ClientContractRate,
  updateClientContractRate,
} from "@/features/billing/api";

const blank: Omit<ClientContractRate, "id"> = {
  client_id: 1,
  service_code: "",
  custom_rate: 0,
  currency: "KRW",
  effective_date: new Date().toISOString().slice(0, 10),
};

export function ClientContractRatesSettingsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<ClientContractRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<ClientContractRate, "id">>(blank);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listClientContractRates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load contract rates.");
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

  const startEdit = (row: ClientContractRate) => {
    setEditingId(row.id);
    setForm({ ...row });
  };

  const save = async () => {
    if (!form.service_code.trim()) {
      pushToast({ title: "Service code is required.", variant: "error" });
      return;
    }

    try {
      if (editingId) {
        await updateClientContractRate(editingId, form);
      } else {
        await createClientContractRate(form);
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
      await deleteClientContractRate(id);
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
        breadcrumbs={[{ label: "Settings" }, { label: "Client Contract Rates" }]}
        title="Client Contract Rates"
        subtitle="Manage client-specific overrides by service and effective date."
      />
      <SettingsTabs />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-white p-6">
          {error ? (
            <ErrorState title="Failed to load contract rates" message={error} onRetry={() => void reload()} />
          ) : (
            <DataTable
              rows={rows}
              emptyText={loading ? "Loading..." : "No contract rates"}
              columns={[
                { key: "client_id", label: "Client ID", render: (row) => row.client_id },
                { key: "service_code", label: "Service", render: (row) => <span className="font-medium">{row.service_code}</span> },
                { key: "custom_rate", label: "Rate", render: (row) => `${row.currency} ${Number(row.custom_rate).toLocaleString()}` },
                { key: "effective_date", label: "Effective", render: (row) => row.effective_date?.slice(0, 10) },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(row)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(row.id)}>Delete</Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editingId ? "Edit contract rate" : "New contract rate"}</h3>
            {editingId && <Button size="sm" variant="ghost" onClick={startCreate}>Reset</Button>}
          </div>
          <Input type="number" placeholder="Client ID" value={form.client_id} onChange={(e) => setForm((p) => ({ ...p, client_id: Number(e.target.value || 0) }))} />
          <Input placeholder="Service code" value={form.service_code} onChange={(e) => setForm((p) => ({ ...p, service_code: e.target.value.toUpperCase() }))} />
          <Input type="number" placeholder="Custom rate" value={form.custom_rate} onChange={(e) => setForm((p) => ({ ...p, custom_rate: Number(e.target.value || 0) }))} />
          <select className="h-9 rounded-md border px-3 text-sm" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value as ClientContractRate["currency"] }))}>
            <option value="KRW">KRW</option>
            <option value="THB">THB</option>
          </select>
          <Input type="date" value={form.effective_date} onChange={(e) => setForm((p) => ({ ...p, effective_date: e.target.value }))} />
          <Button onClick={() => void save()}>Save</Button>
        </div>
      </div>
    </section>
  );
}

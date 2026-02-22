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
  createServiceRate,
  deleteServiceRate,
  listServiceRates,
  type ServiceRate,
  updateServiceRate,
} from "@/features/billing/api";

const blank: Omit<ServiceRate, "id"> = {
  service_code: "",
  service_name: "",
  billing_unit: "EVENT",
  pricing_policy: "KRW_FIXED",
  default_currency: "KRW",
  default_rate: 0,
  status: "active",
};

export function ServiceRatesSettingsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<ServiceRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ServiceRate, "id">>(blank);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listServiceRates());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load service rates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const startCreate = () => {
    setEditing(null);
    setForm(blank);
  };

  const startEdit = (row: ServiceRate) => {
    setEditing(row.service_code);
    setForm({ ...row });
  };

  const save = async () => {
    if (!form.service_code.trim() || !form.service_name.trim()) {
      pushToast({ title: "Service code and name are required.", variant: "error" });
      return;
    }
    try {
      if (editing) {
        await updateServiceRate(editing, form);
      } else {
        await createServiceRate(form);
      }
      pushToast({ title: "Saved", variant: "success" });
      await reload();
      startCreate();
    } catch (e) {
      pushToast({ title: "Save failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const remove = async (serviceCode: string) => {
    try {
      await deleteServiceRate(serviceCode);
      pushToast({ title: "Deleted", variant: "info" });
      await reload();
      if (editing === serviceCode) startCreate();
    } catch (e) {
      pushToast({ title: "Delete failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Service Rates" }]}
        title="Service Rates"
        subtitle="Define billable services and default KRW/THB pricing policies."
      />
      <SettingsTabs />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="rounded-xl border bg-white p-6">
          {error ? (
            <ErrorState title="Failed to load service rates" message={error} onRetry={() => void reload()} />
          ) : (
            <DataTable
              rows={rows}
              emptyText={loading ? "Loading..." : "No service rates"}
              columns={[
                { key: "service_code", label: "Service Code", render: (row) => <span className="font-medium">{row.service_code}</span> },
                { key: "service_name", label: "Service Name", render: (row) => row.service_name },
                { key: "pricing_policy", label: "Policy", render: (row) => row.pricing_policy },
                { key: "default_rate", label: "Default Rate", render: (row) => `${row.default_currency} ${Number(row.default_rate).toLocaleString()}` },
                {
                  key: "actions",
                  label: "Actions",
                  render: (row) => (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(row)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(row.service_code)}>Delete</Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>

        <div className="rounded-xl border bg-white p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{editing ? "Edit service" : "New service"}</h3>
            {editing && (
              <Button size="sm" variant="ghost" onClick={startCreate}>Reset</Button>
            )}
          </div>
          <Input placeholder="Service code" value={form.service_code} onChange={(e) => setForm((p) => ({ ...p, service_code: e.target.value.toUpperCase() }))} />
          <Input placeholder="Service name" value={form.service_name} onChange={(e) => setForm((p) => ({ ...p, service_name: e.target.value }))} />
          <select className="h-9 rounded-md border px-3 text-sm" value={form.billing_unit} onChange={(e) => setForm((p) => ({ ...p, billing_unit: e.target.value as ServiceRate["billing_unit"] }))}>
            <option value="ORDER">ORDER</option><option value="SKU">SKU</option><option value="BOX">BOX</option><option value="CBM">CBM</option><option value="PALLET">PALLET</option><option value="EVENT">EVENT</option><option value="MONTH">MONTH</option>
          </select>
          <select className="h-9 rounded-md border px-3 text-sm" value={form.pricing_policy} onChange={(e) => setForm((p) => ({ ...p, pricing_policy: e.target.value as ServiceRate["pricing_policy"] }))}>
            <option value="KRW_FIXED">KRW_FIXED</option>
            <option value="THB_BASED">THB_BASED</option>
          </select>
          <select className="h-9 rounded-md border px-3 text-sm" value={form.default_currency} onChange={(e) => setForm((p) => ({ ...p, default_currency: e.target.value as ServiceRate["default_currency"] }))}>
            <option value="KRW">KRW</option>
            <option value="THB">THB</option>
          </select>
          <Input type="number" placeholder="Default rate" value={form.default_rate} onChange={(e) => setForm((p) => ({ ...p, default_rate: Number(e.target.value || 0) }))} />
          <select className="h-9 rounded-md border px-3 text-sm" value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ServiceRate["status"] }))}>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <Button onClick={() => void save()}>Save</Button>
        </div>
      </div>
    </section>
  );
}

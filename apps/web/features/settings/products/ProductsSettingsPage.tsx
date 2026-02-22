"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/DataTable";
import { ActiveStatusBadge } from "@/components/ui/ActiveStatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/ErrorState";
import { listClients } from "@/features/settings/clients/api";
import { buildBarcodeFull, createProduct, listProducts, toggleProductStatus, updateProduct } from "@/features/settings/products/api";
import type { Product, ProductStatus } from "@/features/settings/products/types";

type FormState = {
  client_code: string;
  barcode_raw: string;
  name: string;
  status: ProductStatus;
};

type StatusFilter = "all" | ProductStatus;
type SortKey = "created_desc" | "created_asc" | "client_asc" | "name_asc";

const initialForm: FormState = {
  client_code: "",
  barcode_raw: "",
  name: "",
  status: "active",
};

export function ProductsSettingsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<Product[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [clientCodes, setClientCodes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadRows = async () => {
    setLoadingRows(true);
    setLoadError(null);
    try {
      const [products, clients] = await Promise.all([listProducts(), listClients()]);
      setRows(products);
      setClientCodes(clients.map((item) => item.client_code));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load products.");
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const barcodePreview = useMemo(
    () => buildBarcodeFull(form.client_code, form.barcode_raw),
    [form.client_code, form.barcode_raw]
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const searched = rows.filter(
      (item) =>
        (statusFilter === "all" || item.status === statusFilter) &&
        (
        item.client_code.toLowerCase().includes(q) ||
        item.barcode_raw.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
        )
    );
    const sorted = [...searched];
    sorted.sort((a, b) => {
      if (sortKey === "created_desc") return b.created_at.localeCompare(a.created_at);
      if (sortKey === "created_asc") return a.created_at.localeCompare(b.created_at);
      if (sortKey === "client_asc") return a.client_code.localeCompare(b.client_code);
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [rows, search, statusFilter, sortKey]);

  const openCreate = () => {
    setEditingId(null);
    setForm(initialForm);
    setFieldError(null);
    setOpen(true);
  };

  const openEdit = (row: Product) => {
    setEditingId(row.id);
    setForm({
      client_code: row.client_code,
      barcode_raw: row.barcode_raw,
      name: row.name,
      status: row.status,
    });
    setFieldError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.client_code.trim() || !form.barcode_raw.trim() || !form.name.trim()) {
      setFieldError("Client code, barcode raw and name are required.");
      pushToast({
        title: "Missing required fields",
        description: "Client code, barcode raw and name are required.",
        variant: "error",
      });
      return;
    }

    setFieldError(null);
    setSaving(true);
    try {
      if (editingId) {
        await updateProduct(editingId, form);
        pushToast({ title: "Product updated", variant: "success" });
      } else {
        await createProduct(form);
        pushToast({ title: "Product created", variant: "success" });
      }
      await loadRows();
      setOpen(false);
    } catch (error) {
      setFieldError(error instanceof Error ? error.message : "Please try again.");
      pushToast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (row: Product) => {
    setTogglingId(row.id);
    try {
      await toggleProductStatus(row.id);
      await loadRows();
      pushToast({
        title: row.status === "active" ? "Product archived" : "Product reactivated",
        variant: "info",
      });
    } catch (error) {
      pushToast({
        title: "Action failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "error",
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Settings" }, { label: "Products" }]}
        title="Products"
        subtitle="Maintain product catalog by client and barcode rules."
        rightSlot={<Button onClick={openCreate}>New</Button>}
      />
      <SettingsTabs />

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Search by product name, barcode, or client code"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="h-9 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            className="h-9 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="created_desc">Newest</option>
            <option value="created_asc">Oldest</option>
            <option value="client_asc">Client Code</option>
            <option value="name_asc">Name</option>
          </select>
        </div>

        {loadError ? (
          <ErrorState title="Failed to load products." message={loadError} onRetry={() => void loadRows()} />
        ) : (
          <DataTable
            rows={filteredRows}
            emptyText={loadingRows ? "Loading products..." : "No products found."}
            rowClassName="cursor-pointer hover:bg-slate-50"
            columns={[
            { key: "client_code", label: "Client Code", render: (row) => <span className="font-medium">{row.client_code}</span> },
            { key: "barcode_raw", label: "Barcode Raw", render: (row) => row.barcode_raw },
            { key: "barcode_full", label: "Barcode Full", render: (row) => row.barcode_full },
            { key: "name", label: "Name", render: (row) => row.name },
            { key: "status", label: "Status", render: (row) => <ActiveStatusBadge status={row.status} /> },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(row)} disabled={togglingId === row.id}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleStatus(row)} disabled={togglingId === row.id}>
                    {row.status === "active" ? "Archive" : "Activate"}
                  </Button>
                </div>
              ),
            },
          ]}
          />
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription>Unique key: client_code + barcode_raw.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Client Code</label>
              <Input
                list="client-code-options"
                value={form.client_code}
                onChange={(e) => setForm((prev) => ({ ...prev, client_code: e.target.value.toUpperCase() }))}
              />
              <datalist id="client-code-options">
                {clientCodes.map((code) => (
                  <option key={code} value={code} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Barcode Raw</label>
              <Input
                value={form.barcode_raw}
                onChange={(e) => setForm((prev) => ({ ...prev, barcode_raw: e.target.value.trim() }))}
                placeholder="e.g. 8800001000001"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Name</label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Barcode Full (Preview)</p>
              <p className="mt-1 font-mono text-slate-700">{barcodePreview}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select
                className="h-9 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as ProductStatus }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={saving || !form.client_code.trim() || !form.barcode_raw.trim() || !form.name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

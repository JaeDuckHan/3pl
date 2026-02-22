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
import { createClient, listClients, toggleClientStatus, updateClient } from "@/features/settings/clients/api";
import type { Client, ClientStatus } from "@/features/settings/clients/types";

type FormState = {
  client_code: string;
  name: string;
  memo: string;
  status: ClientStatus;
};

type StatusFilter = "all" | ClientStatus;
type SortKey = "created_desc" | "created_asc" | "code_asc" | "name_asc";

const initialForm: FormState = {
  client_code: "",
  name: "",
  memo: "",
  status: "active",
};

export function ClientsSettingsPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<Client[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
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
      const data = await listClients();
      setRows(data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load clients.");
    } finally {
      setLoadingRows(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const searched = rows.filter(
      (item) =>
        (statusFilter === "all" || item.status === statusFilter) &&
        (
        item.client_code.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
        )
    );
    const sorted = [...searched];
    sorted.sort((a, b) => {
      if (sortKey === "created_desc") return b.created_at.localeCompare(a.created_at);
      if (sortKey === "created_asc") return a.created_at.localeCompare(b.created_at);
      if (sortKey === "code_asc") return a.client_code.localeCompare(b.client_code);
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

  const openEdit = (row: Client) => {
    setEditingId(row.id);
    setForm({
      client_code: row.client_code,
      name: row.name,
      memo: row.memo,
      status: row.status,
    });
    setFieldError(null);
    setOpen(true);
  };

  const submit = async () => {
    if (!form.client_code.trim() || !form.name.trim()) {
      setFieldError("Client code and name are required.");
      pushToast({ title: "Missing required fields", description: "Client code and name are required.", variant: "error" });
      return;
    }

    setFieldError(null);
    setSaving(true);
    try {
      if (editingId) {
        await updateClient(editingId, form);
        pushToast({ title: "Client updated", variant: "success" });
      } else {
        await createClient(form);
        pushToast({ title: "Client created", variant: "success" });
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

  const toggleStatus = async (row: Client) => {
    setTogglingId(row.id);
    try {
      await toggleClientStatus(row.id);
      await loadRows();
      pushToast({
        title: row.status === "active" ? "Client deactivated" : "Client reactivated",
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
        breadcrumbs={[{ label: "Settings" }, { label: "Clients" }]}
        title="Clients"
        subtitle="Manage client master data for outbound and inbound operations."
        rightSlot={<Button onClick={openCreate}>New</Button>}
      />
      <SettingsTabs />

      <div className="rounded-xl border bg-white p-6">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Input
            placeholder="Search by client name or code"
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
            <option value="code_asc">Client Code</option>
            <option value="name_asc">Name</option>
          </select>
        </div>

        {loadError ? (
          <ErrorState title="Failed to load clients." message={loadError} onRetry={() => void loadRows()} />
        ) : (
          <DataTable
            rows={filteredRows}
            emptyText={loadingRows ? "Loading clients..." : "No clients found."}
            rowClassName="cursor-pointer hover:bg-slate-50"
            columns={[
            { key: "client_code", label: "Client Code", render: (row) => <span className="font-medium">{row.client_code}</span> },
            { key: "name", label: "Name", render: (row) => row.name },
            { key: "status", label: "Status", render: (row) => <ActiveStatusBadge status={row.status} /> },
            {
              key: "created_at",
              label: "Created At",
              render: (row) => <span className="tabular-nums text-slate-600">{row.created_at.slice(0, 10)}</span>,
            },
            {
              key: "actions",
              label: "Actions",
              render: (row) => (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => openEdit(row)} disabled={togglingId === row.id}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={() => void toggleStatus(row)} disabled={togglingId === row.id}>
                    {row.status === "active" ? "Deactivate" : "Activate"}
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
            <DialogTitle>{editingId ? "Edit client" : "New client"}</DialogTitle>
            <DialogDescription>Client code and name are required fields.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Client Code</label>
              <Input
                value={form.client_code}
                onChange={(e) => setForm((prev) => ({ ...prev, client_code: e.target.value.toUpperCase() }))}
                placeholder="e.g. ACME"
              />
              <p className="text-xs text-slate-500">Use 2-30 chars: A-Z, 0-9, underscore or hyphen.</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Name</label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Memo</label>
              <Input value={form.memo} onChange={(e) => setForm((prev) => ({ ...prev, memo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-600">Status</label>
              <select
                className="h-9 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-slate-300"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as ClientStatus }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            {fieldError && <p className="text-xs text-red-600">{fieldError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => void submit()} disabled={saving || !form.client_code.trim() || !form.name.trim()}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

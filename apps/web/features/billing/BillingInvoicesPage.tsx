"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/toast";
import { ErrorState } from "@/components/ui/ErrorState";
import { BillingTabs } from "@/components/billing/BillingTabs";
import {
  generateBillingInvoice,
  issueBillingInvoice,
  listBillingInvoices,
  markBillingInvoicePaid,
  seedBillingEvents,
  type BillingInvoice,
} from "@/features/billing/api";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thisMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function BillingInvoicesPage() {
  const { pushToast } = useToast();
  const [rows, setRows] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(1);
  const [invoiceMonth, setInvoiceMonth] = useState(thisMonth());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [status, setStatus] = useState("");
  const [actingId, setActingId] = useState<number | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listBillingInvoices({ client_id: clientId, invoice_month: invoiceMonth, status: status || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const onGenerate = async (regenerateDraft: 0 | 1) => {
    try {
      const result = await generateBillingInvoice({
        client_id: clientId,
        invoice_month: invoiceMonth,
        invoice_date: invoiceDate,
        regenerate_draft: regenerateDraft,
      });
      if (result.reused) {
        pushToast({ title: "Draft already exists", variant: "info" });
      } else {
        pushToast({ title: "Invoice generated", variant: "success" });
      }
      await reload();
    } catch (e) {
      pushToast({ title: "Generate failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const onSeed = async () => {
    try {
      await seedBillingEvents({ client_id: clientId, invoice_month: invoiceMonth });
      pushToast({ title: "Sample events created", variant: "success" });
    } catch (e) {
      pushToast({ title: "Seed failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const onIssue = async (id: number) => {
    setActingId(id);
    try {
      await issueBillingInvoice(id);
      pushToast({ title: "Invoice issued", variant: "success" });
      await reload();
    } catch (e) {
      pushToast({ title: "Issue failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActingId(null);
    }
  };

  const onMarkPaid = async (id: number) => {
    setActingId(id);
    try {
      await markBillingInvoicePaid(id);
      pushToast({ title: "Invoice marked paid", variant: "success" });
      await reload();
    } catch (e) {
      pushToast({ title: "Mark paid failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActingId(null);
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Billing" }, { label: "Invoices" }]}
        title="Invoices"
        subtitle="KRW-only invoice generation with locked THB/KRW rate and VAT line item."
      />
      <BillingTabs />

      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input type="number" placeholder="Client ID" value={clientId} onChange={(e) => setClientId(Number(e.target.value || 0))} />
          <Input type="month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} />
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          <select className="h-9 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All status</option>
            <option value="draft">draft</option>
            <option value="issued">issued</option>
            <option value="paid">paid</option>
          </select>
          <Button variant="secondary" onClick={() => void reload()}>Filter</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void onGenerate(0)}>Generate</Button>
          <Button variant="secondary" onClick={() => void onGenerate(1)}>Re-generate Draft</Button>
          <Button variant="ghost" onClick={() => void onSeed()}>Create Sample Events</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        {error ? (
          <ErrorState title="Failed to load invoices" message={error} onRetry={() => void reload()} />
        ) : (
          <DataTable
            rows={rows}
            emptyText={loading ? "Loading..." : "No invoices"}
            columns={[
              { key: "invoice_no", label: "Invoice No", render: (row) => <Link href={`/billing/${row.id}`} className="font-medium hover:underline">{row.invoice_no}</Link> },
              { key: "client", label: "Client", render: (row) => `${row.client_code} (${row.client_id})` },
              { key: "month", label: "Month", render: (row) => row.invoice_month },
              { key: "fx", label: "FX", render: (row) => Number(row.fx_rate_thbkrw).toFixed(4) },
              { key: "subtotal", label: "Subtotal", render: (row) => Number(row.subtotal_krw).toLocaleString() },
              { key: "vat", label: "VAT 7%", render: (row) => Number(row.vat_krw).toLocaleString() },
              { key: "total", label: "Total KRW", render: (row) => <span className="font-semibold">{Number(row.total_krw).toLocaleString()}</span> },
              { key: "status", label: "Status", render: (row) => row.status },
              {
                key: "actions",
                label: "Actions",
                render: (row) => (
                  <div className="flex gap-2">
                    {row.status === "draft" && (
                      <Button size="sm" variant="secondary" onClick={() => void onIssue(row.id)} disabled={actingId === row.id}>
                        Issue
                      </Button>
                    )}
                    {row.status === "issued" && (
                      <Button size="sm" variant="secondary" onClick={() => void onMarkPaid(row.id)} disabled={actingId === row.id}>
                        Mark Paid
                      </Button>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </div>
    </section>
  );
}

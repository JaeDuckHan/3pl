"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { ErrorState } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/toast";
import { getMe } from "@/features/auth/api";
import { BillingTabs } from "@/components/billing/BillingTabs";
import {
  duplicateBillingInvoiceAdmin,
  exportBillingInvoicePdf,
  getBillingInvoice,
  issueBillingInvoice,
  markBillingInvoicePaid,
  type BillingInvoice,
  type BillingInvoiceItem,
} from "@/features/billing/api";

export function InvoiceDetailPage({ invoiceId }: { invoiceId: string }) {
  const { pushToast } = useToast();
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [items, setItems] = useState<BillingInvoiceItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [acting, setActing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBillingInvoice(invoiceId);
      setInvoice(data.invoice);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load invoice.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [invoiceId]);
  useEffect(() => {
    getMe().then((me) => setIsAdmin(me.role === "admin")).catch(() => setIsAdmin(false));
  }, []);

  const runExport = async () => {
    try {
      const result = await exportBillingInvoicePdf(invoiceId);
      pushToast({ title: "Export stub", description: result.message, variant: "info" });
    } catch (e) {
      pushToast({ title: "Export failed", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const runIssue = async () => {
    setActing(true);
    try {
      await issueBillingInvoice(invoiceId);
      pushToast({ title: "Invoice issued", variant: "success" });
      await load();
    } catch (e) {
      pushToast({ title: "Issue failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActing(false);
    }
  };

  const runMarkPaid = async () => {
    setActing(true);
    try {
      await markBillingInvoicePaid(invoiceId);
      pushToast({ title: "Invoice marked paid", variant: "success" });
      await load();
    } catch (e) {
      pushToast({ title: "Mark paid failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActing(false);
    }
  };

  const runDuplicateAdmin = async () => {
    setActing(true);
    try {
      const duplicated = await duplicateBillingInvoiceAdmin(invoiceId);
      pushToast({ title: `Duplicated as ${duplicated.invoice_no}`, variant: "success" });
    } catch (e) {
      pushToast({ title: "Duplicate failed", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActing(false);
    }
  };

  if (error) {
    return <ErrorState title="Failed to load invoice" message={error} onRetry={() => void load()} />;
  }

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "Billing" }, { label: "Invoices" }, { label: invoice?.invoice_no ?? String(invoiceId) }]}
        title={invoice?.invoice_no ?? "Invoice Detail"}
        subtitle={invoice ? `Client ${invoice.client_code} | ${invoice.invoice_month}` : "Loading..."}
        rightSlot={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void runExport()}>Export PDF (Stub)</Button>
            {invoice?.status === "draft" && <Button onClick={() => void runIssue()} disabled={acting}>Issue</Button>}
            {invoice?.status === "issued" && <Button onClick={() => void runMarkPaid()} disabled={acting}>Mark Paid</Button>}
            {isAdmin && invoice?.status !== "draft" && (
              <Button variant="secondary" onClick={() => void runDuplicateAdmin()} disabled={acting}>
                Duplicate (Admin)
              </Button>
            )}
          </div>
        }
      />
      <BillingTabs />

      {invoice && (
        <div className="mb-4 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
          <div><p className="text-xs text-slate-500">FX Rate</p><p className="font-semibold">{Number(invoice.fx_rate_thbkrw).toFixed(4)}</p></div>
          <div><p className="text-xs text-slate-500">Subtotal</p><p className="font-semibold">{Number(invoice.subtotal_krw).toLocaleString()} KRW (TRUNC100)</p></div>
          <div><p className="text-xs text-slate-500">VAT 7%</p><p className="font-semibold">{Number(invoice.vat_krw).toLocaleString()} KRW (TRUNC100)</p></div>
          <div><p className="text-xs text-slate-500">Total</p><p className="font-semibold">{Number(invoice.total_krw).toLocaleString()} KRW (TRUNC100)</p></div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-6">
        <DataTable
          rows={items}
          emptyText={loading ? "Loading..." : "No items"}
          columns={[
            { key: "service_code", label: "Code", render: (row) => row.service_code },
            { key: "description", label: "Description", render: (row) => row.description },
            { key: "qty", label: "Qty", render: (row) => Number(row.qty).toLocaleString() },
            { key: "unit_price_krw", label: "Unit KRW", render: (row) => `${Number(row.unit_price_krw).toLocaleString()} (TRUNC100)` },
            { key: "amount_krw", label: "Amount KRW", render: (row) => <span className="font-semibold">{Number(row.amount_krw).toLocaleString()} (TRUNC100)</span> },
          ]}
        />
      </div>
    </section>
  );
}

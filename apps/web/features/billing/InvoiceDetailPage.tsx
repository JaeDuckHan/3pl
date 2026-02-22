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
      setError(e instanceof Error ? e.message : "정산서를 불러오지 못했습니다.");
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
      pushToast({ title: "PDF 내보내기", description: result.message, variant: "info" });
    } catch (e) {
      pushToast({ title: "내보내기 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const runIssue = async () => {
    setActing(true);
    try {
      await issueBillingInvoice(invoiceId);
      pushToast({ title: "정산서를 발행했습니다.", variant: "success" });
      await load();
    } catch (e) {
      pushToast({ title: "발행 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActing(false);
    }
  };

  const runMarkPaid = async () => {
    setActing(true);
    try {
      await markBillingInvoicePaid(invoiceId);
      pushToast({ title: "수금완료 처리했습니다.", variant: "success" });
      await load();
    } catch (e) {
      pushToast({ title: "수금완료 처리 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActing(false);
    }
  };

  const runDuplicateAdmin = async () => {
    setActing(true);
    try {
      const duplicated = await duplicateBillingInvoiceAdmin(invoiceId);
      pushToast({ title: `${duplicated.invoice_no}로 복제했습니다.`, variant: "success" });
    } catch (e) {
      pushToast({ title: "복제 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActing(false);
    }
  };

  if (error) {
    return <ErrorState title="정산서를 불러오지 못했습니다." message={error} onRetry={() => void load()} />;
  }

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "정산" }, { label: "정산서" }, { label: invoice?.invoice_no ?? String(invoiceId) }]}
        title={invoice?.invoice_no ?? "정산서 상세"}
        subtitle={invoice ? `고객사 ${invoice.client_code} | ${invoice.invoice_month}` : "불러오는 중..."}
        rightSlot={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void runExport()}>PDF 내보내기</Button>
            {invoice?.status === "draft" && <Button onClick={() => void runIssue()} disabled={acting}>발행</Button>}
            {invoice?.status === "issued" && <Button onClick={() => void runMarkPaid()} disabled={acting}>수금완료</Button>}
            {isAdmin && invoice?.status !== "draft" && (
              <Button variant="secondary" onClick={() => void runDuplicateAdmin()} disabled={acting}>
                복제 (관리자)
              </Button>
            )}
          </div>
        }
      />
      <BillingTabs />

      {invoice && (
        <div className="mb-4 grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-4">
          <div><p className="text-xs text-slate-500">환율(FX)</p><p className="font-semibold">{Number(invoice.fx_rate_thbkrw).toFixed(4)}</p></div>
          <div><p className="text-xs text-slate-500">공급가액</p><p className="font-semibold">{Number(invoice.subtotal_krw).toLocaleString()} KRW (TRUNC100)</p></div>
          <div><p className="text-xs text-slate-500">VAT 7%</p><p className="font-semibold">{Number(invoice.vat_krw).toLocaleString()} KRW (TRUNC100)</p></div>
          <div><p className="text-xs text-slate-500">합계</p><p className="font-semibold">{Number(invoice.total_krw).toLocaleString()} KRW (TRUNC100)</p></div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-6">
        <DataTable
          rows={items}
          emptyText={loading ? "불러오는 중..." : "항목이 없습니다."}
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

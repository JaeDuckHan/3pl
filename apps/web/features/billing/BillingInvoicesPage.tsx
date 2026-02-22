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
      setError(e instanceof Error ? e.message : "정산서를 불러오지 못했습니다.");
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
        pushToast({ title: "기존 초안이 있어 재사용했습니다.", variant: "info" });
      } else {
        pushToast({ title: "정산서를 생성했습니다.", variant: "success" });
      }
      await reload();
    } catch (e) {
      pushToast({ title: "정산서 생성 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const onSeed = async () => {
    try {
      await seedBillingEvents({ client_id: clientId, invoice_month: invoiceMonth });
      pushToast({ title: "샘플 이벤트를 생성했습니다.", variant: "success" });
    } catch (e) {
      pushToast({ title: "샘플 생성 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    }
  };

  const onIssue = async (id: number) => {
    setActingId(id);
    try {
      await issueBillingInvoice(id);
      pushToast({ title: "정산서를 발행했습니다.", variant: "success" });
      await reload();
    } catch (e) {
      pushToast({ title: "발행 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActingId(null);
    }
  };

  const onMarkPaid = async (id: number) => {
    setActingId(id);
    try {
      await markBillingInvoicePaid(id);
      pushToast({ title: "정산서를 수금완료 처리했습니다.", variant: "success" });
      await reload();
    } catch (e) {
      pushToast({ title: "수금완료 처리 실패", description: e instanceof Error ? e.message : "", variant: "error" });
    } finally {
      setActingId(null);
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[{ label: "정산" }, { label: "정산서" }]}
        title="정산서"
        subtitle="THB/KRW 환율 스냅샷과 VAT를 반영해 월별 정산서를 생성합니다."
      />
      <BillingTabs />

      <div className="mb-4 rounded-xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input type="number" placeholder="고객사 ID" value={clientId} onChange={(e) => setClientId(Number(e.target.value || 0))} />
          <Input type="month" value={invoiceMonth} onChange={(e) => setInvoiceMonth(e.target.value)} />
          <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          <select className="h-9 rounded-md border px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">전체 상태</option>
            <option value="draft">draft</option>
            <option value="issued">issued</option>
            <option value="paid">paid</option>
          </select>
          <Button variant="secondary" onClick={() => void reload()}>조회</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void onGenerate(0)}>생성</Button>
          <Button variant="secondary" onClick={() => void onGenerate(1)}>초안 재생성</Button>
          <Button variant="ghost" onClick={() => void onSeed()}>샘플 이벤트 생성</Button>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-6">
        {error ? (
          <ErrorState title="정산서를 불러오지 못했습니다." message={error} onRetry={() => void reload()} />
        ) : (
          <DataTable
            rows={rows}
            emptyText={loading ? "불러오는 중..." : "정산서가 없습니다."}
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

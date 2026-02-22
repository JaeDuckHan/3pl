"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import type { OutboundAction, OutboundOrder } from "@/features/outbound/types";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addOutboundBox, ApiError, transitionOutboundStatus } from "@/features/outbound/api";
import { useToast } from "@/components/ui/toast";

const tabs = ["overview", "items", "boxes", "timeline"] as const;
type TabValue = (typeof tabs)[number];

function normalizeTab(tab?: string): TabValue {
  if (tab && tabs.includes(tab as TabValue)) return tab as TabValue;
  return "overview";
}

function actionByStatus(status: OutboundOrder["status"]): OutboundAction | null {
  if (status === "draft") return "allocate";
  if (status === "allocated" || status === "picking") return "pack";
  if (status === "packing" || status === "packed") return "ship";
  return null;
}

function actionLabel(action: OutboundAction) {
  if (action === "allocate") return "할당";
  if (action === "pack") return "포장";
  return "출고";
}

export function OutboundDetailView({
  order: initialOrder,
  initialTab,
}: {
  order: OutboundOrder;
  initialTab?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();

  const [order, setOrder] = useState(initialOrder);
  const [tab, setTab] = useState<TabValue>(normalizeTab(initialTab));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [boxNo, setBoxNo] = useState("");
  const [courier, setCourier] = useState("");
  const [trackingNo, setTrackingNo] = useState("");
  const [itemCount, setItemCount] = useState("1");
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<OutboundAction | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const currentAction = actionByStatus(order.status);

  const setTabWithQuery = (nextTab: string) => {
    const normalized = normalizeTab(nextTab);
    setTab(normalized);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", normalized);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const openActionConfirm = () => {
    if (!currentAction) return;
    setPendingAction(currentAction);
    setConfirmOpen(true);
  };

  const runStatusAction = async () => {
    if (!pendingAction) return;

    setLoading(true);
    try {
      const updated = await transitionOutboundStatus(order.outbound_no, pendingAction);
      setOrder(updated);
      setConfirmOpen(false);
      pushToast({
        title: `${actionLabel(pendingAction)} 완료`,
        description: `오더 상태가 ${updated.status}(으)로 변경되었습니다.`,
        variant: "success",
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "작업에 실패했습니다.";
      pushToast({ title: "처리 실패", description: message, variant: "error" });
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  const itemColumns = useMemo(
    () => [
      { key: "barcode_full", label: "바코드", render: (row: OutboundOrder["items"][number]) => row.barcode_full },
      { key: "product_name", label: "상품명", render: (row: OutboundOrder["items"][number]) => row.product_name },
      { key: "lot", label: "LOT", render: (row: OutboundOrder["items"][number]) => row.lot },
      { key: "location", label: "로케이션", render: (row: OutboundOrder["items"][number]) => row.location },
      {
        key: "requested_qty",
        label: "요청수량",
        className: "tabular-nums",
        render: (row: OutboundOrder["items"][number]) => row.requested_qty,
      },
      {
        key: "picked_qty",
        label: "피킹수량",
        className: "tabular-nums",
        render: (row: OutboundOrder["items"][number]) => row.picked_qty,
      },
      {
        key: "available_qty",
        label: "가용수량",
        className: "tabular-nums",
        render: (row: OutboundOrder["items"][number]) => row.available_qty,
      },
      {
        key: "status",
        label: "상태",
        render: (row: OutboundOrder["items"][number]) =>
          row.available_qty < row.requested_qty ? (
            <Badge variant="danger" className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              부족
            </Badge>
          ) : (
            <Badge variant={row.status === "picked" ? "success" : "default"}>{row.status}</Badge>
          ),
      },
    ],
    []
  );

  const submitBox = async () => {
    const parsedItemCount = Number(itemCount);
    if (!boxNo.trim() || !courier.trim() || !trackingNo.trim()) {
      setFormError("모든 필드를 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(parsedItemCount) || parsedItemCount < 1) {
      setFormError("품목 수량은 1 이상이어야 합니다.");
      return;
    }

    setFormError(null);
    setLoading(true);
    try {
      const boxes = await addOutboundBox(order.outbound_no, {
        box_no: boxNo.trim(),
        courier: courier.trim(),
        tracking_no: trackingNo.trim(),
        item_count: parsedItemCount,
      });
      setOrder((prev) => ({ ...prev, boxes }));
      setDialogOpen(false);
      setBoxNo("");
      setCourier("");
      setTrackingNo("");
      setItemCount("1");
      pushToast({ title: "박스를 추가했습니다.", variant: "success" });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "입력값 또는 API 상태를 확인해 주세요.";
      pushToast({ title: "박스 추가 실패", description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <PageHeader
        breadcrumbs={[
          { label: "운영" },
          { label: "출고", href: "/outbounds" },
          { label: order.outbound_no },
        ]}
        title={order.outbound_no}
        subtitle={`${order.client} | 출고예정일 ${order.eta_date}`}
        rightSlot={
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            {currentAction && (
              <Button onClick={openActionConfirm} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel(currentAction)}
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTabWithQuery}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="items">품목</TabsTrigger>
          <TabsTrigger value="boxes">박스</TabsTrigger>
          <TabsTrigger value="timeline">이력</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>고객사</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{order.client}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>배송지</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{order.ship_to}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">{order.summary}</p>
              <p className="text-sm text-slate-500">{order.memo}</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="items">
          <DataTable rows={order.items} columns={itemColumns} emptyText="출고 품목이 없습니다." />
        </TabsContent>

        <TabsContent value="boxes">
          <div className="mb-4 flex justify-end">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
              <Button variant="secondary" disabled={!order.boxes_supported} title={!order.boxes_supported ? "Box API is unavailable in current backend." : undefined}>
                <PackagePlus className="h-4 w-4" />
                박스 추가
              </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>박스 추가</DialogTitle>
                  <DialogDescription>입력값 검증 후 박스를 등록합니다.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="박스번호" value={boxNo} onChange={(e) => setBoxNo(e.target.value)} />
                  <Input placeholder="택배사" value={courier} onChange={(e) => setCourier(e.target.value)} />
                  <Input placeholder="운송장번호" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} />
                  <Input
                    placeholder="품목 수량"
                    type="number"
                    min={1}
                    value={itemCount}
                    onChange={(e) => setItemCount(e.target.value)}
                  />
                  {formError && <p className="text-sm text-red-600">{formError}</p>}
                </div>
                <DialogFooter>
                  <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={loading}>
                    취소
                  </Button>
                  <Button onClick={submitBox} disabled={loading}>
                    {loading ? "저장 중..." : "저장"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <DataTable
            rows={order.boxes}
            columns={[
              { key: "box_no", label: "박스번호", render: (row) => row.box_no },
              { key: "courier", label: "택배사", render: (row) => row.courier },
              { key: "tracking_no", label: "운송장번호", render: (row) => row.tracking_no },
              {
                key: "item_count",
                label: "품목 수량",
                className: "tabular-nums",
                render: (row) => row.item_count,
              },
            ]}
            emptyText="등록된 박스가 없습니다."
          />
          {!order.boxes_supported && (
            <p className="mt-3 text-sm text-amber-700">
              현재 백엔드에서 박스 API를 지원하지 않아 박스 등록/수정이 비활성화되었습니다.
            </p>
          )}
        </TabsContent>

        <TabsContent value="timeline">
          {order.timeline.length === 0 ? (
            <div className="rounded-xl border bg-white px-6 py-8 text-center text-sm text-slate-500">이력 로그가 없습니다.</div>
          ) : (
            <div className="rounded-xl border bg-white px-6 py-2">
              {order.timeline.map((log, idx) => (
                <div key={log.id} className="relative flex gap-4 py-4">
                  <div className="flex w-5 flex-col items-center">
                    <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                    {idx < order.timeline.length - 1 && <span className="mt-1 h-full w-px bg-slate-200" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{log.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                      {log.at} | {log.actor}
                    </p>
                    {log.note && <p className="mt-1 text-sm text-slate-600">{log.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pendingAction ? actionLabel(pendingAction) : "작업"} 확인</DialogTitle>
            <DialogDescription>
              출고 상태가 변경되고 이력 로그가 추가됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={loading}>
              취소
            </Button>
            <Button onClick={runStatusAction} disabled={loading || !pendingAction}>
              {loading ? "처리 중..." : "확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

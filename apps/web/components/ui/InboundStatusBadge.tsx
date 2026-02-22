import { Badge } from "@/components/ui/badge";
import type { InboundStatus } from "@/features/inbound/types";

const statusMap: Record<InboundStatus, { label: string; variant: "default" | "info" | "warning" | "success" }> = {
  draft: { label: "작성", variant: "default" },
  submitted: { label: "제출", variant: "info" },
  arrived: { label: "도착", variant: "warning" },
  qc_hold: { label: "QC 보류", variant: "warning" },
  received: { label: "입고완료", variant: "success" },
  cancelled: { label: "취소", variant: "default" },
};

export function InboundStatusBadge({ status }: { status: InboundStatus }) {
  const current = statusMap[status];
  return <Badge variant={current.variant}>{current.label}</Badge>;
}

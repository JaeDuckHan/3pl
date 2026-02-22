import { Badge } from "@/components/ui/badge";
import { OutboundStatus } from "@/features/outbound/types";

const statusMap: Record<OutboundStatus, { label: string; variant: "default" | "info" | "warning" | "success" }> = {
  draft: { label: "작성", variant: "default" },
  confirmed: { label: "확정", variant: "info" },
  allocated: { label: "할당", variant: "info" },
  picking: { label: "피킹", variant: "warning" },
  packing: { label: "포장", variant: "warning" },
  packed: { label: "포장완료", variant: "warning" },
  shipped: { label: "출고완료", variant: "success" },
  delivered: { label: "배송완료", variant: "success" },
  cancelled: { label: "취소", variant: "default" },
};

export function StatusBadge({ status }: { status: OutboundStatus }) {
  const current = statusMap[status];
  return <Badge variant={current.variant}>{current.label}</Badge>;
}

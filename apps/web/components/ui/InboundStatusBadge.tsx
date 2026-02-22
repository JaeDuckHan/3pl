import { Badge } from "@/components/ui/badge";
import type { InboundStatus } from "@/features/inbound/types";

const statusMap: Record<InboundStatus, { label: string; variant: "default" | "info" | "warning" | "success" }> = {
  draft: { label: "Draft", variant: "default" },
  submitted: { label: "Submitted", variant: "info" },
  arrived: { label: "Arrived", variant: "warning" },
  qc_hold: { label: "QC Hold", variant: "warning" },
  received: { label: "Received", variant: "success" },
  cancelled: { label: "Cancelled", variant: "default" },
};

export function InboundStatusBadge({ status }: { status: InboundStatus }) {
  const current = statusMap[status];
  return <Badge variant={current.variant}>{current.label}</Badge>;
}

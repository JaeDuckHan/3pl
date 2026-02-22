import { Badge } from "@/components/ui/badge";

export function ActiveStatusBadge({ status }: { status: "active" | "inactive" }) {
  return <Badge variant={status === "active" ? "success" : "default"}>{status === "active" ? "Active" : "Inactive"}</Badge>;
}

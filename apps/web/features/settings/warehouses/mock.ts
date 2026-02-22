import type { Warehouse } from "@/features/settings/warehouses/types";

export const warehousesMock: Warehouse[] = [
  {
    id: "wh-1",
    warehouse_code: "ICN-01",
    name: "Incheon Main DC",
    status: "active",
    created_at: "2026-02-15T08:00:00Z",
  },
  {
    id: "wh-2",
    warehouse_code: "SEL-02",
    name: "Seoul East Hub",
    status: "active",
    created_at: "2026-02-16T08:00:00Z",
  },
  {
    id: "wh-3",
    warehouse_code: "BSN-03",
    name: "Busan Crossdock",
    status: "inactive",
    created_at: "2026-02-17T08:00:00Z",
  },
];

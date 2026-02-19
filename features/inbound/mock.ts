import type { InboundOrder } from "@/features/inbound/types";

export const inboundOrdersMock: InboundOrder[] = [
  {
    id: "IB-20260218-0001",
    inbound_no: "IB-20260218-0001",
    client: "ACME Korea",
    inbound_date: "2026-02-18",
    status: "submitted",
    memo: "Morning receiving slot.",
    warehouse: "Warehouse #201",
    summary: "2 SKUs / 42 EA",
    items: [
      {
        id: "II-1",
        barcode_full: "8800001000001",
        product_name: "Protein Bar 40g",
        lot: "LOT-2402-A",
        location: "A-01-03",
        qty: 20,
        invoice_price: 11.2,
        currency: "THB",
        remark: "ok",
      },
      {
        id: "II-2",
        barcode_full: "8800002000002",
        product_name: "Vitamin C 500mg",
        lot: "LOT-2401-B",
        location: "B-02-01",
        qty: 22,
        invoice_price: 7.5,
        currency: "THB",
        remark: null,
      },
    ],
    timeline: [
      {
        id: "ITL-1",
        type: "created",
        title: "Inbound Created",
        at: "2026-02-18 09:00",
        actor: "admin",
      },
      {
        id: "ITL-2",
        type: "submitted",
        title: "Inbound Submitted",
        at: "2026-02-18 09:15",
        actor: "planner01",
      },
    ],
  },
  {
    id: "IB-20260218-0002",
    inbound_no: "IB-20260218-0002",
    client: "Blue Retail",
    inbound_date: "2026-02-19",
    status: "draft",
    memo: "Priority receiving.",
    warehouse: "Warehouse #201",
    summary: "0 SKUs / 0 EA",
    items: [],
    timeline: [
      {
        id: "ITL-3",
        type: "created",
        title: "Inbound Created",
        at: "2026-02-18 10:30",
        actor: "admin",
      },
    ],
  },
];

export function getInboundByNo(inboundNo: string) {
  return inboundOrdersMock.find((item) => item.inbound_no === inboundNo) ?? null;
}

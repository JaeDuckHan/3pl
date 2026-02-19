import type { OutboundOrder } from "@/features/outbound/types";

export const outboundOrdersMock: OutboundOrder[] = [
  {
    id: "OB-20260218-0001",
    outbound_no: "OB-20260218-0001",
    client: "ACME Korea",
    eta_date: "2026-02-20",
    status: "allocated",
    memo: "Morning pickup window preferred.",
    ship_to: "Seoul, Gangnam-gu, Teheran-ro 152",
    summary: "3 SKUs / 66 EA",
    items: [
      {
        id: "OI-1",
        barcode_full: "8800001000001",
        product_name: "Protein Bar 40g",
        lot: "LOT-2402-A",
        location: "A-01-03",
        requested_qty: 24,
        picked_qty: 0,
        available_qty: 50,
        status: "ready",
      },
      {
        id: "OI-2",
        barcode_full: "8800002000002",
        product_name: "Vitamin C 500mg",
        lot: "LOT-2401-B",
        location: "B-02-01",
        requested_qty: 30,
        picked_qty: 10,
        available_qty: 12,
        status: "shortage",
      },
      {
        id: "OI-3",
        barcode_full: "8800003000003",
        product_name: "Hand Sanitizer 100ml",
        lot: "LOT-2402-C",
        location: "C-01-02",
        requested_qty: 12,
        picked_qty: 12,
        available_qty: 60,
        status: "picked",
      },
    ],
    boxes: [
      {
        id: "BOX-1",
        box_no: "BOX-0001",
        courier: "CJ Logistics",
        tracking_no: "6350-9912-1234",
        item_count: 2,
      },
      {
        id: "BOX-2",
        box_no: "BOX-0002",
        courier: "Hanjin",
        tracking_no: "7788-1122-9988",
        item_count: 1,
      },
    ],
    boxes_supported: true,
    timeline: [
      {
        id: "TL-1",
        type: "created",
        title: "Order Created",
        at: "2026-02-18 09:10",
        actor: "system",
      },
      {
        id: "TL-2",
        type: "allocated",
        title: "Stock Allocated",
        at: "2026-02-18 09:31",
        actor: "planner01",
        note: "SKU OI-2 partial shortage detected.",
      },
      {
        id: "TL-3",
        type: "packed",
        title: "Packing Started",
        at: "2026-02-18 10:02",
        actor: "packer03",
      },
    ],
  },
  {
    id: "OB-20260218-0002",
    outbound_no: "OB-20260218-0002",
    client: "Blue Retail",
    eta_date: "2026-02-21",
    status: "draft",
    memo: "VIP order.",
    ship_to: "Incheon, Namdong-gu, 101",
    summary: "2 SKUs / 20 EA",
    items: [],
    boxes: [],
    boxes_supported: true,
    timeline: [
      {
        id: "TL-4",
        type: "created",
        title: "Order Created",
        at: "2026-02-18 11:21",
        actor: "admin",
      },
    ],
  },
];

export function getOutboundByNo(outboundNo: string) {
  return outboundOrdersMock.find((item) => item.outbound_no === outboundNo) ?? null;
}

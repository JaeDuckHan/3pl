export type InboundStatus =
  | "draft"
  | "submitted"
  | "arrived"
  | "qc_hold"
  | "received"
  | "cancelled";

export type InboundAction = "submit" | "arrive" | "receive";
export type InboundListStatus = InboundStatus | "all";

export type InboundItem = {
  id: string;
  barcode_full: string;
  product_name: string;
  lot: string;
  location: string;
  qty: number;
  invoice_price: number | null;
  currency: "KRW" | "THB" | null;
  remark: string | null;
};

export type InboundTimeline = {
  id: string;
  type: "created" | "submitted" | "arrived" | "received" | "updated" | "cancelled";
  title: string;
  at: string;
  actor: string;
  note?: string;
};

export type InboundOrder = {
  id: string;
  inbound_no: string;
  client: string;
  inbound_date: string;
  status: InboundStatus;
  memo: string;
  warehouse: string;
  summary: string;
  items: InboundItem[];
  timeline: InboundTimeline[];
};

export type InboundListQuery = {
  q?: string;
  status?: InboundListStatus;
};

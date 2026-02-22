export type OutboundStatus =
  | "draft"
  | "confirmed"
  | "allocated"
  | "picking"
  | "packing"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";
export type OutboundAction = "allocate" | "pack" | "ship";
export type OutboundListStatus = OutboundStatus | "all";

export type OutboundItem = {
  id: string;
  barcode_full: string;
  product_name: string;
  lot: string;
  location: string;
  requested_qty: number;
  picked_qty: number;
  available_qty: number;
  status: "ready" | "shortage" | "picked";
};

export type OutboundBox = {
  id: string;
  box_no: string;
  courier: string;
  tracking_no: string;
  item_count: number;
};

export type OutboundTimeline = {
  id: string;
  type: "created" | "allocated" | "packed" | "shipped" | "updated" | "cancelled";
  title: string;
  at: string;
  actor: string;
  note?: string;
};

export type OutboundOrder = {
  id: string;
  outbound_no: string;
  client: string;
  eta_date: string;
  status: OutboundStatus;
  memo: string;
  ship_to: string;
  summary: string;
  items: OutboundItem[];
  boxes: OutboundBox[];
  boxes_supported: boolean;
  timeline: OutboundTimeline[];
};

export type OutboundListQuery = {
  q?: string;
  status?: OutboundListStatus;
};

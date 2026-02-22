export type InventoryTab = "balances" | "transactions";

export type StockBalanceRow = {
  id: string;
  client: string;
  product: string;
  lot: string;
  warehouse: string;
  location: string;
  available_qty: number;
  reserved_qty: number;
};

export type StockTransactionRow = {
  id: string;
  txn_date: string;
  txn_type: string;
  client: string;
  product: string;
  lot: string;
  warehouse: string;
  location: string;
  qty_in: number;
  qty_out: number;
  ref: string;
  note: string;
};

export type InventoryQuery = {
  q?: string;
  txn_type?: string;
};

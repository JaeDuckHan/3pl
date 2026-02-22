export type WarehouseStatus = "active" | "inactive";

export type Warehouse = {
  id: string;
  warehouse_code: string;
  name: string;
  status: WarehouseStatus;
  created_at: string;
};

export type WarehouseFormInput = {
  warehouse_code: string;
  name: string;
  status?: WarehouseStatus;
};

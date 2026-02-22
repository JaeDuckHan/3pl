export type ProductStatus = "active" | "inactive";

export type Product = {
  id: string;
  client_code: string;
  barcode_raw: string;
  barcode_full: string;
  name: string;
  status: ProductStatus;
  created_at: string;
};

export type ProductFormInput = {
  client_code: string;
  barcode_raw: string;
  name: string;
  status?: ProductStatus;
};

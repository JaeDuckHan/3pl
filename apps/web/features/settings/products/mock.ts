import type { Product } from "@/features/settings/products/types";

export const productsMock: Product[] = [
  {
    id: "prd-1",
    client_code: "ACME",
    barcode_raw: "8800001000001",
    barcode_full: "ACME-8800001000001",
    name: "Protein Bar 40g",
    status: "active",
    created_at: "2026-02-15T10:10:00Z",
  },
  {
    id: "prd-2",
    client_code: "BLUE",
    barcode_raw: "8800002000002",
    barcode_full: "BLUE-8800002000002",
    name: "Vitamin C 500mg",
    status: "active",
    created_at: "2026-02-16T10:10:00Z",
  },
  {
    id: "prd-3",
    client_code: "STRIPE",
    barcode_raw: "8800007000007",
    barcode_full: "STRIPE-8800007000007",
    name: "Collagen Stick 20g",
    status: "inactive",
    created_at: "2026-02-17T10:10:00Z",
  },
];

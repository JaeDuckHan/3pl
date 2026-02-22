import type { Client } from "@/features/settings/clients/types";

export const clientsMock: Client[] = [
  {
    id: "cl-1",
    client_code: "ACME",
    name: "ACME Korea",
    memo: "Main enterprise account",
    status: "active",
    created_at: "2026-02-15T09:10:00Z",
  },
  {
    id: "cl-2",
    client_code: "BLUE",
    name: "Blue Retail",
    memo: "",
    status: "active",
    created_at: "2026-02-16T11:45:00Z",
  },
  {
    id: "cl-3",
    client_code: "STRIPE",
    name: "Stripe Retail Demo",
    memo: "Sandbox demo client",
    status: "inactive",
    created_at: "2026-02-17T13:20:00Z",
  },
];

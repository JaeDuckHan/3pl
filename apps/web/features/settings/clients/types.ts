export type ClientStatus = "active" | "inactive";

export type Client = {
  id: string;
  client_code: string;
  name: string;
  memo: string;
  status: ClientStatus;
  created_at: string;
};

export type ClientFormInput = {
  client_code: string;
  name: string;
  memo?: string;
  status?: ClientStatus;
};

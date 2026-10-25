export interface Env {
  DB: D1Database;
  FILES: KVNamespace;
  EMAIL: { send(message: unknown): Promise<{ messageId: string }> };
  APP_URL: string;
  INBOX: string;
  MAIL_DOMAIN: string;
  OPENAI_MODEL: string;
  ALLOW_PRODUCTION: string;
  ALLOWED_SENDERS?: string;
  GITHUB_URL: string;
  OPENAI_API_KEY: string;
  ENC_KEY: string;
}

export interface User {
  id: string;
  email: string;
  token: string;
  accountant_email: string | null;
  awx_client_id: string | null;
  awx_api_key_enc: string | null;
  awx_env: 'sandbox' | 'production';
  created_at: number;
}

export type Kind = 'bill' | 'receipt' | 'sales_invoice' | 'other';
export type Status = 'filed' | 'awaiting_approval' | 'needs_info' | 'paid' | 'failed' | 'skipped';

export interface Doc {
  id: string;
  user_id: string;
  kind: Kind;
  status: Status;
  vendor: string | null;
  amount: number | null;
  currency: string | null;
  doc_date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  description: string | null;
  category: string | null;
  vendor_json: string | null;
  bank_json: string | null;
  file_key: string | null;
  file_name: string | null;
  file_type: string | null;
  pay_token: string | null;
  transfer_id: string | null;
  error: string | null;
  subject: string | null;
  thread_id: string | null;
  created_at: number;
  paid_at: number | null;
}

export interface Bank {
  account_name: string | null;
  iban: string | null;
  swift_bic: string | null;
  account_number: string | null;
  routing_number: string | null;
  sort_code: string | null;
  bank_name: string | null;
  bank_country_code: string | null;
}

export interface VendorAddress {
  street: string | null;
  city: string | null;
  postcode: string | null;
  state: string | null;
  country_code: string | null;
}

export interface Extracted {
  kind: Kind;
  vendor: string;
  vendor_address: VendorAddress;
  amount: number | null;
  currency: string | null;
  date: string | null;
  due_date: string | null;
  invoice_number: string | null;
  description: string;
  category: string;
  already_paid: boolean;
  bank: Bank;
}

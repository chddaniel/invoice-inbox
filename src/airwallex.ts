import type { Bank, Doc, VendorAddress } from './types';

export interface AwxCreds {
  clientId: string;
  apiKey: string;
  env: 'sandbox' | 'production';
}

const base = (env: AwxCreds['env']) =>
  env === 'production' ? 'https://api.airwallex.com' : 'https://api.sandbox.airwallex.com';

class AwxError extends Error {}

async function call(creds: AwxCreds, token: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(base(creds.env) + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const field = data?.details?.errors?.[0]?.source;
    throw new AwxError(`${data?.message ?? `Airwallex ${res.status}`}${field ? ` (${field})` : ''}`);
  }
  return data;
}

export async function login(creds: AwxCreds): Promise<string> {
  const res = await fetch(base(creds.env) + '/api/v1/authentication/login', {
    method: 'POST',
    headers: { 'x-client-id': creds.clientId, 'x-api-key': creds.apiKey },
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !data.token) throw new AwxError(data?.message ?? 'Airwallex login failed, check the Client ID and API key');
  return data.token;
}

/** Map the bank details we read off the invoice onto an Airwallex beneficiary + transfer method. */
function beneficiaryFor(doc: Doc, bank: Bank, addr: VendorAddress) {
  const name = (bank.account_name || doc.vendor || 'Supplier').slice(0, 100);
  const currency = (doc.currency || 'USD').toUpperCase();
  const country = (bank.bank_country_code || bank.iban?.slice(0, 2) || addr.country_code || 'US').toUpperCase();
  const address = {
    country_code: (addr.country_code || country).toUpperCase(),
    city: addr.city || 'Unknown',
    street_address: addr.street || 'Unknown',
    postcode: addr.postcode || '00000',
    ...(addr.state ? { state: addr.state } : {}),
  };

  let method: 'LOCAL' | 'SWIFT';
  let bank_details: Record<string, string>;
  if (bank.iban) {
    method = 'SWIFT';
    bank_details = {
      account_currency: currency,
      account_name: name,
      bank_country_code: country,
      iban: bank.iban,
      ...(bank.swift_bic ? { swift_code: bank.swift_bic } : {}),
    };
  } else if (country === 'US' && bank.account_number && bank.routing_number && currency === 'USD') {
    method = 'LOCAL';
    bank_details = {
      account_currency: 'USD',
      account_name: name,
      bank_country_code: 'US',
      account_number: bank.account_number,
      account_routing_type1: 'aba',
      account_routing_value1: bank.routing_number.replace(/\D/g, ''),
      local_clearing_system: 'ACH',
      bank_account_category: 'Checking',
    };
  } else if (country === 'GB' && bank.account_number && bank.sort_code && currency === 'GBP') {
    method = 'LOCAL';
    bank_details = {
      account_currency: 'GBP',
      account_name: name,
      bank_country_code: 'GB',
      account_number: bank.account_number,
      account_routing_type1: 'sort_code',
      account_routing_value1: bank.sort_code.replace(/\D/g, ''),
    };
  } else if (bank.account_number && bank.swift_bic) {
    method = 'SWIFT';
    bank_details = {
      account_currency: currency,
      account_name: name,
      bank_country_code: country,
      account_number: bank.account_number,
      swift_code: bank.swift_bic,
    };
  } else {
    throw new AwxError('The invoice has no bank details Airwallex can pay to');
  }

  return {
    method,
    body: {
      request_id: crypto.randomUUID(),
      nickname: name.slice(0, 50),
      transfer_methods: [method],
      beneficiary: { entity_type: 'COMPANY', company_name: name, address, bank_details },
    },
  };
}

export interface PayResult {
  transferId: string;
  status: string;
  payerPays: string | null;
}

export async function pay(creds: AwxCreds, doc: Doc): Promise<PayResult> {
  if (doc.amount == null || !doc.currency) throw new AwxError('The invoice has no amount');
  const bank = JSON.parse(doc.bank_json || 'null') as Bank | null;
  const addr = JSON.parse(doc.vendor_json || '{}') as VendorAddress;
  if (!bank) throw new AwxError('The invoice has no bank details');

  const token = await login(creds);
  const { method, body } = beneficiaryFor(doc, bank, addr);
  const beneficiary = await call(creds, token, '/api/v1/beneficiaries/create', body);

  // Pay from the same currency when there is enough of it, else convert from USD.
  const balances = (await call(creds, token, '/api/v1/balances/current')) as any[];
  const same = balances.find((b) => b.currency === doc.currency);
  const source = same && same.available_amount >= doc.amount ? doc.currency : 'USD';

  const transfer = await call(creds, token, '/api/v1/transfers/create', {
    request_id: crypto.randomUUID(),
    beneficiary_id: beneficiary.id,
    transfer_amount: doc.amount,
    transfer_currency: doc.currency,
    source_currency: source,
    transfer_method: method,
    reference: (doc.invoice_number || doc.vendor || 'Invoice').slice(0, 30),
    reason: 'professional_business_services',
  });

  let status: string = transfer.status ?? 'PROCESSING';
  if (creds.env === 'sandbox') {
    // The sandbox never settles on its own; walk the transfer to PAID like a real payout would.
    for (const next of ['SENT', 'PAID']) {
      try {
        const t = await call(creds, token, `/api/v1/simulation/transfers/${transfer.id}/transition`, { next_status: next });
        status = t.status ?? next;
      } catch {
        break;
      }
    }
  }
  const payerPays =
    transfer.amount_payer_pays != null && source !== doc.currency
      ? `${Number(transfer.amount_payer_pays).toFixed(2)} ${source}`
      : null;
  return { transferId: transfer.id, status, payerPays };
}

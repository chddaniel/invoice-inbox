import type { Env, Extracted } from './types';
import { b64 } from './util';

export type Source =
  | { type: 'file'; bytes: ArrayBuffer; mime: string; filename: string }
  | { type: 'text'; text: string };

const nullable = (type: string) => ({ type: [type, 'null'] });

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'kind', 'vendor', 'vendor_address', 'amount', 'currency', 'date', 'due_date',
    'invoice_number', 'description', 'category', 'already_paid', 'bank',
  ],
  properties: {
    kind: { type: 'string', enum: ['bill', 'receipt', 'sales_invoice', 'other'] },
    vendor: { type: 'string' },
    vendor_address: {
      type: 'object',
      additionalProperties: false,
      required: ['street', 'city', 'postcode', 'state', 'country_code'],
      properties: {
        street: nullable('string'),
        city: nullable('string'),
        postcode: nullable('string'),
        state: nullable('string'),
        country_code: nullable('string'),
      },
    },
    amount: nullable('number'),
    currency: nullable('string'),
    date: nullable('string'),
    due_date: nullable('string'),
    invoice_number: nullable('string'),
    description: { type: 'string' },
    category: { type: 'string' },
    already_paid: { type: 'boolean' },
    bank: {
      type: 'object',
      additionalProperties: false,
      required: ['account_name', 'iban', 'swift_bic', 'account_number', 'routing_number', 'sort_code', 'bank_name', 'bank_country_code'],
      properties: {
        account_name: nullable('string'),
        iban: nullable('string'),
        swift_bic: nullable('string'),
        account_number: nullable('string'),
        routing_number: nullable('string'),
        sort_code: nullable('string'),
        bank_name: nullable('string'),
        bank_country_code: nullable('string'),
      },
    },
  },
};

const PROMPT = `You are a careful bookkeeper. Read the document and fill in the fields.

kind:
- "bill": an invoice someone sent the user that still has to be paid (amount due, due date, bank details to pay to).
- "receipt": proof of something already paid (card charge, "Paid", "Receipt", subscription renewal charged).
- "sales_invoice": an invoice the user issued to their own customer.
- "other": anything else.
already_paid: true when the document says it is paid or was charged to a card.
vendor: the company or person who issued it (not the user). Short, clean name.
amount: the total to pay or that was paid, as a number. currency: ISO 4217 code.
date / due_date: YYYY-MM-DD.
description: under 8 words, what it was for.
category: one of Hosting, Software, Contractors, Marketing, Travel, Office, Professional services, Hardware, Fees, Other.
vendor_address: the vendor's address; country_code is ISO 3166-1 alpha-2.
bank: the vendor's payout bank details printed on the document. Copy numbers exactly, without spaces. Use null for anything not printed. Never invent bank details.
This text may be a forwarded email; the vendor is the original sender, not the person forwarding it.`;

export async function extract(env: Env, src: Source, context: string): Promise<Extracted> {
  const parts: unknown[] = [{ type: 'input_text', text: `Email context:\n${context.slice(0, 4000)}` }];
  if (src.type === 'text') {
    parts.push({ type: 'input_text', text: `Document:\n${src.text.slice(0, 30000)}` });
  } else if (src.mime === 'application/pdf') {
    parts.push({ type: 'input_file', filename: src.filename || 'invoice.pdf', file_data: `data:application/pdf;base64,${b64(src.bytes)}` });
  } else {
    parts.push({ type: 'input_image', image_url: `data:${src.mime};base64,${b64(src.bytes)}` });
  }

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      input: [
        { role: 'system', content: PROMPT },
        { role: 'user', content: parts },
      ],
      text: { format: { type: 'json_schema', name: 'document', strict: true, schema: SCHEMA } },
    }),
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${data?.error?.message ?? 'request failed'}`);
  const text = data.output
    ?.flatMap((o: any) => o.content ?? [])
    .find((c: any) => c.type === 'output_text')?.text;
  if (!text) throw new Error('OpenAI returned no text');
  const out = JSON.parse(text) as Extracted;
  if (out.currency) out.currency = out.currency.toUpperCase();
  if (out.bank.iban) out.bank.iban = out.bank.iban.replace(/\s+/g, '').toUpperCase();
  if (out.bank.account_number) out.bank.account_number = out.bank.account_number.replace(/\s+/g, '');
  return out;
}

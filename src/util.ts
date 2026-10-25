import { Buffer } from 'node:buffer';
import type { Bank } from './types';

export const now = () => Date.now();

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function token(len = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString('base64');

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function money(amount: number | null, currency: string | null): string {
  if (amount == null) return '—';
  const cur = (currency || 'USD').toUpperCase();
  // Workers' Intl skips digit grouping, so group by hand: €1,200.00
  const [int, dec] = Math.abs(amount).toFixed(2).split('.');
  const num = `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$', CHF: 'CHF ', RON: 'RON ', AED: 'AED ' };
  return `${amount < 0 ? '-' : ''}${sym[cur] ?? `${cur} `}${num}`;
}

export function niceDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : ''));
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function monthKey(iso: string | null, fallbackMs: number): string {
  if (iso && /^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7);
  return new Date(fallbackMs).toISOString().slice(0, 7);
}

export function monthName(key: string): string {
  const d = new Date(key + '-01T00:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "DE89 •••• 3000" style, so emails and screen recordings never show a full account number. */
export function maskedAccount(bank: Bank | null): string {
  if (!bank) return '';
  const num = (bank.iban || bank.account_number || '').replace(/\s+/g, '');
  if (!num) return '';
  const label = bank.iban ? 'IBAN' : 'Account';
  const masked = num.length > 8 ? `${num.slice(0, 4)} •••• ${num.slice(-4)}` : `•••• ${num.slice(-4)}`;
  return `${label} ${masked}${bank.bank_name ? ` (${bank.bank_name})` : ''}`;
}

export function hasPayableBank(bank: Bank | null): boolean {
  if (!bank) return false;
  return Boolean(bank.iban || (bank.account_number && (bank.routing_number || bank.sort_code || bank.swift_bic)));
}

// AES-GCM for the Airwallex API key at rest.
async function aesKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', Buffer.from(secret, 'base64'), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encrypt(secret: string, plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(plain));
  return `${b64(iv)}.${b64(ct)}`;
}

export async function decrypt(secret: string, sealed: string): Promise<string> {
  const [iv, ct] = sealed.split('.');
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(iv, 'base64') },
    await aesKey(secret),
    Buffer.from(ct, 'base64'),
  );
  return new TextDecoder().decode(pt);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** The new part of a reply, without the quoted thread underneath. */
export function replyHead(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*>/.test(line) || /^On .+wrote:\s*$/.test(line) || /^-{2,}\s*Original Message/i.test(line)) break;
    lines.push(line);
  }
  return lines.join('\n').trim();
}

import type { Env } from './types';
import { b64 } from './util';

// Zero-config install: a fresh "Deploy to Cloudflare" copy has empty vars and
// an empty database. Everything below fills itself in on first use.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, token TEXT UNIQUE NOT NULL,
    accountant_email TEXT, awx_client_id TEXT, awx_api_key_enc TEXT, awx_env TEXT NOT NULL DEFAULT 'sandbox', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
    vendor TEXT, amount REAL, currency TEXT, doc_date TEXT, due_date TEXT, invoice_number TEXT, description TEXT, category TEXT,
    vendor_json TEXT, bank_json TEXT, file_key TEXT, file_name TEXT, file_type TEXT, pay_token TEXT UNIQUE, transfer_id TEXT,
    error TEXT, subject TEXT, thread_id TEXT, created_at INTEGER NOT NULL, paid_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS docs_user ON docs (user_id, created_at)`,
];

let schemaReady = false;
async function ensureSchema(env: Env) {
  if (schemaReady) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  schemaReady = true;
}

async function remembered(env: Env, key: string, fallback: () => string | null): Promise<string> {
  const saved = await env.FILES.get(`meta/${key}`);
  if (saved) return saved;
  const value = fallback();
  if (value) await env.FILES.put(`meta/${key}`, value);
  return value ?? '';
}

/**
 * Fills the settings a one-click install leaves empty:
 * - APP_URL: the first address the site is opened at
 * - INBOX / MAIL_DOMAIN: the first address an invoice is forwarded to
 * - ENC_KEY: generated once and kept in KV
 */
export async function resolveEnv(env: Env, hint: { origin?: string; to?: string } = {}): Promise<Env> {
  await ensureSchema(env);
  const appUrl = env.APP_URL || (await remembered(env, 'app_url', () => hint.origin ?? null));
  const inbox = env.INBOX || (await remembered(env, 'inbox', () => hint.to ?? null));
  const encKey = env.ENC_KEY || (await remembered(env, 'enc_key', () => b64(crypto.getRandomValues(new Uint8Array(32)))));
  return {
    ...env,
    APP_URL: appUrl,
    INBOX: inbox,
    MAIL_DOMAIN: env.MAIL_DOMAIN || inbox.split('@')[1] || '',
    ENC_KEY: encKey,
    OPENAI_MODEL: env.OPENAI_MODEL || 'gpt-4.1-mini',
  };
}

/** Who may use this inbox: the ALLOWED_SENDERS list, or else whoever forwarded the first invoice. */
export async function mayUse(env: Env, from: string): Promise<boolean> {
  const allowed = (env.ALLOWED_SENDERS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length) return allowed.includes(from);
  const known = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(from).first();
  if (known) return true;
  const any = await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
  return !any;
}

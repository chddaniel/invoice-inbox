import type { Env } from './types';

// One-form email setup: with a Cloudflare API token for the user's domain, switch on Email Routing,
// send the chosen address to this Worker, and switch on Email Sending so it can reply.

const API = 'https://api.cloudflare.com/client/v4';

const PERMISSIONS = [
  { key: 'zone', type: 'read' },
  { key: 'dns', type: 'edit' },
  { key: 'zone_settings', type: 'edit' },
  { key: 'email_routing_rule', type: 'edit' },
  { key: 'email_sending', type: 'edit' },
];

/** Opens Cloudflare's "Create token" form with every permission the setup needs already filled in. */
export const tokenUrl = () =>
  `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(JSON.stringify(PERMISSIONS))}&accountId=*&zoneId=all&name=${encodeURIComponent('Invoice Inbox')}`;

async function cf(token: string, path: string, method = 'GET', body?: unknown): Promise<any> {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!data.success) {
    const err = data.errors?.[0];
    if (res.status === 401 || res.status === 403 || /invalid request headers|authentication|unauthorized/i.test(String(err?.message))) {
      throw new Error("That Cloudflare key didn't work. Create a new one with the link (all permissions are pre-filled) and paste it again.");
    }
    const e = new Error(err?.message || `Cloudflare said ${res.status}`) as Error & { code?: number };
    e.code = err?.code;
    throw e;
  }
  return data.result;
}

const already = (e: any) => /already|exists|duplicate|enabled/i.test(String(e?.message));

export async function setupEmail(env: Env, apiToken: string, address: string, workerName: string): Promise<string> {
  const addr = address.trim().toLowerCase();
  const domain = addr.split('@')[1];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr) || !domain) throw new Error('Enter a full address, like invoices@yourcompany.com.');

  // The domain itself, or its parent zone for addresses on a subdomain.
  const parts = domain.split('.');
  let zone: any = null;
  for (let i = 0; i < parts.length - 1 && !zone; i++) {
    const zones = await cf(apiToken, `/zones?name=${parts.slice(i).join('.')}`);
    zone = zones?.[0] ?? null;
  }
  if (!zone) throw new Error(`${domain} isn't in the Cloudflare account this key belongs to. Add the domain to Cloudflare first.`);

  const routing = await cf(apiToken, `/zones/${zone.id}/email/routing`).catch(() => null);
  if (!routing?.enabled) {
    await cf(apiToken, `/zones/${zone.id}/email/routing/enable`, 'POST', {}).catch((e) => {
      if (!already(e)) throw new Error(`Couldn't switch on email for ${zone.name}: ${e.message}`);
    });
  }

  const rules = (await cf(apiToken, `/zones/${zone.id}/email/routing/rules?per_page=50`).catch(() => [])) as any[];
  const exists = rules?.some((r) => r.matchers?.some((m: any) => m.value?.toLowerCase() === addr));
  if (!exists) {
    await cf(apiToken, `/zones/${zone.id}/email/routing/rules`, 'POST', {
      name: 'Invoice Inbox',
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: addr }],
      actions: [{ type: 'worker', value: [workerName] }],
    });
  }

  await cf(apiToken, `/zones/${zone.id}/email/sending/subdomains`, 'POST', { name: domain }).catch((e) => {
    if (!already(e)) throw new Error(`Email is set up, but replies need Email Sending: ${e.message}`);
  });

  await env.FILES.put('meta/inbox', addr);
  return addr;
}

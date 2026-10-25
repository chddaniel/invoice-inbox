import { docsFor, handleApproval, handleInbound, monthlyPacks, parse, payDoc, sendPack, userByToken } from './core';
import { paidMail, reSubject, send } from './mail';
import { dashboard, landing, notFound } from './pages';
import { mayUse, resolveEnv } from './setup';
import type { Doc, Env } from './types';
import { encrypt } from './util';

const redirect = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export default {
  async fetch(req: Request, rawEnv: Env): Promise<Response> {
    const url = new URL(req.url);
    const env = await resolveEnv(rawEnv, { origin: url.origin });
    const parts = url.pathname.split('/').filter(Boolean);

    if (!parts.length) return landing(env);
    if (parts[0] !== 'u' || !parts[1]) return notFound();

    const user = await userByToken(env, parts[1]);
    if (!user) return notFound();
    const base = `/u/${user.token}`;
    const [, , action, id] = parts;

    if (req.method === 'GET' && !action) {
      const msg = url.searchParams.get('m');
      const flash = msg ? { text: msg, bad: url.searchParams.get('bad') === '1' } : undefined;
      return dashboard(env, user, await docsFor(env, user.id), flash);
    }

    if (req.method === 'GET' && action === 'file' && id) {
      const doc = await env.DB.prepare('SELECT * FROM docs WHERE id = ? AND user_id = ?').bind(id, user.id).first<Doc>();
      if (!doc?.file_key) return notFound();
      const file = await env.FILES.get(doc.file_key, 'arrayBuffer');
      if (!file) return notFound();
      return new Response(file, {
        headers: {
          'content-type': doc.file_type || 'application/octet-stream',
          'content-disposition': `inline; filename="${(doc.file_name || 'invoice').replace(/"/g, '')}"`,
          // Forwarded email bodies are untrusted HTML: no scripts, no outside loads.
          'content-security-policy': "default-src 'none'; img-src data: https:; style-src 'unsafe-inline'",
        },
      });
    }

    if (req.method !== 'POST') return notFound();
    const form = await req.formData();
    const flashTo = (text: string, bad = false) => redirect(`${base}?m=${encodeURIComponent(text)}${bad ? '&bad=1' : ''}`);

    if (action === 'settings') {
      if (form.get('section') === 'accountant') {
        const email = String(form.get('accountant_email') || '').trim().toLowerCase() || null;
        await env.DB.prepare('UPDATE users SET accountant_email = ? WHERE id = ?').bind(email, user.id).run();
        return flashTo(email ? `Saved. ${email} gets your invoices on the 1st.` : 'Accountant removed.');
      }
      const clientId = String(form.get('awx_client_id') || '').trim();
      const apiKey = String(form.get('awx_api_key') || '').trim();
      const awxEnv = form.get('awx_env') === 'production' && env.ALLOW_PRODUCTION === 'true' ? 'production' : 'sandbox';
      if (!clientId) return flashTo('Add your Airwallex Client ID.', true);
      const enc = apiKey ? await encrypt(env.ENC_KEY, apiKey) : user.awx_api_key_enc;
      if (!enc) return flashTo('Add your Airwallex API key.', true);
      await env.DB.prepare('UPDATE users SET awx_client_id = ?, awx_api_key_enc = ?, awx_env = ? WHERE id = ?').bind(clientId, enc, awxEnv, user.id).run();
      return flashTo('Payments connected. Bills now come with "Reply YES to pay".');
    }

    if (action === 'pay' && id) {
      const doc = await env.DB.prepare('SELECT * FROM docs WHERE id = ? AND user_id = ?').bind(id, user.id).first<Doc>();
      if (!doc) return notFound();
      const r = await payDoc(env, user, doc);
      if (!r.ok) return flashTo(`Couldn't pay ${doc.vendor ?? 'it'}: ${r.error}`, true);
      await send(env, { to: user.email, subject: reSubject(doc.subject), inReplyTo: doc.thread_id, ...paidMail(env, user, doc, r.payerPays) }).catch(() => {});
      return flashTo(`Paid ${doc.vendor ?? 'the supplier'} ✅`);
    }

    if (action === 'pack') {
      const month = String(form.get('month') || '');
      try {
        const r = await sendPack(env, user, month);
        return flashTo(`Sent ${r.total} documents to ${user.accountant_email}.`);
      } catch (e: any) {
        return flashTo(String(e?.message ?? e), true);
      }
    }

    return notFound();
  },

  async email(message: ForwardableEmailMessage, rawEnv: Env): Promise<void> {
    const from = (message.from || '').trim().toLowerCase();
    const to = (message.to || '').trim().toLowerCase();
    const env = await resolveEnv(rawEnv, { to: /^pay-/.test(to) ? undefined : to });
    // Never answer ourselves or auto-replies, so two robots can't loop.
    if (!from || from.endsWith(`@${env.MAIL_DOMAIN}`) || /mailer-daemon|postmaster|no-?reply/.test(from)) return;
    // Only you can use your inbox (and your AI key and email quota).
    if (!(await mayUse(env, from))) return;
    if (/auto-(replied|generated)/i.test(message.headers.get('auto-submitted') || '')) return;

    const mail = await parse(message.raw);
    const approval = to.match(/^pay-([a-z0-9]+)@/);
    if (approval) return handleApproval(env, from, approval[1], mail);
    return handleInbound(env, from, mail);
  },

  async scheduled(_event: ScheduledController, rawEnv: Env): Promise<void> {
    await monthlyPacks(await resolveEnv(rawEnv));
  },
};

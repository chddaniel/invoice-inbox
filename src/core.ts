import PostalMime from 'postal-mime';
import { pay, type AwxCreds } from './airwallex';
import { extract, type Source } from './extract';
import { approvalMail, filedMail, paidMail, plainMail, reSubject, send } from './mail';
import type { Bank, Doc, Env, Extracted, Status, User } from './types';
import { decrypt, hasPayableBank, htmlToText, monthKey, monthName, now, replyHead, token } from './util';

const DAILY_LIMIT = 40;
const MAX_DOCS_PER_EMAIL = 5;

// ── users ───────────────────────────────────────────────────────────────────

export async function userByEmail(env: Env, email: string) {
  return env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<User>();
}

export async function userByToken(env: Env, t: string) {
  return env.DB.prepare('SELECT * FROM users WHERE token = ?').bind(t).first<User>();
}

export async function getOrCreateUser(env: Env, email: string): Promise<{ user: User; isNew: boolean }> {
  const existing = await userByEmail(env, email);
  if (existing) return { user: existing, isNew: false };
  const user: User = {
    id: crypto.randomUUID(),
    email,
    token: token(),
    accountant_email: null,
    awx_client_id: null,
    awx_api_key_enc: null,
    awx_env: 'sandbox',
    created_at: now(),
  };
  await env.DB.prepare('INSERT INTO users (id, email, token, awx_env, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(user.id, user.email, user.token, user.awx_env, user.created_at)
    .run();
  return { user, isNew: true };
}

export async function awxCreds(env: Env, user: User): Promise<AwxCreds | null> {
  if (!user.awx_client_id || !user.awx_api_key_enc) return null;
  return { clientId: user.awx_client_id, apiKey: await decrypt(env.ENC_KEY, user.awx_api_key_enc), env: user.awx_env };
}

// ── docs ────────────────────────────────────────────────────────────────────

export async function docsFor(env: Env, userId: string): Promise<Doc[]> {
  const r = await env.DB.prepare('SELECT * FROM docs WHERE user_id = ? ORDER BY COALESCE(doc_date, \'\') DESC, created_at DESC')
    .bind(userId)
    .all<Doc>();
  return r.results;
}

async function saveDoc(env: Env, doc: Doc) {
  await env.DB.prepare(
    `INSERT INTO docs (id, user_id, kind, status, vendor, amount, currency, doc_date, due_date, invoice_number, description,
      category, vendor_json, bank_json, file_key, file_name, file_type, pay_token, subject, thread_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      doc.id, doc.user_id, doc.kind, doc.status, doc.vendor, doc.amount, doc.currency, doc.doc_date, doc.due_date,
      doc.invoice_number, doc.description, doc.category, doc.vendor_json, doc.bank_json, doc.file_key, doc.file_name,
      doc.file_type, doc.pay_token, doc.subject, doc.thread_id, doc.created_at,
    )
    .run();
}

async function setStatus(env: Env, id: string, status: Status, extra: { transfer_id?: string; error?: string | null; paid_at?: number } = {}) {
  await env.DB.prepare('UPDATE docs SET status = ?, transfer_id = COALESCE(?, transfer_id), error = ?, paid_at = COALESCE(?, paid_at) WHERE id = ?')
    .bind(status, extra.transfer_id ?? null, extra.error ?? null, extra.paid_at ?? null, id)
    .run();
}

function toDoc(user: User, x: Extracted, file: { key: string; name: string; type: string }, subject: string, threadId: string | null): Doc {
  const bank: Bank | null = Object.values(x.bank).some(Boolean) ? x.bank : null;
  const payable = x.kind === 'bill' && !x.already_paid;
  const status: Status = payable ? (hasPayableBank(bank) ? 'awaiting_approval' : 'needs_info') : 'filed';
  return {
    id: crypto.randomUUID(),
    user_id: user.id,
    kind: x.kind === 'bill' && x.already_paid ? 'receipt' : x.kind,
    status,
    vendor: x.vendor || null,
    amount: x.amount,
    currency: x.currency,
    doc_date: x.date,
    due_date: x.due_date,
    invoice_number: x.invoice_number,
    description: x.description,
    category: x.category,
    vendor_json: JSON.stringify(x.vendor_address),
    bank_json: bank ? JSON.stringify(bank) : null,
    file_key: file.key,
    file_name: file.name,
    file_type: file.type,
    pay_token: status === 'awaiting_approval' ? token(20) : null,
    transfer_id: null,
    error: null,
    subject,
    thread_id: threadId,
    created_at: now(),
    paid_at: null,
  };
}

// ── inbound email ───────────────────────────────────────────────────────────

interface Parsed {
  subject: string;
  messageId: string | null;
  text: string;
  html: string | null;
  attachments: { filename: string | null; mimeType: string; content: ArrayBuffer; contentId?: string; disposition?: string | null }[];
}

export async function parse(raw: ReadableStream): Promise<Parsed> {
  const mail = await PostalMime.parse(await new Response(raw).arrayBuffer());
  return {
    subject: mail.subject || '',
    messageId: mail.messageId || null,
    text: mail.text || (mail.html ? htmlToText(mail.html) : ''),
    html: mail.html || null,
    attachments: (mail.attachments || []).map((a: any) => ({
      filename: a.filename,
      mimeType: (a.mimeType || '').toLowerCase(),
      content: a.content as ArrayBuffer,
      contentId: a.contentId,
      disposition: a.disposition,
    })),
  };
}

function documentsIn(mail: Parsed): { source: Source; file: { name: string; type: string; bytes: ArrayBuffer | string } }[] {
  const files = mail.attachments.filter((a) => {
    const size = a.content.byteLength;
    if (a.mimeType === 'application/pdf') return size > 500;
    if (/^image\/(png|jpe?g|webp|gif|heic)$/.test(a.mimeType)) {
      // Skip logos and signature images that ride along inline.
      return a.disposition === 'inline' || a.contentId ? size > 40_000 : size > 8_000;
    }
    return false;
  });
  if (files.length) {
    return files.slice(0, MAX_DOCS_PER_EMAIL).map((a) => ({
      source: { type: 'file', bytes: a.content, mime: a.mimeType, filename: a.filename || 'invoice' },
      file: { name: a.filename || 'invoice', type: a.mimeType, bytes: a.content },
    }));
  }
  // No attachment: many SaaS receipts live in the email body itself.
  if (mail.text.trim().length < 60) return [];
  return [
    {
      source: { type: 'text', text: mail.text },
      file: mail.html
        ? { name: 'email.html', type: 'text/html; charset=utf-8', bytes: mail.html }
        : { name: 'email.txt', type: 'text/plain; charset=utf-8', bytes: mail.text },
    },
  ];
}

export async function handleInbound(env: Env, from: string, mail: Parsed) {
  const { user, isNew } = await getOrCreateUser(env, from);
  const replyBase = { to: user.email, subject: reSubject(mail.subject), inReplyTo: mail.messageId };

  const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs WHERE user_id = ? AND created_at > ?')
    .bind(user.id, now() - 86_400_000)
    .first<{ n: number }>();
  if ((today?.n ?? 0) >= DAILY_LIMIT) {
    await send(env, { ...replyBase, ...plainMail(env, user, [`You've hit today's limit of ${DAILY_LIMIT} documents. Send the rest tomorrow.`]) });
    return;
  }

  const found = documentsIn(mail);
  if (!found.length) {
    await send(env, {
      ...replyBase,
      ...plainMail(env, user, [
        "I couldn't find an invoice or receipt in that email.",
        'Forward the email that has the invoice attached (PDF or photo), or the receipt email itself.',
      ]),
    });
    return;
  }

  const context = `Subject: ${mail.subject}\nForwarded by: ${from}\n\n${mail.text.slice(0, 3000)}`;
  const docs: Doc[] = [];
  for (const f of found) {
    try {
      const x = await extract(env, f.source, context);
      const key = `f/${user.id}/${crypto.randomUUID()}`;
      await env.FILES.put(key, f.file.bytes, { metadata: { type: f.file.type, name: f.file.name } });
      const doc = toDoc(user, x, { key, name: f.file.name, type: f.file.type }, mail.subject, mail.messageId);
      await saveDoc(env, doc);
      docs.push(doc);
    } catch (e: any) {
      console.error('extract failed', e?.message);
    }
  }
  if (!docs.length) {
    await send(env, { ...replyBase, ...plainMail(env, user, ["Something went wrong reading that one. Try forwarding it again in a minute."]) });
    return;
  }

  const connected = Boolean(user.awx_client_id && user.awx_api_key_enc);
  const bills = docs.filter((d) => d.status === 'awaiting_approval');
  const rest = docs.filter((d) => d.status !== 'awaiting_approval');

  for (const bill of bills) {
    await send(env, {
      ...replyBase,
      replyTo: `pay-${bill.pay_token}@${env.MAIL_DOMAIN}`,
      ...approvalMail(env, user, bill, connected),
    });
  }
  if (rest.length || isNew) {
    const month = new Date().toISOString().slice(0, 7);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE user_id = ? AND substr(COALESCE(doc_date, ''), 1, 7) = ?")
      .bind(user.id, month)
      .first<{ n: number }>();
    if (rest.length) await send(env, { ...replyBase, ...filedMail(env, user, rest, count?.n ?? rest.length, isNew) });
  }
}

// ── approvals ───────────────────────────────────────────────────────────────

export async function payDoc(env: Env, user: User, doc: Doc): Promise<{ ok: true; payerPays: string | null } | { ok: false; error: string }> {
  if (doc.status === 'paid') return { ok: true, payerPays: null };
  const creds = await awxCreds(env, user);
  if (!creds) return { ok: false, error: 'Connect Airwallex first.' };
  if (creds.env === 'production' && env.ALLOW_PRODUCTION !== 'true') return { ok: false, error: 'This server only pays from an Airwallex sandbox account.' };
  try {
    const r = await pay(creds, doc);
    await setStatus(env, doc.id, 'paid', { transfer_id: r.transferId, paid_at: now(), error: null });
    return { ok: true, payerPays: r.payerPays };
  } catch (e: any) {
    const error = String(e?.message ?? e).slice(0, 300);
    await setStatus(env, doc.id, 'failed', { error });
    return { ok: false, error };
  }
}

export async function handleApproval(env: Env, from: string, payToken: string, mail: Parsed) {
  const doc = await env.DB.prepare('SELECT * FROM docs WHERE pay_token = ?').bind(payToken).first<Doc>();
  if (!doc) return;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(doc.user_id).first<User>();
  // Only the account owner can approve, and only from the address the request went to.
  if (!user || user.email !== from) {
    console.warn('approval from unexpected sender', from);
    return;
  }
  const reply = { to: user.email, subject: reSubject(mail.subject || doc.subject), inReplyTo: mail.messageId };
  const answer = replyHead(mail.text).toLowerCase();

  if (/^\s*(no|nope|cancel|skip|don'?t)\b/.test(answer)) {
    await setStatus(env, doc.id, 'skipped');
    await send(env, { ...reply, ...plainMail(env, user, [`OK, not paying ${doc.vendor ?? 'it'}. It stays filed.`]) });
    return;
  }
  if (!/^\s*(yes|y|yep|yeah|ok|okay|pay|go|approve|approved|do it|👍|✅)/.test(answer)) {
    await send(env, { ...reply, replyTo: `pay-${doc.pay_token}@${env.MAIL_DOMAIN}`, ...plainMail(env, user, ['Reply YES to pay it, or NO to skip.']) });
    return;
  }
  if (doc.status === 'paid') {
    await send(env, { ...reply, ...plainMail(env, user, ['Already paid ✅']) });
    return;
  }

  const r = await payDoc(env, user, doc);
  if (r.ok) {
    await send(env, { ...reply, ...paidMail(env, user, doc, r.payerPays) });
  } else {
    await send(env, { ...reply, replyTo: `pay-${doc.pay_token}@${env.MAIL_DOMAIN}`, ...plainMail(env, user, [`Couldn't pay ${doc.vendor ?? 'it'}: ${r.error}`, 'Fix it on your dashboard, then reply YES again.']) });
  }
}

// ── accountant pack ─────────────────────────────────────────────────────────

const MAX_PACK_BYTES = 4_500_000;

export async function sendPack(env: Env, user: User, month: string): Promise<{ sent: number; total: number }> {
  if (!user.accountant_email) throw new Error('Add your accountant’s email first.');
  const docs = (await docsFor(env, user.id)).filter((d) => monthKey(d.doc_date, d.created_at) === month && d.kind !== 'other');
  const attachments: { content: ArrayBuffer; filename: string; type: string; disposition: 'attachment' }[] = [];
  let bytes = 0;
  const rows = [['Date', 'Vendor', 'Type', 'Amount', 'Currency', 'Invoice #', 'Category', 'Status', 'File']];
  for (const d of docs) {
    let file = '';
    if (d.file_key && !d.file_type?.startsWith('text/')) {
      const buf = await env.FILES.get(d.file_key, 'arrayBuffer');
      if (buf && bytes + buf.byteLength < MAX_PACK_BYTES && attachments.length < 30) {
        bytes += buf.byteLength;
        file = `${d.doc_date ?? ''} ${d.vendor ?? 'doc'} ${d.file_name ?? ''}`.trim().replace(/[^\w.\- ]+/g, '');
        attachments.push({ content: buf, filename: file, type: d.file_type || 'application/pdf', disposition: 'attachment' });
      }
    }
    rows.push([d.doc_date ?? '', d.vendor ?? '', d.kind, String(d.amount ?? ''), d.currency ?? '', d.invoice_number ?? '', d.category ?? '', d.status, file || `${env.APP_URL}/u/${user.token}/file/${d.id}`]);
  }
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  attachments.unshift({ content: new TextEncoder().encode(csv).buffer as ArrayBuffer, filename: `${month} summary.csv`, type: 'text/csv', disposition: 'attachment' });

  const name = monthName(month);
  await env.EMAIL.send({
    from: { email: env.INBOX, name: 'Invoice Inbox' },
    to: user.accountant_email,
    replyTo: user.email,
    subject: `${name}: invoices and receipts for ${user.email}`,
    text: `Hi,\n\nHere are all invoices and receipts for ${name} (${docs.length} documents), plus a CSV summary.\n\nSent automatically on behalf of ${user.email}. Reply to reach them.`,
    html: `<p>Hi,</p><p>Here are all invoices and receipts for <b>${name}</b> (${docs.length} documents), plus a CSV summary.</p><p style="color:#888">Sent automatically on behalf of ${user.email}. Reply to reach them.</p>`,
    attachments,
  });
  return { sent: attachments.length - 1, total: docs.length };
}

export async function monthlyPacks(env: Env) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const month = d.toISOString().slice(0, 7);
  const users = await env.DB.prepare('SELECT * FROM users WHERE accountant_email IS NOT NULL').all<User>();
  for (const u of users.results) {
    try {
      await sendPack(env, u, month);
    } catch (e: any) {
      console.error('pack failed', u.id, e?.message);
    }
  }
}

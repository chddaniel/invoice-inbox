import type { Bank, Doc, Env, User } from './types';
import { esc, maskedAccount, money, niceDate } from './util';

interface Outgoing {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  inReplyTo?: string | null;
  attachments?: { content: ArrayBuffer | string; filename: string; type: string; disposition: 'attachment' }[];
}

export async function send(env: Env, m: Outgoing): Promise<void> {
  const msg: Record<string, unknown> = {
    from: { email: env.INBOX, name: 'Invoice Inbox' },
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    ...(m.attachments?.length ? { attachments: m.attachments } : {}),
  };
  if (m.inReplyTo) {
    // Keeps our reply in the same Gmail thread as the forwarded invoice.
    try {
      await env.EMAIL.send({ ...msg, headers: { 'In-Reply-To': m.inReplyTo, References: m.inReplyTo } });
      return;
    } catch (e: any) {
      if (!String(e?.code ?? '').startsWith('E_HEADER')) throw e;
    }
  }
  await env.EMAIL.send(msg);
}

export const reSubject = (s: string | null | undefined) => {
  const subj = (s || 'Your invoice').trim();
  return /^re:/i.test(subj) ? subj : `Re: ${subj}`;
};

const dash = (env: Env, user: User) => `${env.APP_URL}/u/${user.token}`;

// Same language as the site: a near-black card, a status dot, the amount in big type, white pill buttons.
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif`;
const DOT = { amber: '#f5b83d', green: '#3fcf6e', blue: '#4c8dff', red: '#ff6b5e' };

function card(opts: { dot: keyof typeof DOT; label: string; body: string; footer: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:20px 12px;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;background-color:#0d0d10;background-image:linear-gradient(160deg,#25365c 0%,#0d0d10 46%);border-radius:22px">
<tr><td style="padding:22px 24px 24px;font-family:${FONT};color:#ffffff">
<div style="font-size:13px;color:rgba(255,255,255,.62);margin:0 0 18px">
<span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;border-radius:6px;background:#ffffff;color:#0d0d10;font-size:11px;font-weight:700;vertical-align:middle">i</span>
<span style="vertical-align:middle;margin-left:6px;color:#ffffff;font-weight:600">Invoice Inbox</span>
<span style="vertical-align:middle;margin-left:10px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${DOT[opts.dot]};vertical-align:middle"></span> ${esc(opts.label)}</span></div>
${opts.body}
</td></tr></table>
<p style="font-family:${FONT};font-size:12px;color:#9a9aa0;margin:14px 4px 0">${opts.footer}</p>
</td></tr></table></body></html>`;
}

const big = (s: string) => `<div style="font-size:30px;line-height:1.1;font-weight:600;letter-spacing:-.03em;margin:0 0 6px">${s}</div>`;
const line = (s: string) => `<div style="font-size:14px;line-height:1.5;color:rgba(255,255,255,.62)">${s}</div>`;
const pill = (href: string, label: string, white = true) =>
  `<a href="${esc(href)}" style="display:inline-block;padding:12px 22px;border-radius:999px;font-size:15px;font-weight:600;text-decoration:none;${
    white ? 'background:#ffffff;color:#0d0d10' : 'background:rgba(255,255,255,.12);color:#ffffff;border:1px solid rgba(255,255,255,.2)'
  }">${esc(label)}</a>`;

const rowHtml = (doc: Doc) =>
  `<tr><td style="padding:10px 0;border-top:1px solid rgba(255,255,255,.1);font-family:${FONT}">
<div style="font-size:15px;color:#ffffff;font-weight:500">${esc(doc.vendor || 'Unknown')}</div>
<div style="font-size:13px;color:rgba(255,255,255,.55)">${esc([niceDate(doc.doc_date), doc.category].filter(Boolean).join(' · '))}</div></td>
<td align="right" style="padding:10px 0;border-top:1px solid rgba(255,255,255,.1);font-family:${FONT};font-size:15px;color:#ffffff;font-weight:600;white-space:nowrap">${esc(money(doc.amount, doc.currency))}</td></tr>`;
const rowText = (doc: Doc) =>
  `${doc.vendor || 'Unknown'} · ${money(doc.amount, doc.currency)}${doc.doc_date ? ` · ${niceDate(doc.doc_date)}` : ''}${doc.category ? ` · ${doc.category}` : ''}`;

export function filedMail(env: Env, user: User, docs: Doc[], monthCount: number, isNew: boolean) {
  const link = dash(env, user);
  const html = card({
    dot: 'blue',
    label: `Filed${isNew ? ' · welcome' : ''}`,
    body: `${big(docs.length === 1 ? 'Filed ✓' : `${docs.length} filed ✓`)}
${line(`${monthCount} ${monthCount === 1 ? 'document' : 'documents'} this month.${user.accountant_email ? ' Your accountant gets them on the 1st.' : ''}`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 18px">${docs.map(rowHtml).join('')}</table>
${pill(link, 'See everything')}
${isNew ? `<div style="font-size:13px;color:rgba(255,255,255,.55);margin-top:16px">Keep forwarding invoices and receipts to ${esc(env.INBOX)}. That's the whole app.</div>` : ''}`,
    footer: 'Invoice Inbox · forward invoices, get them filed and paid',
  });
  const text = `${isNew ? `Welcome. Keep forwarding invoices and receipts to ${env.INBOX}.\n\n` : ''}${docs
    .map((d) => `Filed: ${rowText(d)}`)
    .join('\n')}\n\n${monthCount} documents filed this month.\n\nSee everything: ${link}`;
  return { html, text };
}

export function approvalMail(env: Env, user: User, doc: Doc, connected: boolean) {
  const bank = JSON.parse(doc.bank_json || 'null') as Bank | null;
  const link = dash(env, user);
  const amount = money(doc.amount, doc.currency);
  const details = [doc.invoice_number ? `Invoice ${doc.invoice_number}` : '', doc.due_date ? `due ${niceDate(doc.due_date)}` : ''].filter(Boolean).join(' · ');
  const yes = `mailto:pay-${doc.pay_token}@${env.MAIL_DOMAIN}?subject=${encodeURIComponent(reSubject(doc.subject))}&body=YES`;
  const html = card({
    dot: 'amber',
    label: 'Needs your YES',
    body: `<div style="font-size:16px;color:rgba(255,255,255,.75);margin:0 0 4px">${esc(doc.vendor || 'A supplier')} wants</div>
${big(esc(amount))}
${details ? line(esc(details)) : ''}
${bank ? line(`Pays to ${esc(maskedAccount(bank))}`) : ''}
<div style="margin:22px 0 0">${
      connected
        ? `<div style="font-size:18px;font-weight:600;margin:0 0 14px">Reply YES to pay it.</div>${pill(yes, `Pay ${amount}`)}&nbsp;&nbsp;${pill(link, 'Open', false)}`
        : `<div style="font-size:15px;margin:0 0 14px">Connect your payment account once, then reply YES.</div>${pill(`${link}#airwallex`, 'Connect payments')}`
    }</div>
<div style="font-size:13px;color:rgba(255,255,255,.55);margin-top:18px">Already filed for your accountant.</div>`,
    footer: 'Nothing is paid until you say YES.',
  });
  const text = `${doc.vendor || 'A supplier'} wants ${amount}
${details}
${bank ? `Pays to ${maskedAccount(bank)}` : ''}

${connected ? 'Reply YES to pay it.' : `Connect your payment account at ${link}#airwallex, then reply YES.`}

See everything: ${link}`;
  return { html, text };
}

export function paidMail(env: Env, user: User, doc: Doc, payerPays: string | null) {
  const link = dash(env, user);
  const html = card({
    dot: 'green',
    label: 'Paid',
    body: `<div style="font-size:16px;color:rgba(255,255,255,.75);margin:0 0 4px">Paid to ${esc(doc.vendor || 'the supplier')}</div>
${big(`${esc(money(doc.amount, doc.currency))} ✓`)}
${line(`Sent from your Airwallex account${payerPays ? ` · you paid ${esc(payerPays)}` : ''}${doc.invoice_number ? ` · ref ${esc(doc.invoice_number)}` : ''}`)}
<div style="margin:22px 0 0">${pill(link, 'See everything')}</div>
<div style="font-size:13px;color:rgba(255,255,255,.55);margin-top:18px">Invoice and payment are filed together for your accountant.</div>`,
    footer: 'Invoice Inbox',
  });
  const text = `Paid ${money(doc.amount, doc.currency)} to ${doc.vendor || 'the supplier'}.${payerPays ? ` You paid ${payerPays}.` : ''}\n\nSee everything: ${link}`;
  return { html, text };
}

export function plainMail(env: Env, user: User | null, lines: string[]) {
  const link = user ? dash(env, user) : env.APP_URL;
  return {
    html: card({
      dot: 'blue',
      label: 'Invoice Inbox',
      body: `${lines.map((l) => `<div style="font-size:16px;line-height:1.5;margin:0 0 10px">${esc(l)}</div>`).join('')}<div style="margin-top:16px">${pill(link, 'Open dashboard')}</div>`,
      footer: 'Invoice Inbox',
    }),
    text: `${lines.join('\n\n')}\n\n${link}`,
  };
}

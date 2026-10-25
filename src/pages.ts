import type { Doc, Env, User } from './types';
import { esc, money, monthKey, monthName, niceDate } from './util';

// Look and feel: near-black canvas, a soft dusk-sky glow,
// white pill buttons, frosted glass cards, amber = needs you, green = done.
const CSS = `
:root{--bg:#09090a;--fg:#fff;--t70:rgba(255,255,255,.7);--t55:rgba(255,255,255,.55);--t40:rgba(255,255,255,.4);
--line:rgba(255,255,255,.09);--card:#111113;--card2:#161618;--glass:rgba(255,255,255,.1);--glassline:rgba(255,255,255,.18);
--amber:#f5b83d;--green:#3fcf6e;--blue:#4c8dff;--red:#ff6b5e;
--display:"Geist","Inter",ui-sans-serif,-apple-system,sans-serif;--body:"Inter",ui-sans-serif,-apple-system,BlinkMacSystemFont,sans-serif;--mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 var(--body);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}
.narrow{max-width:860px}

/* nav */
.nav{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:20;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 14px;border-radius:999px;background:rgba(20,20,22,.55);border:1px solid var(--glassline);backdrop-filter:blur(18px) saturate(1.4);-webkit-backdrop-filter:blur(18px) saturate(1.4);white-space:nowrap}
.nav .links a{color:var(--t70);font-size:14px;padding:6px 10px}
.nav .links a:hover{color:#fff}
.logo{display:inline-flex;align-items:center;gap:8px;font:600 16px var(--display);letter-spacing:-.02em;margin-right:6px}
.mark{width:22px;height:22px;border-radius:7px;background:linear-gradient(160deg,#fff 0%,#dfe6f5 100%);display:grid;place-items:center;color:#09090a}
.mark svg{width:13px;height:13px}

/* buttons */
.pill{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;font:500 15px var(--body);padding:12px 22px;border:0;cursor:pointer;transition:transform .15s ease,background .15s ease}
.pill:active{transform:scale(.98)}
.pill.white{background:#fff;color:#09090a}
.pill.glass{background:rgba(255,255,255,.12);color:#fff;border:1px solid var(--glassline);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.pill.small{padding:8px 14px;font-size:14px}
.pill.lg{padding:15px 30px;font-size:16px;min-width:240px}

/* hero */
.hero{position:relative;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:120px 16px 80px;overflow:hidden}
.sky{position:absolute;inset:0;z-index:-1;background:
 radial-gradient(70% 55% at 18% 8%,rgba(40,70,140,.95) 0%,transparent 70%),
 radial-gradient(55% 45% at 88% 12%,rgba(205,215,236,.85) 0%,transparent 70%),
 radial-gradient(60% 45% at 78% 78%,rgba(232,160,135,.9) 0%,transparent 70%),
 radial-gradient(70% 50% at 12% 82%,rgba(130,86,128,.85) 0%,transparent 70%),
 linear-gradient(180deg,#26375e 0%,#4a5c88 38%,#8f7596 70%,#c99282 92%);filter:blur(2px)}
.sky:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 62%,var(--bg) 100%),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.08'/%3E%3C/svg%3E")}
.hero h1{font:500 clamp(40px,6.4vw,72px)/1.02 var(--display);letter-spacing:-.045em;margin:0;text-shadow:0 2px 30px rgba(10,20,50,.25)}
.hero p.sub{font-size:clamp(16px,1.6vw,19px);color:rgba(255,255,255,.78);max-width:560px;margin:22px auto 0}
.ctas{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:34px}
.fine{margin-top:16px;color:var(--t55);font-size:14px}
.fine a{border-bottom:1px solid var(--t40)}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:4px 10px;border-radius:999px;background:rgba(9,9,10,.55);border:1px solid var(--glassline);color:rgba(255,255,255,.85);margin-bottom:22px}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);display:inline-block}
.dot.amber{background:var(--amber)}.dot.blue{background:var(--blue)}.dot.red{background:var(--red)}.dot.grey{background:var(--t40)}

/* product card in hero */
.demo{margin:64px auto 0;width:min(560px,100%);text-align:left;display:grid;gap:10px}
.glasscard{background:rgba(22,24,34,.42);border:1px solid var(--glassline);border-radius:22px;padding:18px 20px;backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3);box-shadow:0 20px 60px rgba(5,10,30,.25)}
.from{display:flex;align-items:center;gap:8px;color:var(--t70);font-size:13px}
.from .mark{width:18px;height:18px;border-radius:6px}.from .mark svg{width:11px;height:11px}
.big{font:500 22px/1.25 var(--display);letter-spacing:-.02em;margin:10px 0 4px}
.meta{color:var(--t55);font-size:14px}
.reply{justify-self:end;background:#fff;color:#09090a;border-radius:18px 18px 6px 18px;padding:9px 16px;font-weight:600}
.done{display:flex;align-items:center;gap:10px}

/* sections */
section.block{padding:90px 0 0}
.eyebrow{font-size:13px;color:var(--t55);text-align:center;margin:0 0 10px}
h2.title{font:500 clamp(30px,4vw,44px)/1.08 var(--display);letter-spacing:-.04em;text-align:center;margin:0 0 40px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.step{background:var(--card);border:1px solid var(--line);border-radius:26px;padding:8px}
.art{height:220px;border-radius:20px;position:relative;overflow:hidden;display:grid;place-items:center;padding:20px}
.art.a1{background:radial-gradient(80% 70% at 30% 20%,#3a5ea8,transparent 70%),radial-gradient(70% 60% at 80% 90%,#1d2f5c,transparent 70%),#1b2748}
.art.a2{background:radial-gradient(80% 70% at 70% 20%,#c9d3ea,transparent 65%),radial-gradient(80% 70% at 20% 90%,#d99a83,transparent 70%),#6e6a8f}
.art.a3{background:radial-gradient(80% 70% at 30% 30%,#8b5a86,transparent 70%),radial-gradient(70% 60% at 80% 80%,#e6a184,transparent 70%),#4b3c62}
.art .glasscard{width:100%;padding:14px 16px;border-radius:18px}
.step .txt{padding:18px 16px 16px}
.step h3{display:flex;align-items:center;gap:10px;font:500 20px var(--display);letter-spacing:-.02em;margin:0 0 8px}
.num{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:600 12px var(--body);background:rgba(255,255,255,.12);color:#fff}
.step p{margin:0;color:var(--t55)}.step p b{color:var(--t70);font-weight:400}
.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:28px;margin-top:70px}
.ic{width:34px;height:34px;border-radius:10px;border:1px solid var(--line);background:var(--card2);display:grid;place-items:center;margin-bottom:14px}
.ic svg{width:16px;height:16px;stroke:#fff;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.features b{display:block;font-weight:500;margin-bottom:4px}.features span{color:var(--t55);font-size:14px}
.cta-end{text-align:center;padding:100px 0 30px}
footer{color:var(--t40);font-size:13px;text-align:center;padding:30px 0 50px}

/* dashboard */
.dash-hero{position:relative;padding:110px 0 30px;overflow:hidden}
.dash-hero .sky{opacity:.6;-webkit-mask-image:linear-gradient(180deg,#000 35%,transparent 100%);mask-image:linear-gradient(180deg,#000 35%,transparent 100%)}
.dash-hero .sky:after{background:none}
.dash-hero h1{font:500 clamp(30px,4.6vw,46px)/1.05 var(--display);letter-spacing:-.04em;margin:0}
.addr{display:inline-flex;align-items:center;gap:10px;margin-top:18px;padding:6px 6px 6px 18px;border-radius:999px;background:rgba(9,9,10,.45);border:1px solid var(--glassline);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);font:500 16px var(--mono)}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:28px}
.stat{background:rgba(17,17,19,.72);border:1px solid var(--line);border-radius:20px;padding:18px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.stat .n{font:500 28px/1.1 var(--display);letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.stat .l{display:flex;align-items:center;gap:7px;color:var(--t55);font-size:13px;margin-top:8px}
.month{margin-top:34px}.month h3{display:flex;justify-content:space-between;align-items:center;font:500 14px var(--body);color:var(--t55);margin:0 0 10px;padding:0 4px}
.list{background:var(--card);border:1px solid var(--line);border-radius:22px;overflow:hidden}
.item{display:grid;grid-template-columns:auto 1fr auto;gap:4px 14px;padding:14px 16px;border-top:1px solid var(--line);align-items:center}
.item:first-child{border-top:0}
.av{width:36px;height:36px;border-radius:11px;display:grid;place-items:center;font:600 14px var(--display);background:var(--card2);border:1px solid var(--line)}
.v{font-weight:500}.sub2{color:var(--t55);font-size:13px}
.right{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
.amt{font:500 16px var(--display);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.status{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--t70);padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid var(--line)}
.view{color:var(--t55);font-size:13px}.view:hover{color:#fff}
.item form{display:inline}
.empty{padding:40px 16px;color:var(--t55);text-align:center}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:20px;margin-top:12px}
h2.sec{font:500 22px var(--display);letter-spacing:-.02em;margin:48px 0 4px}
label{display:block;font-size:13px;color:var(--t55);margin:12px 0 6px}
input,select{width:100%;font:inherit;padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:#0c0c0e;color:#fff;outline:none}
input:focus,select:focus{border-color:rgba(255,255,255,.3)}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:end}.row>*{flex:1 1 200px}
.note{font-size:13px;color:var(--t55);margin:10px 0 0}
.flash{display:flex;align-items:center;gap:10px;margin-top:22px;padding:12px 16px;border-radius:16px;background:rgba(63,207,110,.1);border:1px solid rgba(63,207,110,.25)}
.flash.bad{background:rgba(255,107,94,.1);border-color:rgba(255,107,94,.3)}
@media (max-width:640px){.nav .links{display:none}.item{grid-template-columns:auto 1fr}.item .right{grid-column:1/-1;justify-content:flex-start}.pill.lg{min-width:0;width:100%}}
`;

const MARK = `<span class="mark"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2.5h8v11l-2-1.2-2 1.2-2-1.2-2 1.2z"/><path d="M6 6h4M6 8.6h4"/></svg></span>`;

const ICON = {
  doc: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 10h16"/></svg>',
  code: '<svg viewBox="0 0 24 24"><path d="M9 8l-4 4 4 4M15 8l4 4-4 4"/></svg>',
};

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="Forward invoices to an email address. Get them filed for your accountant and paid when you reply YES.">
<meta name="theme-color" content="#09090a">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧾</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>${body}
<script>document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();navigator.clipboard.writeText(b.dataset.copy);const t=b.innerHTML;b.textContent='Copied ✓';setTimeout(()=>b.innerHTML=t,1300)}))</script>
</body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
}

const deployUrl = (env: Env) => `https://deploy.workers.cloudflare.com/?url=${encodeURIComponent(env.GITHUB_URL)}`;

const nav = (env: Env) => `<nav class="nav"><a class="logo" href="/">${MARK} Invoice Inbox</a>
<a class="pill white small" href="${esc(deployUrl(env))}">Deploy free →</a></nav>`;

export function landing(env: Env): Response {
  return page(
    'Invoice Inbox · forward your invoices, get them filed and paid',
    `${nav(env)}
<header class="hero"><div class="sky"></div>
  <span class="badge"><span class="dot"></span> Free and open source</span>
  <h1>Forward your invoices.<br>That's it.</h1>
  <p class="sub">It files every invoice and receipt for your accountant. When a supplier needs paying, it asks you. Reply YES and it's paid in Airwallex.</p>
  <div class="ctas">
    <a class="pill white lg" href="${esc(deployUrl(env))}">Deploy free →</a>
    <a class="pill glass lg" href="#how">See how it works</a>
  </div>
  <p class="fine">Free and open source. One click puts your own copy on Cloudflare, then pick an address like invoices@yourcompany.com · <a href="${esc(env.GITHUB_URL)}">Code</a></p>
  <div class="demo">
    <div class="glasscard">
      <div class="from">${MARK} Invoice Inbox · just now <span style="margin-left:auto" class="dot amber"></span></div>
      <div class="big">Northwind Studio wants €1,200.00</div>
      <div class="meta">Invoice INV-2026-041 · due 7 Nov · IBAN DE89 •••• 3000</div>
      <div style="margin-top:10px;font-weight:500">Reply YES to pay it.</div>
    </div>
    <div class="reply">YES</div>
    <div class="glasscard done"><span class="dot"></span><div><b style="font-weight:500">Paid €1,200.00 to Northwind Studio</b><div class="meta">Paid in Airwallex · filed for your accountant</div></div></div>
  </div>
</header>

<main class="wrap">
  <section class="block" id="how">
    <p class="eyebrow">How it works</p>
    <h2 class="title">Three steps. Two of them are email.</h2>
    <div class="steps">
      <div class="step"><div class="art a1"><div class="glasscard"><div class="from">Fwd: Invoice INV-2026-041</div><div class="meta" style="margin-top:6px">To: invoices@yourcompany.com</div><div class="meta">📎 INV-2026-041.pdf</div></div></div>
        <div class="txt"><h3><span class="num">1</span>Forward it</h3><p>PDF, photo, or the receipt email itself.<br><b>It reads the vendor, amount, date and bank details.</b></p></div></div>
      <div class="step"><div class="art a2"><div class="glasscard"><div class="from"><span class="dot amber"></span> Needs your YES</div><div class="big" style="font-size:18px">Northwind Studio · €1,200</div><div class="meta">Reply YES to pay</div></div></div>
        <div class="txt"><h3><span class="num">2</span>Reply YES</h3><p>Bills come back as one short email.<br><b>Just say yes, and the supplier is paid in Airwallex.</b></p></div></div>
      <div class="step"><div class="art a3"><div class="glasscard"><div class="from"><span class="dot"></span> Sent to your accountant</div><div class="big" style="font-size:18px">October 2026</div><div class="meta">14 invoices · 1 CSV</div></div></div>
        <div class="txt"><h3><span class="num">3</span>Accountant done</h3><p>On the 1st, last month goes out in one email.<br><b>No more hunting for receipts.</b></p></div></div>
    </div>
    <div class="features" id="trust">
      <div><div class="ic">${ICON.shield}</div><b>Never pays without you</b><span>Every payment waits for your YES, from your own address.</span></div>
      <div><div class="ic">${ICON.doc}</div><b>Reads anything</b><span>PDFs, phone photos, and SaaS receipts that only live in the email.</span></div>
      <div><div class="ic">${ICON.cal}</div><b>Sorted by month</b><span>One page with every document, what's paid and what's waiting.</span></div>
      <div><div class="ic">${ICON.code}</div><b>Yours, free</b><span>One click to your own Cloudflare. Bring your own AI key, a few cents a month.</span></div>
    </div>
  </section>
  <div class="cta-end">
    <h2 class="title" style="margin-bottom:28px">Stop chasing receipts.</h2>
    <div class="ctas"><a class="pill white lg" href="${esc(deployUrl(env))}">Deploy free →</a></div>
    <p class="fine">Free, MIT licensed. Your invoices stay in your own Cloudflare account · <a href="${esc(env.GITHUB_URL)}">Code</a></p>
  </div>
</main>
<footer>Invoice Inbox · open source · nothing is paid until you say yes</footer>`,
  );
}

function statusOf(doc: Doc): string {
  const s = (dot: string, label: string, title = '') => `<span class="status"${title ? ` title="${esc(title)}"` : ''}><span class="dot ${dot}"></span>${label}</span>`;
  switch (doc.status) {
    case 'paid':
      return s('', 'Paid');
    case 'awaiting_approval':
      return s('amber', 'Needs your YES');
    case 'needs_info':
      return s('amber', 'No bank details');
    case 'failed':
      return s('red', 'Payment failed', doc.error ?? '');
    case 'skipped':
      return s('grey', 'Skipped');
    default:
      return s('blue', doc.kind === 'sales_invoice' ? 'Sales invoice' : 'Filed');
  }
}

export function dashboard(env: Env, user: User, docs: Doc[], flash?: { text: string; bad?: boolean }): Response {
  const base = `/u/${user.token}`;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const inMonth = docs.filter((d) => monthKey(d.doc_date, d.created_at) === thisMonth);
  const toPay = docs.filter((d) => d.status === 'awaiting_approval');
  const paid = docs.filter((d) => d.status === 'paid');
  const spentByCur = new Map<string, number>();
  for (const d of inMonth) if (d.kind !== 'sales_invoice' && d.amount != null) spentByCur.set(d.currency || 'USD', (spentByCur.get(d.currency || 'USD') ?? 0) + d.amount);
  const spent = [...spentByCur].map(([c, a]) => money(a, c)).join(' + ') || money(0, 'USD');

  const months = new Map<string, Doc[]>();
  for (const d of docs) {
    const k = monthKey(d.doc_date, d.created_at);
    months.set(k, [...(months.get(k) ?? []), d]);
  }
  const connected = Boolean(user.awx_client_id && user.awx_api_key_enc);

  const list = [...months]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(
      ([k, items]) => `<section class="month"><h3><span>${esc(monthName(k))} · ${items.length} ${items.length === 1 ? 'document' : 'documents'}</span>${
        user.accountant_email
          ? `<form method="post" action="${base}/pack"><input type="hidden" name="month" value="${k}"><button class="pill glass small" style="background:var(--card2)">Send to accountant</button></form>`
          : ''
      }</h3><div class="list">${items
        .map(
          (d) => `<div class="item"><div class="av">${esc((d.vendor || '?').trim().charAt(0).toUpperCase())}</div><div><div class="v">${esc(d.vendor || 'Unknown')}</div><div class="sub2">${esc(
            [niceDate(d.doc_date), d.category, d.invoice_number ? `#${d.invoice_number}` : '', d.due_date && d.status === 'awaiting_approval' ? `due ${niceDate(d.due_date)}` : '']
              .filter(Boolean)
              .join(' · '),
          )}</div></div>
<div class="right"><span class="amt">${esc(money(d.amount, d.currency))}</span>${statusOf(d)}${
            d.status === 'awaiting_approval' || d.status === 'failed'
              ? connected
                ? `<form method="post" action="${base}/pay/${d.id}"><button class="pill white small">Pay</button></form>`
                : `<a class="pill white small" href="#airwallex">Connect to pay</a>`
              : ''
          }${d.file_key ? `<a class="view" href="${base}/file/${d.id}" target="_blank">View</a>` : ''}</div></div>`,
        )
        .join('')}</div></section>`,
    )
    .join('');

  return page(
    'Your invoices · Invoice Inbox',
    `${nav(env)}
<header class="dash-hero"><div class="sky"></div><div class="wrap narrow">
  ${flash ? `<div class="flash${flash.bad ? ' bad' : ''}"><span class="dot${flash.bad ? ' red' : ''}"></span>${esc(flash.text)}</div>` : ''}
  <h1 style="margin-top:${flash ? 22 : 0}px">Your invoices</h1>
  <button class="addr" data-copy="${esc(env.INBOX)}" style="color:#fff;cursor:pointer">${esc(env.INBOX)} <span class="pill white small">Copy</span></button>
  <p class="note">Forward from ${esc(user.email)}. Tip: a Gmail filter can auto-forward anything with "invoice" or "receipt".</p>
  <div class="stats">
    <div class="stat"><div class="n">${esc(spent)}</div><div class="l"><span class="dot blue"></span>spent this month</div></div>
    <div class="stat"><div class="n">${inMonth.length}</div><div class="l"><span class="dot grey"></span>filed this month</div></div>
    <div class="stat"><div class="n">${toPay.length}</div><div class="l"><span class="dot amber"></span>need your YES</div></div>
    <div class="stat"><div class="n">${paid.length}</div><div class="l"><span class="dot"></span>paid</div></div>
  </div>
</div></header>
<main class="wrap narrow">
${list || `<div class="list" style="margin-top:20px"><div class="empty">Nothing yet. Forward your first invoice to ${esc(env.INBOX)}</div></div>`}
<h2 class="sec">Accountant</h2>
<form class="card" method="post" action="${base}/settings">
  <input type="hidden" name="section" value="accountant">
  <div class="row"><div><label>Accountant's email</label><input type="email" name="accountant_email" value="${esc(user.accountant_email)}" placeholder="accountant@example.com"></div><div style="flex:0 0 auto"><button class="pill white">Save</button></div></div>
  <p class="note">On the 1st of every month they get last month's invoices and receipts, with a CSV.</p>
</form>
<h2 class="sec" id="airwallex">Payments</h2>
<form class="card" method="post" action="${base}/settings">
  <input type="hidden" name="section" value="airwallex">
  ${connected ? `<p style="margin:0 0 4px" class="status"><span class="dot"></span>Connected · ${esc(user.awx_env)}</p>` : '<p class="note" style="margin:0">Connect once. After that, bills come with "Reply YES to pay".</p>'}
  <div class="row">
    <div><label>Client ID</label><input name="awx_client_id" value="${esc(user.awx_client_id)}" autocomplete="off"></div>
    <div><label>API key</label><input name="awx_api_key" type="password" placeholder="${connected ? 'Saved · paste to replace' : ''}" autocomplete="off"></div>
    <div style="flex:0 0 140px"><label>Account</label><select name="awx_env"><option value="sandbox">Sandbox</option>${env.ALLOW_PRODUCTION === 'true' ? `<option value="production"${user.awx_env === 'production' ? ' selected' : ''}>Live</option>` : ''}</select></div>
    <div style="flex:0 0 auto"><button class="pill white">${connected ? 'Update' : 'Connect'}</button></div>
  </div>
  <p class="note">Connect your Airwallex account (Developer → API keys). Your key is encrypted. Nothing is ever paid without your YES.</p>
</form>
</main>
<footer>Keep this link private, it's your login · <a href="${esc(env.GITHUB_URL)}">Open source</a></footer>`,
  );
}

export function notFound(): Response {
  return page('Not found · Invoice Inbox', '<header class="hero" style="min-height:70vh"><div class="sky"></div><h1>Not found</h1><p class="sub">That link doesn’t exist.</p></header>', 404);
}

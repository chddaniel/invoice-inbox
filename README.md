# Invoice Inbox

Forward your invoices to an email address. That's it.

- It reads every invoice and receipt you forward (PDF, photo, or the email itself) and files it by month: vendor, amount, date, category.
- When a supplier invoice needs paying, it emails you: *"Northwind Studio wants €1,200. Reply YES to pay it."*
- Just say yes, and the supplier is paid in Airwallex. Nothing is ever paid without your yes.
- On the 1st of every month, your accountant gets last month's invoices and receipts, with a CSV.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chddaniel/invoice-inbox)

## Set it up (about 10 minutes, no code)

You need a Cloudflare account (free), a domain on Cloudflare, and an [OpenAI API key](https://platform.openai.com/api-keys) (reading invoices costs a few cents a month).

1. **Click "Deploy to Cloudflare"** above. Sign in, paste your OpenAI key when asked, and press Deploy.
2. **Give it an email address.** In Cloudflare, open your domain → **Email** → **Email Routing** and turn it on. Under **Routing rules**, create an address like `invoices@yourcompany.com` and set the action to **Send to a Worker** → `invoice-inbox`.
3. **Let it reply.** In Cloudflare → **Email Service** → **Email Sending**, turn sending on for the same domain.
4. **Forward your first invoice** to that address. You get a reply with your private dashboard link. Whoever forwards the first invoice owns the inbox; nobody else can use it.
5. **To pay suppliers**, open the dashboard → **Payments** and paste your Airwallex Client ID and API key (Airwallex → Developer → API keys).

It starts on the Airwallex sandbox, so you can try the whole flow with test money. To pay for real, set `ALLOW_PRODUCTION` to `"true"` in the Worker's settings.

## How it works

One Cloudflare Worker, nothing else to run.

| Piece | What it does |
| --- | --- |
| Email Routing | sends your invoice address to the Worker |
| OpenAI (`gpt-4.1-mini`) | reads the PDF, photo or email into vendor, amount, dates and bank details |
| D1 + KV | your documents and the original files, in your own account |
| Airwallex API | adds the supplier as a payee and sends the transfer, after your YES |
| Email Sending | the "Reply YES" emails, confirmations and the accountant pack |

Each payment request goes out with a one-time reply address, and only the inbox owner's address can approve it.

## For developers

```bash
git clone https://github.com/chddaniel/invoice-inbox && cd invoice-inbox
npm install
npx wrangler secret put OPENAI_API_KEY
npm run deploy
```

The database tables and the encryption key for stored API keys are created on first use. Optional vars: `ALLOWED_SENDERS` (comma-separated addresses), `APP_URL`, `INBOX`.

## License

MIT

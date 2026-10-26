# Invoice Inbox

Forward your invoices to an email address. That's it.

- It reads every invoice and receipt you forward (PDF, photo, or the email itself) and files it by month: vendor, amount, date, category.
- When a supplier invoice needs paying, it emails you: *"Northwind Studio wants €1,200. Reply YES to pay it."*
- Just say yes, and the supplier is paid. Nothing is ever paid without your yes.
- On the 1st of every month, your accountant gets last month's invoices and receipts, with a CSV.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/chddaniel/invoice-inbox)

## Set it up (about 5 minutes, no code)

You need a free Cloudflare account and an [OpenAI API key](https://platform.openai.com/api-keys) (reading invoices costs a few cents a month).

1. **Click "Deploy to Cloudflare"** above. Sign in, paste your OpenAI key when asked, and press Deploy.
2. **Open your new site** and enter your email. That opens your private dashboard, and you're the owner. Bookmark it.
3. **Drop an invoice** on the dashboard. It works right away, no email needed.
4. **Optional, get an invoice address** like `invoices@yourcompany.com` (needs a domain on Cloudflare): on the dashboard, click "create one" for the Cloudflare key (everything is pre-filled), paste it with your address, and press Set up. Then you can forward invoices to it and reply YES to pay.
5. **To pay suppliers**, open the dashboard → **Payments** and paste your Airwallex Client ID and API key (Airwallex → Developer → API keys).

It starts on the Airwallex sandbox, so you can try the whole flow with test money. To pay for real, set `ALLOW_PRODUCTION` to `"true"` in the Worker's settings.

## How it works

One Cloudflare Worker, nothing else to run.

| Piece | What it does |
| --- | --- |
| Email Routing | sends your invoice address to the Worker (set up for you from the dashboard) |
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

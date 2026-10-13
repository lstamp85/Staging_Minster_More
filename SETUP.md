# Minster More — going live

The site is now a small Node app: the public site, a `/admin` area for the committee, Stripe for payments and Supabase for the database. Railway still hosts it.

## 1. Replace the files in GitHub

Delete everything in the `Staging_Minster_More` repo, then upload the contents of this folder, keeping the folders:

```
server.js
package.json
package-lock.json
railway.json
.gitignore
supabase/schema.sql
public/index.html
public/admin.html
public/assets/Minster-More-brand-and-mission.pdf
```

Don't upload `node_modules` (Railway installs it).

## 2. Supabase (database, logins, file storage)

1. Create a new project at supabase.com called **minster-more**, region **London (eu-west-2)**.
2. **SQL Editor → New query**, paste all of `supabase/schema.sql`, click **Run**. This creates the tables, security rules and a `files` storage bucket, and makes **hello@minstermore.org.uk** the first admin.
3. **Authentication → URL Configuration**:
   - Site URL: `https://minstermore.org.uk` (or your Railway URL until the domain is pointed)
   - Redirect URLs: add `https://minstermore.org.uk/admin` (and the Railway URL + `/admin`)
4. **Authentication → Emails → Magic Link**: set the subject to "Your Minster More login code" and replace the body with:
   `<h2>Your Minster More login code</h2><p>Enter this code on the committee login page:</p><p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p><p>It expires in one hour.</p>`
   (A code is used instead of a link because work email systems often open links automatically, which uses them up.)
5. **Project Settings → API**: copy the **Project URL**, the **anon public** key and the **service_role** key for step 4.

## 3. Stripe (payments)

1. Create a Stripe account for the charity (stripe.com). Apply for Stripe's charity pricing by emailing them your charity number (516332).
2. **Developers → API keys**: copy the **Secret key** (`sk_live_…`). Use the test key (`sk_test_…`) first if you want to try a dummy payment.
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://minstermore.org.uk/api/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `invoice.paid`
   - Copy the **Signing secret** (`whsec_…`).
4. **Settings → Customer emails**: turn on receipts for successful payments.
5. **Settings → Billing → Customer portal**: turn it on so Future Makers can cancel themselves.

## 4. Railway variables

In the Railway service → **Variables**, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_ANON_KEY` | Supabase anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service_role key (keep secret) |
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `SITE_URL` | `https://minstermore.org.uk` |

Railway redeploys automatically. Without the Stripe keys, the site still works but shows "email us" instead of payment buttons.

## 5. First login

Go to `/admin`, enter `hello@minstermore.org.uk`, and click the link in the email. Then:

1. **Totaliser** — add the opening balance (the brand document mentions £9,000 in the current pot).
2. **Admins** — add each committee member's email.
3. **Funding priorities, Events, Committee, Documents** — add the real content.
4. **Settings** — paste the easyfundraising and Co-op links, and set the 50:50 term name when entries open.

## How things flow

- **Donations and Future Makers** are added to the totaliser automatically when Stripe confirms payment. Monthly renewals are too.
- **Tickets and 50:50 numbers** are recorded (Events → Attendees, 50:50 Club) but are *not* added to the totaliser. Add the profit by hand after each event or draw.
- **Suggestions** wait in Suggestions → Pending until an admin approves them.
- **Gift Aid** declarations are collected at checkout. Gift Aid → Export gives a CSV laid out for HMRC's Charities Online claim sheet.
- **New Future Makers** who give a name appear in Supporters wall as "Awaiting approval".
- **Refunds and cancellations** are done in the Stripe dashboard. If you refund a donation, delete or correct its totaliser entry.

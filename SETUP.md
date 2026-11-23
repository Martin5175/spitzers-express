# Spitzer's Express app: setup guide

Setup takes about an hour, plus a few days for the texting approval in step 4. You need a computer for setup. The driver only ever uses his phone.

You'll create five free or cheap accounts and copy a few keys into one place (Vercel). Keep a note open while you go and paste each key into it as you get it.

| Service | What it does | Cost |
|---|---|---|
| **Supabase** | Stores customers, jobs, payments and photos, and handles sign-in | Free plan is enough to start |
| **Vercel** | Runs the app and gives you the web link | Free (Hobby) plan |
| **Twilio** | Sends the automatic photo texts | About $1.15/month for the number, about 2–3¢ per photo text, and a one-time texting registration fee (step 4) |
| **OpenAI** | Turns voice memos into jobs | Usually less than 1¢ per memo. Add $5 credit. |
| **Resend** | Emails invoices | Free up to 3,000 emails/month. Needs a domain, like spitzersexpress.com. |

---

## 1. Put the code on GitHub

1. Make a free account at **github.com**.
2. Click **+ → New repository**, name it `spitzers-express`, choose **Private**, and click **Create**.
3. Click **uploading an existing file** and drag in everything from the `spitzers-express` folder, but **not** the `node_modules` folder. Click **Commit changes**.

## 2. Supabase (database and sign-in)

1. Go to **supabase.com** → **Start your project** → **New project**. Name it `spitzers-express`, pick a strong database password (save it), and choose region **East US**.
2. When it's ready, open **SQL Editor** → **New query**. Open `supabase/schema.sql`, copy all of it, paste it in, and click **Run**. You should see "Success".
3. Open **Authentication → Sign In / Providers**:
   - Leave **Email** turned on.
   - Turn **off** "Allow new users to sign up". This means nobody else can create an account.
4. Open **Authentication → Users → Add user → Create new user**. Enter the driver's email and a password, tick **Auto Confirm User**, and save. Do the same for yourself if you want access.
5. Open **Project Settings → API** and copy these three values into your note:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep this one secret)

## 3. OpenAI (voice memos)

1. Go to **platform.openai.com**, sign up, then open **Settings → Billing** and add $5 credit.
2. Open **API keys → Create new secret key** and copy it → `OPENAI_API_KEY`.

## 4. Twilio (automatic photo texts)

1. Sign up at **twilio.com** and upgrade the account (add a card). Trial accounts can only text your own phone.
2. Open **Phone Numbers → Buy a number**, search area code **845**, tick **SMS** and **MMS**, and buy one.
3. **Register for US texting (required).** US carriers block business texts from unregistered numbers. Open **Messaging → Regulatory Compliance → A2P 10DLC** and register as a **Sole Proprietor** (or Standard Brand if the business has an EIN).
   - Campaign use case: "Delivery notifications".
   - Sample message: "Spitzer's Express: your delivery at 52 Bakertown Rd was completed at 2:15 PM. Photo attached. Questions? 845-781-6392"
   - Approval usually takes a few days. Twilio charges small one-time and monthly registration fees and shows the exact amounts before you submit.
   - Until it's approved, the app still saves photos. Texts show "failed" and can be resent from the job page later.
4. On the Twilio **Console** home page, copy:
   - **Account SID** → `TWILIO_ACCOUNT_SID`
   - **Auth Token** → `TWILIO_AUTH_TOKEN`
   - The number you bought, written like `+18455551234` → `TWILIO_FROM_NUMBER`

## 5. Resend (invoice emails, optional but recommended)

1. Sign up at **resend.com**. Open **Domains → Add domain** and follow the steps to add the DNS records at whoever sells you the domain (GoDaddy, Namecheap, etc.).
2. Open **API Keys → Create** and copy it → `RESEND_API_KEY`.
3. Choose the sending address, for example `invoices@spitzersexpress.com` → `INVOICE_FROM_EMAIL`.
4. If you want a copy of every invoice, put that email in `INVOICE_BCC_EMAIL`.

You can skip this step and add it later. Everything else works without it.

## 6. Vercel (puts the app online)

1. Go to **vercel.com** → **Sign up with GitHub**.
2. Click **Add New → Project** and import `spitzers-express`.
3. Before clicking Deploy, open **Environment Variables** and add each of these:

```
NEXT_PUBLIC_SUPABASE_URL        (from step 2)
NEXT_PUBLIC_SUPABASE_ANON_KEY   (from step 2)
SUPABASE_SERVICE_ROLE_KEY       (from step 2)
ALLOWED_EMAILS                  driver@email.com,your@email.com
OPENAI_API_KEY                  (from step 3)
TWILIO_ACCOUNT_SID              (from step 4)
TWILIO_AUTH_TOKEN               (from step 4)
TWILIO_FROM_NUMBER              (from step 4)
RESEND_API_KEY                  (from step 5)
INVOICE_FROM_EMAIL              (from step 5)
INVOICE_BCC_EMAIL               (optional)
CRON_SECRET                     any long random text, e.g. mash the keyboard for 30 characters
BUSINESS_NAME                   Spitzer's Express Messenger Service
BUSINESS_PHONE                  845-781-6392
```

4. Click **Deploy**. After a minute or two you get a link like `spitzers-express.vercel.app`. That link is the app.
5. Optional: under **Settings → Domains** you can use your own address, like `app.spitzersexpress.com`.

Weekly invoices go out automatically every **Friday at 9 AM** to customers set to "weekly invoice", and to any job marked "wants an invoice".

## 7. Put it on the driver's phone

1. Open the link on his phone and sign in.
2. Add it to the home screen:
   - **iPhone:** in Safari, tap **Share → Add to Home Screen**.
   - **Android:** in Chrome, tap **⋮ → Add to Home screen**.
3. The first time he records a voice memo or takes a photo, tap **Allow** for the microphone and camera.

He stays signed in. From then on it opens like a normal app.

## 8. Bring in the old Google Sheet

1. On a computer, open the Google Sheet and choose **File → Download → Microsoft Excel (.xlsx)**.
2. In the app, open **⚙️ Settings → Import from Google Sheet** and pick the file.
3. Check the **"Same customer?"** list. It combines spellings like "Balabosta / Bolbusta / Balebusta". Untick any that are really different customers.
4. Tap **Import**.

What the import does:

- The Google Sheet is never changed.
- Card numbers, expiry dates and security codes are removed and never saved.
- Old notes are kept on each job.
- Anything unclear goes to **Settings → Things to check**. That includes lump-sum payments, payments without a method, merged names, and the old "Open Balances" figures so you can compare them.
- Running the import twice won't create duplicates.

---

## How he uses it day to day

- **🚚 Today:** all stops for the day, split into Monroe / Monsey / Williamsburg / Borough Park, each with an **Open in Google Maps** button. Tap **✓ Picked up** at a pickup. At a drop-off, tap **📷 Delivered**: the camera opens, the photo is saved, and it's texted automatically. Use the ↑ ↓ arrows to change the order.
- **➕ New Job:** pick the customer, tap one of their **usual trips**, check the price, and tap **Add**.
- **🎤 Voice:** tap the mic and say the jobs. Check each one and tap **Looks good**. Yellow boxes are guesses from past trips that he didn't say in the memo.
- **👥 Customers:** phone numbers, usual trips, saved prices, what they owe, and who gets the photo text.
- **💵 Money:** today's totals, who owes money, record a payment (one payment can cover many jobs), and send invoices.

## If something goes wrong

- **Photo text failed:** open the job and look under the photo for the reason, then tap **Resend**. The usual causes are a customer with no phone number saved, or Twilio registration still pending.
- **Voice memo didn't work:** check the OpenAI credit balance. He can always use **⌨️ Type it** instead.
- **Forgot password:** in Supabase → Authentication → Users, click the user and choose **Send password recovery**, or set a new password.

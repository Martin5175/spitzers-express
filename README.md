# Spitzer's Express 

Phone-first delivery app for a one-driver courier: jobs, voice memos, daily routes split by area with Google Maps links, delivery photos texted automatically, payments, balances and invoices.

**To get it running, follow [SETUP.md](SETUP.md).**

Built with Next.js, Supabase (database, sign-in, photo storage), Twilio (photo texts), OpenAI (voice memos) and Resend (invoice emails). Hosted on Vercel.

- `supabase/schema.sql`: run once in Supabase to create the database
- `app/`: screens and server routes
- `lib/`: logic for route areas, Maps links, suggestions, payment splitting and sheet import
- `npm test`: tests for that logic

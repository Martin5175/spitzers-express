import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase-server";
import { sendInvoice } from "@/lib/invoice-server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Runs every Friday (see vercel.json): emails invoices to customers who want them. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "no" }, { status: 401 });
  const s = adminClient();
  const { data } = await s.from("jobs").select("customer_id, invoice_requested, contacts!inner(wants_invoices)")
    .eq("delivery_status", "delivered").is("invoice_id", null).not("customer_id", "is", null).limit(5000);
  const ids = new Set<string>();
  (data || []).forEach((j: any) => { if (j.invoice_requested || j.contacts?.wants_invoices) ids.add(j.customer_id); });
  const results = [];
  for (const id of ids) results.push({ id, ...(await sendInvoice(s, id)) });
  return NextResponse.json({ sent: results.filter((r) => r.ok).length, results });
}

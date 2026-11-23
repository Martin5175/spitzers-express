import type { SupabaseClient } from "@supabase/supabase-js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const usd = (n: number) => "$" + n.toFixed(2);

/**
 * Builds and emails an invoice for a customer's delivered jobs that haven't been invoiced yet
 * (jobs marked "wants invoice", or all jobs if the customer gets weekly invoices).
 */
export async function sendInvoice(s: SupabaseClient, customerId: string): Promise<{ ok: boolean; message: string }> {
  const { data: c } = await s.from("contacts").select("*").eq("id", customerId).single();
  if (!c) return { ok: false, message: "Customer not found" };
  const to = c.invoice_email || c.email;
  if (!to) return { ok: false, message: `${c.name} has no email — add one on their page` };

  let q = s.from("jobs").select("id, job_date, description, price, invoice_requested, stops(seq, kind, address_text), job_extras(label, amount)")
    .eq("customer_id", customerId).eq("delivery_status", "delivered").is("invoice_id", null).order("job_date");
  if (!c.wants_invoices) q = q.eq("invoice_requested", true);
  const { data: jobs } = await q;
  if (!jobs?.length) return { ok: false, message: "Nothing to invoice" };

  const ids = jobs.map((j: any) => j.id);
  const { data: money } = await s.from("job_money").select("job_id, total, paid, balance").in("job_id", ids);
  const m = new Map((money || []).map((x: any) => [x.job_id, x]));
  const total = jobs.reduce((t: number, j: any) => t + Number(m.get(j.id)?.total || 0), 0);
  const paid = jobs.reduce((t: number, j: any) => t + Number(m.get(j.id)?.paid || 0), 0);
  const due = total - paid;

  const year = new Date().getFullYear();
  const { count } = await s.from("invoices").select("id", { count: "exact", head: true }).like("number", `INV-${year}-%`);
  const number = `INV-${year}-${String((count || 0) + 1).padStart(4, "0")}`;
  const biz = process.env.BUSINESS_NAME || "Spitzer's Express Messenger Service";
  const phone = process.env.BUSINESS_PHONE || "845-781-6392";

  const rows = jobs.map((j: any) => {
    const st = (j.stops || []).sort((a: any, b: any) => a.seq - b.seq).map((x: any) => x.address_text).filter(Boolean).join(" → ");
    const ex = (j.job_extras || []).map((e: any) => `${esc(e.label)} ${usd(Number(e.amount))}`).join(", ");
    const mm = m.get(j.id) || { total: 0, paid: 0 };
    return `<tr><td style="padding:8px;border-bottom:1px solid #eee">${esc(j.job_date)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${esc(st || j.description || "Delivery")}${j.description && st ? `<br><small>${esc(j.description)}</small>` : ""}${ex ? `<br><small>+ ${ex}</small>` : ""}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${usd(Number(mm.total))}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${Number(mm.paid) ? usd(Number(mm.paid)) : ""}</td></tr>`;
  }).join("");

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#111">
    <div style="background:#ef4c23;padding:20px;border-radius:12px 12px 0 0">
      <div style="font-size:26px;font-weight:900;text-transform:uppercase">${esc(biz)}</div>
      <div>${esc(phone)}</div>
    </div>
    <div style="background:#fffbe3;padding:20px;border-radius:0 0 12px 12px">
      <p><b>Invoice ${number}</b><br>${new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })}<br>Bill to: ${esc(c.name)}</p>
      <table style="width:100%;border-collapse:collapse;background:#fff">
        <tr style="background:#3b3839;color:#fff"><th style="padding:8px;text-align:left">Date</th><th style="padding:8px;text-align:left">Delivery</th><th style="padding:8px;text-align:right">Charge</th><th style="padding:8px;text-align:right">Paid</th></tr>
        ${rows}
      </table>
      <p style="text-align:right;font-size:16px">Total: ${usd(total)}<br>Paid: ${usd(paid)}<br><b style="font-size:22px">Amount due: ${usd(due)}</b></p>
      <p>Payment by Zelle, cash or check. Thank you!</p>
    </div></div>`;

  const key = process.env.RESEND_API_KEY, from = process.env.INVOICE_FROM_EMAIL;
  if (!key || !from) return { ok: false, message: "Invoice email isn't set up yet" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: `${biz} <${from}>`, to: [to], subject: `Invoice ${number} — ${biz}`, html,
      ...(process.env.INVOICE_BCC_EMAIL ? { bcc: [process.env.INVOICE_BCC_EMAIL] } : {}),
    }),
  });
  if (!r.ok) return { ok: false, message: "Email failed: " + (await r.text()).slice(0, 150) };

  const { data: inv } = await s.from("invoices").insert({ number, customer_id: customerId, total: due, sent_to: to, sent_at: new Date().toISOString() }).select("id").single();
  await s.from("jobs").update({ invoice_id: inv!.id }).in("id", ids);
  return { ok: true, message: `Invoice ${number} (${usd(due)}) emailed to ${to}` };
}

"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell, { Sheet, toast } from "@/components/Shell";
import PaymentSheet from "@/components/PaymentSheet";
import ContactPicker from "@/components/ContactPicker";
import { sb } from "@/lib/supabase-browser";
import { useContacts } from "@/lib/useContacts";
import { money } from "@/lib/money";
import { niceDate, todayISO } from "@/lib/dates";

type Owing = { customer_id: string; balance: number; oldest: string | null };
type InvoiceDue = { customer_id: string; count: number; total: number };

export default function Money() {
  const { contacts, setContacts, ranked } = useContacts();
  const names = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const [owing, setOwing] = useState<Owing[]>([]);
  const [day, setDay] = useState({ jobs: 0, delivered: 0, stops: 0, charges: 0, received: 0, byMethod: {} as Record<string, number> });
  const [due, setDue] = useState<InvoiceDue[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const t = todayISO();
    const s = sb();
    const [open, todayJobs, todayStops, todayPays, inv, rec] = await Promise.all([
      s.from("job_money").select("customer_id, balance, job_date").gt("balance", 0.004).limit(5000),
      s.from("job_money").select("job_id, total, delivery_status").eq("job_date", t),
      s.from("stops").select("id, jobs!inner(job_date)").eq("jobs.job_date", t).eq("status", "done"),
      s.from("payments").select("amount, method").eq("received_on", t),
      s.from("job_money").select("customer_id, total").eq("invoice_requested", true).is("invoice_id", null).eq("delivery_status", "delivered").limit(2000),
      s.from("payments").select("id, customer_id, amount, method, received_on, note").order("created_at", { ascending: false }).limit(15),
    ]);
    const by = new Map<string, Owing>();
    (open.data || []).forEach((r: any) => {
      if (!r.customer_id) return;
      const o = by.get(r.customer_id) || { customer_id: r.customer_id, balance: 0, oldest: null };
      o.balance += Number(r.balance);
      if (!o.oldest || r.job_date < o.oldest) o.oldest = r.job_date;
      by.set(r.customer_id, o);
    });
    setOwing([...by.values()].sort((a, b) => b.balance - a.balance));
    const bm: Record<string, number> = {};
    (todayPays.data || []).forEach((p: any) => (bm[p.method || "Other"] = (bm[p.method || "Other"] || 0) + Number(p.amount)));
    setDay({
      jobs: (todayJobs.data || []).length,
      delivered: (todayJobs.data || []).filter((j: any) => j.delivery_status === "delivered").length,
      stops: (todayStops.data || []).length,
      charges: (todayJobs.data || []).reduce((x: number, j: any) => x + Number(j.total), 0),
      received: (todayPays.data || []).reduce((x: number, p: any) => x + Number(p.amount), 0),
      byMethod: bm,
    });
    const d = new Map<string, InvoiceDue>();
    (inv.data || []).forEach((r: any) => {
      if (!r.customer_id) return;
      const o = d.get(r.customer_id) || { customer_id: r.customer_id, count: 0, total: 0 };
      o.count++; o.total += Number(r.total); d.set(r.customer_id, o);
    });
    setDue([...d.values()]);
    setRecent(rec.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function sendInvoice(cid: string) {
    setSending(cid);
    const r = await fetch("/api/invoice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerId: cid }) });
    const j = await r.json();
    toast(j.message || (j.ok ? "Invoice sent" : "Invoice failed"));
    setSending(null);
    load();
  }

  const totalOwed = owing.reduce((s, o) => s + o.balance, 0);

  return (
    <Shell title="Money">
      <button className="btn primary block xl" onClick={() => setPickOpen(true)}>💵 Record a payment</button>

      <div className="h2">Today</div>
      <div className="card">
        <div className="summary">
          <div><b>{day.delivered}/{day.jobs}</b><span>jobs delivered</span></div>
          <div><b>{money(day.charges)}</b><span>charged</span></div>
          <div><b>{money(day.received)}</b><span>received</span></div>
        </div>
        {Object.keys(day.byMethod).length > 0 && (
          <div className="muted small center" style={{ marginTop: 8 }}>
            {Object.entries(day.byMethod).map(([m, v]) => `${m} ${money(v)}`).join(" · ")}
          </div>
        )}
        <div className="muted small center" style={{ marginTop: 4 }}>{day.stops} stops finished today</div>
      </div>

      {due.length > 0 && (
        <>
          <div className="h2">Invoices to send</div>
          {due.map((d) => {
            const c = names[d.customer_id];
            const email = c?.invoice_email || c?.email;
            return (
              <div key={d.customer_id} className="card" style={{ marginTop: 8 }}>
                <div className="row">
                  <Link href={`/customers/${d.customer_id}`} className="grow"><b>{c?.name || "?"}</b><div className="muted small">{d.count} job{d.count > 1 ? "s" : ""} · {money(d.total)}</div></Link>
                  {email
                    ? <button className="btn sm" disabled={sending === d.customer_id} onClick={() => sendInvoice(d.customer_id)}>{sending === d.customer_id ? "Sending…" : "📧 Send"}</button>
                    : <Link href={`/customers/${d.customer_id}`} className="btn sm ghost">Add email</Link>}
                </div>
              </div>
            );
          })}
        </>
      )}

      <div className="h2">Who owes money · {money(totalOwed)}</div>
      {owing.length === 0 && <div className="card center">Nobody owes anything 🎉</div>}
      {owing.map((o) => (
        <div key={o.customer_id} className="list-item">
          <Link href={`/customers/${o.customer_id}`} className="grow">
            <div style={{ fontWeight: 800 }}>{names[o.customer_id]?.name || "?"}</div>
            {o.oldest && <div className="muted small">since {niceDate(o.oldest)}</div>}
          </Link>
          <b style={{ color: "var(--red)", fontSize: 20 }}>{money(o.balance)}</b>
          <button className="btn sm" onClick={() => setPayFor(o.customer_id)}>Paid</button>
        </div>
      ))}

      {recent.length > 0 && (
        <>
          <div className="h2">Recent payments</div>
          {recent.map((p) => (
            <div key={p.id} className="row card" style={{ marginTop: 6, padding: 10 }}>
              <div className="grow">
                <b>{names[p.customer_id]?.name || "—"}</b>
                <div className="muted small">{niceDate(p.received_on)}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</div>
              </div>
              <b>{money(p.amount)}</b>
            </div>
          ))}
        </>
      )}

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)}>
        <h3>Who paid?</h3>
        <ContactPicker contacts={contacts} ranked={[...new Set(owing.map((o) => o.customer_id).concat(ranked))]} value={null}
          onChange={(id) => { if (id) { setPickOpen(false); setPayFor(id); } }}
          onCreated={(c) => setContacts((cs) => [...cs, c])} placeholder="Search customer…" />
      </Sheet>
      <PaymentSheet open={!!payFor} onClose={() => setPayFor(null)} onSaved={load} customerId={payFor} customerName={payFor ? names[payFor]?.name || "" : ""} />
    </Shell>
  );
}

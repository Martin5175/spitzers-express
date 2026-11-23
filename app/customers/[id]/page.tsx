"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Shell, { Sheet, toast } from "@/components/Shell";
import PaymentSheet from "@/components/PaymentSheet";
import ContactPicker from "@/components/ContactPicker";
import { sb } from "@/lib/supabase-browser";
import { customerHistory, loadContacts, loadJobs, openJobsFor, loadAddresses } from "@/lib/data";
import type { Address, Contact, JobFull } from "@/lib/types";
import { patternsFor, type HistJob, type PreferredPrice } from "@/lib/suggest";
import { allocateOldestFirst, money } from "@/lib/money";
import { niceDate, todayISO } from "@/lib/dates";

const PHOTO_TO: [Contact["photo_text_to"], string][] = [
  ["customer", "The customer"], ["dropoff", "Person receiving"], ["pickup", "Person sending"], ["none", "Don't text"],
];

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Contact | null>(null);
  const [form, setForm] = useState<Partial<Contact>>({});
  const [all, setAll] = useState<Contact[]>([]);
  const [jobs, setJobs] = useState<JobFull[]>([]);
  const [hist, setHist] = useState<{ jobs: HistJob[]; preferred: (PreferredPrice & { label?: string })[] } | null>(null);
  const [addrs, setAddrs] = useState<Address[]>([]);
  const [credit, setCredit] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeId, setMergeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [cs, js, h, ad, st] = await Promise.all([
      loadContacts(), loadJobs({ customerId: id, limit: 60 }), customerHistory(id), loadAddresses([id]),
      sb().from("customer_stats").select("unapplied_credit").eq("customer_id", id).maybeSingle(),
    ]);
    const me = cs.find((x) => x.id === id) || null;
    setAll(cs); setC(me); setForm(me || {}); setJobs(js); setHist(h as any); setAddrs(ad);
    setCredit(Number(st.data?.unapplied_credit || 0));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const names = useMemo(() => Object.fromEntries(all.map((x) => [x.id, x.name])), [all]);
  const patterns = useMemo(() => (hist ? patternsFor(hist.jobs, hist.preferred, todayISO(), 6) : []), [hist]);
  if (!c) return <Shell title="Customer" back><p className="muted">Loading…</p></Shell>;

  const balance = jobs.reduce((s, j) => s + Math.max(0, j.money?.balance || 0), 0);
  const msgChanged = (form.photo_message || "") !== (c.photo_message || "");
  const changed = msgChanged || ["name", "phone", "email", "instructions", "notes", "invoice_email"].some((k) => ((form as any)[k] || "") !== ((c as any)[k] || ""));

  async function save(patch?: Partial<Contact>) {
    const body: Record<string, unknown> = patch || { name: form.name, phone: form.phone || null, email: form.email || null, instructions: form.instructions || null, notes: form.notes || null, invoice_email: form.invoice_email || null };
    if (!patch && msgChanged) body.photo_message = (form.photo_message || "").trim() || null;
    const { error } = await sb().from("contacts").update(body).eq("id", id);
    if (error) toast(error.message); else { toast("Saved ✓"); load(); }
  }

  async function useCredit() {
    // Apply unused payment money to the oldest unpaid jobs
    const { data: pays } = await sb().from("payments").select("id, amount, payment_allocations(amount)").eq("customer_id", id).order("received_on");
    let open = await openJobsFor(id);
    for (const p of pays || []) {
      const used = (p as any).payment_allocations.reduce((s: number, a: any) => s + Number(a.amount), 0);
      const free = Number(p.amount) - used;
      if (free <= 0.005) continue;
      const plan = allocateOldestFirst(free, open);
      if (plan.allocations.length) await sb().from("payment_allocations").insert(plan.allocations.map((a) => ({ ...a, payment_id: p.id })));
      open = open.map((j) => ({ ...j, balance: j.balance - (plan.allocations.find((a) => a.job_id === j.job_id)?.amount || 0) }));
    }
    toast("Credit applied");
    load();
  }

  async function sendInvoice() {
    setBusy(true);
    const r = await fetch("/api/invoice", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ customerId: id }) });
    const j = await r.json();
    toast(j.message || (j.ok ? "Invoice sent" : "Invoice failed"));
    setBusy(false);
    load();
  }

  async function removePrice(key: string) {
    await sb().from("preferred_prices").delete().eq("customer_id", id).eq("pattern_key", key);
    load();
  }
  async function removeAddress(a: Address) {
    await sb().from("addresses").update({ contact_id: null }).eq("id", a.id);
    load();
  }

  async function merge() {
    if (!mergeId || mergeId === id) return;
    const other = all.find((x) => x.id === mergeId)!;
    if (!confirm(`Move everything from “${other.name}” into “${c!.name}” and remove “${other.name}”?`)) return;
    const s = sb();
    await s.from("jobs").update({ customer_id: id }).eq("customer_id", mergeId);
    await s.from("stops").update({ contact_id: id }).eq("contact_id", mergeId);
    await s.from("addresses").update({ contact_id: id }).eq("contact_id", mergeId);
    await s.from("payments").update({ customer_id: id }).eq("customer_id", mergeId);
    await s.from("invoices").update({ customer_id: id }).eq("customer_id", mergeId);
    const { data: prices } = await s.from("preferred_prices").select("*").eq("customer_id", mergeId);
    for (const p of prices || []) {
      await s.from("preferred_prices").upsert({ customer_id: id, pattern_key: p.pattern_key, amount: p.amount, label: p.label }, { onConflict: "customer_id,pattern_key", ignoreDuplicates: true });
    }
    await s.from("review_flags").update({ contact_id: id }).eq("contact_id", mergeId);
    await s.from("contacts").update({
      aliases: [...new Set([...(c!.aliases || []), other.name, ...(other.aliases || [])])],
      phone: c!.phone || other.phone, email: c!.email || other.email,
      notes: [c!.notes, other.notes].filter(Boolean).join("\n") || null,
    }).eq("id", id);
    await s.from("contacts").delete().eq("id", mergeId);
    toast("Merged ✓");
    setMergeOpen(false); setMergeId(null);
    load();
  }

  const uninvoiced = jobs.filter((j) => j.invoice_requested && !j.invoice_id && j.delivery_status === "delivered");

  return (
    <Shell title={c.name} back>
      <div className="btn-row">
        <Link href={`/new?customer=${id}`} className="btn primary">+ New job</Link>
        {c.phone ? <a href={`tel:${c.phone}`} className="btn">📞 Call</a> : <span />}
      </div>

      <div className="h2">Money</div>
      <div className="card">
        <div className="row">
          <div className="grow">Owes</div>
          <div className="big-number" style={{ color: balance > 0 ? "var(--red)" : "var(--green)" }}>{money(balance)}</div>
        </div>
        {credit > 0.005 && (
          <div className="row" style={{ marginTop: 6 }}>
            <div className="grow">Unused credit: <b>{money(credit)}</b></div>
            {balance > 0 && <button className="btn sm" onClick={useCredit}>Use it</button>}
          </div>
        )}
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={() => setPayOpen(true)}>💵 Record a payment</button>
      </div>

      <div className="h2">Delivery photo text goes to</div>
      <div className="chips">
        {PHOTO_TO.map(([v, l]) => (
          <button key={v} className={"chip" + (c.photo_text_to === v ? " on" : "")} onClick={() => save({ photo_text_to: v })}>{l}</button>
        ))}
      </div>

      {c.photo_text_to !== "none" && (
        <label className="f"><span>Special photo message for {c.name} (optional)</span>
          <textarea className="input" rows={3} placeholder="Leave empty to use the general message from Settings" value={form.photo_message || ""} onChange={(e) => setForm({ ...form, photo_message: e.target.value })} />
          {msgChanged && <button className="btn primary block" style={{ marginTop: 8 }} onClick={() => save()}>Save message</button>}
        </label>
      )}

      <div className="h2">Invoices</div>
      <div className="card">
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={c.wants_invoices} onChange={() => save({ wants_invoices: !c.wants_invoices })} style={{ width: 26, height: 26 }} />
          <span className="grow">Send this customer a weekly invoice (Fridays)</span>
        </label>
        <label className="f"><span>Invoice email</span>
          <input className="input" type="email" value={form.invoice_email || ""} placeholder={c.email || "name@example.com"} onChange={(e) => setForm({ ...form, invoice_email: e.target.value })} />
        </label>
        {uninvoiced.length > 0 && (
          <button className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={sendInvoice}>📧 Send invoice now ({uninvoiced.length} job{uninvoiced.length > 1 ? "s" : ""})</button>
        )}
      </div>

      <div className="h2">Details</div>
      <div className="card">
        <label className="f" style={{ marginTop: 0 }}><span>Name</span><input className="input" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="f"><span>Phone</span><input className="input" type="tel" value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="f"><span>Email</span><input className="input" type="email" value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="f"><span>Delivery instructions</span><input className="input" value={form.instructions || ""} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></label>
        <label className="f"><span>Notes</span><textarea className="input" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        {c.aliases?.length > 0 && <div className="muted small" style={{ marginTop: 8 }}>Also known as: {c.aliases.join(", ")}</div>}
        {changed && <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => save()}>Save changes</button>}
      </div>

      {patterns.length > 0 && (
        <>
          <div className="h2">Usual trips</div>
          {patterns.map((p) => (
            <div key={p.key} className="card" style={{ marginTop: 8 }}>
              {p.stops.map((s, i) => (
                <div key={i} className="row" style={{ gap: 6 }}>
                  <span className={"tag " + (s.kind === "pickup" ? "pick" : "drop")}>{s.kind === "pickup" ? "From" : "To"}</span>
                  <span>{[names[s.contact_id || ""], s.address_text].filter(Boolean).join(" · ") || "—"}</span>
                </div>
              ))}
              <div className="row" style={{ marginTop: 6 }}>
                <span className="muted small grow">{p.count}× · last {niceDate(p.lastDate)}</span>
                {p.price && <b>{money(p.price.amount)}</b>}
                {p.price?.saved && <span className="tag ok">saved</span>}
              </div>
              {p.price?.saved && <button className="link" onClick={() => removePrice(p.key)}>Forget saved price</button>}
            </div>
          ))}
        </>
      )}

      {addrs.length > 0 && (
        <>
          <div className="h2">Saved addresses</div>
          {addrs.map((a) => (
            <div key={a.id} className="card row" style={{ marginTop: 6, padding: 10 }}>
              <div className="grow">{a.line}{a.area && <span className="muted small"> · {a.area}</span>}</div>
              <button className="btn sm ghost" onClick={() => removeAddress(a)} aria-label="Remove">✕</button>
            </div>
          ))}
        </>
      )}

      <div className="h2">Past jobs</div>
      {jobs.length === 0 && <p className="muted">None yet.</p>}
      {jobs.map((j) => (
        <Link key={j.id} href={`/job/${j.id}`} className="list-item">
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{niceDate(j.job_date)}{j.delivery_status === "cancelled" ? " · cancelled" : ""}</div>
            <div className="muted small">{j.stops.map((s) => s.address_text).filter(Boolean).join(" → ") || j.description || "—"}</div>
          </div>
          <div className="right">
            <div style={{ fontWeight: 800 }}>{money(j.money?.total)}</div>
            {j.money && <span className={"tag " + (j.money.payment_status === "paid" ? "ok" : j.money.payment_status === "partial" ? "warn" : "bad")}>{j.money.payment_status === "paid" ? "paid" : j.money.payment_status === "partial" ? "part" : "unpaid"}</span>}
          </div>
        </Link>
      ))}

      <button className="btn ghost block" style={{ marginTop: 24 }} onClick={() => setMergeOpen(true)}>This is the same as another customer…</button>
      <button className="link" style={{ color: "var(--red)", display: "block", margin: "8px auto" }} onClick={async () => {
        if (jobs.length) { toast("This customer has jobs. Merge instead of deleting."); return; }
        if (!confirm(`Delete ${c.name}?`)) return;
        await sb().from("contacts").delete().eq("id", id); router.replace("/customers");
      }}>Delete customer</button>

      <PaymentSheet open={payOpen} onClose={() => setPayOpen(false)} onSaved={load} customerId={id} customerName={c.name} />

      <Sheet open={mergeOpen} onClose={() => setMergeOpen(false)}>
        <h3>Merge duplicate</h3>
        <p className="muted">Pick the other record. Its jobs, payments and addresses move into <b>{c.name}</b>.</p>
        <ContactPicker contacts={all.filter((x) => x.id !== id)} value={mergeId} onChange={setMergeId} onCreated={() => {}} placeholder="Search…" allowAdd={false} />
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={!mergeId} onClick={merge}>Merge</button>
      </Sheet>
    </Shell>
  );
}

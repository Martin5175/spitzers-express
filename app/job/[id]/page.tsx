"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Shell, { Sheet, toast } from "@/components/Shell";
import PhotoButton from "@/components/PhotoButton";
import PaymentSheet from "@/components/PaymentSheet";
import { sb } from "@/lib/supabase-browser";
import { draftPatternKey, loadContacts, loadJobs, photoUrls, savePreferredPrice, setStopDone, textPhoto } from "@/lib/data";
import type { Contact, JobFull } from "@/lib/types";
import { money } from "@/lib/money";
import { niceDate } from "@/lib/dates";

type Photo = { id: string; stop_id: string | null; path: string; text_status: string; text_to: string | null; text_error: string | null; created_at: string };
type Extra = { id: string; label: string; amount: number };
type Alloc = { id: string; amount: number; payments: { id: string; method: string | null; received_on: string; amount: number; note: string | null } };

const DS: Record<string, [string, string]> = {
  upcoming: ["Waiting for pickup", "warn"], picked_up: ["Picked up", "pick"], delivered: ["Delivered", "ok"], cancelled: ["Cancelled", "grey"],
};
const PS: Record<string, [string, string]> = { unpaid: ["Not paid", "bad"], partial: ["Partly paid", "warn"], paid: ["Paid", "ok"] };

async function sharePhoto(url: string) {
  try {
    const blob = await (await fetch(url)).blob();
    const file = new File([blob], "delivery.jpg", { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: "Your delivery from Spitzer's Express" });
      return;
    }
  } catch (e: any) {
    if (e?.name === "AbortError") return;
  }
  window.open(url, "_blank");
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [job, setJob] = useState<JobFull | null>(null);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Extra[]>([]);
  const [presets, setPresets] = useState<Extra[]>([]);
  const [allocs, setAllocs] = useState<Alloc[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);
  const [custom, setCustom] = useState({ label: "", amount: "" });
  const [viewer, setViewer] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [[j], c, ph, ex, pr, al] = await Promise.all([
      loadJobs({ ids: [id] }),
      loadContacts(),
      sb().from("photos").select("*").eq("job_id", id).order("created_at"),
      sb().from("job_extras").select("*").eq("job_id", id),
      sb().from("extra_presets").select("*").order("sort"),
      sb().from("payment_allocations").select("id, amount, payments(id, method, received_on, amount, note)").eq("job_id", id),
    ]);
    setJob(j || null);
    setContacts(Object.fromEntries(c.map((x) => [x.id, x])));
    const p = (ph.data || []) as Photo[];
    setPhotos(p);
    setUrls(await photoUrls(p.map((x) => x.path)));
    setExtras((ex.data || []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
    setPresets((pr.data || []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
    setAllocs((al.data || []) as any);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!job) return <Shell title="Job" back><p className="muted">Loading…</p></Shell>;

  const cust = job.customer_id ? contacts[job.customer_id] : null;
  const name = (cid: string | null) => (cid ? contacts[cid]?.name : "") || "";
  const m = job.money;

  async function addExtra(label: string, amount: number) {
    await sb().from("job_extras").insert({ job_id: id, label, amount });
    setExtraOpen(false); setCustom({ label: "", amount: "" });
    toast(`Added ${label} ${money(amount)}`);
    load();
  }
  async function removeExtra(x: Extra) {
    await sb().from("job_extras").delete().eq("id", x.id);
    load();
  }
  async function removePayment(a: Alloc) {
    if (!confirm(`Remove this ${money(a.amount)} payment?`)) return;
    // remove just this job's share; delete the payment if nothing else uses it
    await sb().from("payment_allocations").delete().eq("id", a.id);
    const { count } = await sb().from("payment_allocations").select("id", { count: "exact", head: true }).eq("payment_id", a.payments.id);
    if (!count) await sb().from("payments").delete().eq("id", a.payments.id);
    load();
  }
  async function toggleInvoice() {
    await sb().from("jobs").update({ invoice_requested: !job!.invoice_requested }).eq("id", id);
    load();
  }
  async function cancelJob() {
    if (!confirm("Cancel this job? It will be removed from the route.")) return;
    await sb().from("jobs").update({ delivery_status: "cancelled" }).eq("id", id);
    toast("Job cancelled");
    router.back();
  }
  async function restoreJob() {
    await sb().from("jobs").update({ delivery_status: "upcoming" }).eq("id", id);
    load();
  }
  async function savePrice() {
    if (!job!.customer_id || job!.price == null) return;
    const key = draftPatternKey({ stops: job!.stops.map((s) => ({ ...s, address_text: s.address_text || "", instructions: "" })) } as any);
    await savePreferredPrice(job!.customer_id, key, job!.price);
    toast(`${money(job!.price)} saved as the usual price for this trip`);
  }
  async function resend(p: Photo) {
    const r = await textPhoto(p.id);
    toast(r.ok ? "✓ " + r.message : "⚠️ " + r.message);
    load();
  }

  const [ds, dsc] = DS[job.delivery_status];
  const [ps, psc] = PS[m?.payment_status || "unpaid"];

  return (
    <Shell title={cust?.name || "Job"} back>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={"tag " + dsc}>{ds}</span>
        <span className={"tag " + psc}>{ps}</span>
        {job.invoice_requested && <span className="tag grey">{job.invoice_id ? "Invoiced" : "Invoice wanted"}</span>}
        <span className="muted small" style={{ marginLeft: "auto" }}>{niceDate(job.job_date)}</span>
      </div>
      {job.description && <div className="card" style={{ marginTop: 12 }}>📦 {job.description}</div>}
      {cust?.phone && (
        <a className="btn block" style={{ marginTop: 10 }} href={`tel:${cust.phone}`}>📞 Call {cust.name}</a>
      )}

      <div className="h2">Stops</div>
      {job.stops.map((s, i) => {
        const sp = photos.filter((p) => p.stop_id === s.id);
        const who = name(s.contact_id);
        const tel = s.contact_id ? contacts[s.contact_id]?.phone : null;
        return (
          <div key={s.id} className={"card" + (s.status === "done" ? "" : "")} style={{ marginTop: 8 }}>
            <div className="row">
              <span className={"tag " + (s.kind === "pickup" ? "pick" : "drop")}>{i + 1}. {s.kind === "pickup" ? "Pick up" : "Drop off"}</span>
              <div className="grow" />
              {s.status === "done" ? <span className="tag ok">✓ Done</span> : <span className="tag grey">To do</span>}
            </div>
            <div className="stop-name" style={{ marginTop: 6 }}>{who || name(job.customer_id) || <span className="muted">No contact</span>}</div>
            <div className="stop-addr">{s.address_text || <span className="muted">No address</span>}</div>
            {s.area && <div className="muted small">Route: {s.area}</div>}
            {s.instructions && <div className="small" style={{ marginTop: 4 }}>📌 {s.instructions}</div>}
            {tel && <a href={`tel:${tel}`} className="link">📞 {tel}</a>}
            {sp.length > 0 && (
              <div className="photos">
                {sp.map((p) => urls[p.path] && <img key={p.id} src={urls[p.path]} alt="Delivery" onClick={() => setViewer(p.id)} />)}
              </div>
            )}
            {sp.map((p) => (
              <div key={p.id} className="small" style={{ marginTop: 4 }}>
                {p.text_status === "sent" && <span style={{ color: "var(--green)" }}>✓ Texted to {p.text_to}</span>}
                {p.text_status === "failed" && <span style={{ color: "var(--red)" }}>⚠️ Text failed: {p.text_error} <button className="link" onClick={() => resend(p)}>Resend</button></span>}
                {p.text_status === "skipped" && <span className="muted">Not texted ({p.text_error})</span>}
                {p.text_status === "not_sent" && <button className="link" onClick={() => resend(p)}>Text this photo</button>}
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              {s.status === "pending" ? (
                s.kind === "dropoff" ? (
                  <>
                    <PhotoButton jobId={job.id} stopId={s.id} onDone={load} allowPick />
                    <button className="link" onClick={async () => { await setStopDone(s.id, job.id, true); load(); }}>Delivered without photo</button>
                  </>
                ) : (
                  <button className="btn primary block" onClick={async () => { await setStopDone(s.id, job.id, true); toast("Picked up ✓"); load(); }}>✓ Picked up</button>
                )
              ) : (
                <div className="row">
                  {s.kind === "dropoff" && <PhotoButton jobId={job.id} stopId={s.id} markDone={false} onDone={load} className="btn sm" label="📷 Add photo" />}
                  <button className="btn sm ghost" onClick={async () => { await setStopDone(s.id, job.id, false); load(); }}>Undo</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
      {photos.filter((p) => !p.stop_id).length > 0 && (
        <div className="photos">{photos.filter((p) => !p.stop_id).map((p) => urls[p.path] && <img key={p.id} src={urls[p.path]} alt="" onClick={() => setViewer(p.id)} />)}</div>
      )}

      <div className="h2">Charges</div>
      <div className="card">
        <div className="row"><span className="grow">Price</span><b>{job.price == null ? "Not set" : money(job.price)}</b></div>
        {extras.map((x) => (
          <div key={x.id} className="row" style={{ marginTop: 6 }}>
            <span className="grow">+ {x.label}</span><b>{money(x.amount)}</b>
            <button className="btn sm ghost" onClick={() => removeExtra(x)} aria-label="Remove">✕</button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 8, borderTop: "1.5px solid var(--line)", paddingTop: 8 }}>
          <span className="grow"><b>Total</b></span><b style={{ fontSize: 22 }}>{money(m?.total)}</b>
        </div>
        <div className="row"><span className="grow">Paid</span><span>{money(m?.paid)}</span></div>
        <div className="row"><span className="grow"><b>Still owed</b></span><b style={{ color: (m?.balance || 0) > 0 ? "var(--red)" : "var(--green)" }}>{money(m?.balance)}</b></div>
        <button className="btn sm block" style={{ marginTop: 10 }} onClick={() => setExtraOpen(true)}>+ Add extra charge</button>
        {job.customer_id && job.price != null && <button className="link" onClick={savePrice}>Save {money(job.price)} as usual price for this trip</button>}
      </div>

      <div className="h2">Payment</div>
      {allocs.map((a) => (
        <div key={a.id} className="card row" style={{ marginTop: 8 }}>
          <div className="grow">
            <b>{money(a.amount)}</b> {a.payments.method && <span className="tag grey">{a.payments.method}</span>}
            <div className="muted small">{niceDate(a.payments.received_on)}{Number(a.payments.amount) !== Number(a.amount) ? ` · part of ${money(a.payments.amount)}` : ""}{a.payments.note ? ` · ${a.payments.note}` : ""}</div>
          </div>
          <button className="btn sm ghost" onClick={() => removePayment(a)}>Remove</button>
        </div>
      ))}
      {(m?.balance || 0) > 0 && <button className="btn primary block xl" style={{ marginTop: 10 }} onClick={() => setPayOpen(true)}>💵 Mark paid</button>}

      <label className="row card" style={{ marginTop: 12, cursor: "pointer" }}>
        <input type="checkbox" checked={job.invoice_requested} onChange={toggleInvoice} style={{ width: 26, height: 26 }} />
        <span className="grow">Customer wants an invoice</span>
      </label>

      {job.notes && <><div className="h2">Notes</div><div className="card" style={{ whiteSpace: "pre-wrap" }}>{job.notes}</div></>}

      <div className="btn-row" style={{ marginTop: 22 }}>
        <Link href={`/new?id=${job.id}`} className="btn">✏️ Edit job</Link>
        {job.delivery_status === "cancelled"
          ? <button className="btn" onClick={restoreJob}>Restore job</button>
          : <button className="btn danger" onClick={cancelJob}>Cancel job</button>}
      </div>

      <Sheet open={extraOpen} onClose={() => setExtraOpen(false)}>
        <h3>Add extra charge</h3>
        <div className="stack" style={{ marginTop: 12 }}>
          {presets.map((p) => (
            <button key={p.id} className="btn block" onClick={() => addExtra(p.label, p.amount)}>{p.label} · {money(p.amount)}</button>
          ))}
        </div>
        <div className="h2">Something else</div>
        <div className="row">
          <input className="input grow" placeholder="What for" value={custom.label} onChange={(e) => setCustom({ ...custom, label: e.target.value })} />
          <input className="input" style={{ width: 110 }} inputMode="decimal" placeholder="$" value={custom.amount} onChange={(e) => setCustom({ ...custom, amount: e.target.value.replace(/[^0-9.]/g, "") })} />
        </div>
        <button className="btn primary block" style={{ marginTop: 10 }} disabled={!custom.label || !custom.amount} onClick={() => addExtra(custom.label, Number(custom.amount))}>Add</button>
      </Sheet>

      <PaymentSheet open={payOpen} onClose={() => setPayOpen(false)} onSaved={load} customerId={job.customer_id} customerName={cust?.name || ""} jobId={job.id} jobBalance={m?.balance || 0} />

      {viewer && (
        <div className="sheet-bg" style={{ alignItems: "center", flexDirection: "column", gap: 12 }} onClick={() => setViewer(null)}>
          <img src={urls[photos.find((p) => p.id === viewer)!.path]} alt="" style={{ maxWidth: "96vw", maxHeight: "74vh", borderRadius: 12 }} />
          <div className="btn-row" style={{ width: "min(96vw, 500px)" }} onClick={(e) => e.stopPropagation()}>
            <button className="btn primary" onClick={() => sharePhoto(urls[photos.find((p) => p.id === viewer)!.path])}>📤 Share</button>
            <button className="btn" onClick={() => setViewer(null)}>Close</button>
          </div>
        </div>
      )}
    </Shell>
  );
}

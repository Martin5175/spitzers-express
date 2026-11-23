"use client";
import { useEffect, useMemo, useState } from "react";
import type { Contact, Address } from "@/lib/types";
import { AREAS, detectArea } from "@/lib/areas";
import { addDays, niceDate, todayISO } from "@/lib/dates";
import { money } from "@/lib/money";
import { patternsFor, suggestPrice, type Pattern, type HistJob, type PreferredPrice } from "@/lib/suggest";
import { customerHistory, draftPatternKey, emptyStop, loadAddresses, savePreferredPrice, type Draft, type DraftStop } from "@/lib/data";
import ContactPicker from "./ContactPicker";

type Props = {
  draft: Draft;
  setDraft: (d: Draft) => void;
  contacts: Contact[];
  setContacts: (fn: (c: Contact[]) => Contact[]) => void;
  ranked: string[];
  onSave: (savePreferred: boolean) => void;
  saving: boolean;
  saveLabel?: string;
  extraButtons?: React.ReactNode;
};

const unsug = (list: string[] | undefined, f: string) => (list || []).filter((x) => x !== f);

export default function JobForm({ draft, setDraft, contacts, setContacts, ranked, onSave, saving, saveLabel, extraButtons }: Props) {
  const [hist, setHist] = useState<{ jobs: HistJob[]; preferred: PreferredPrice[] } | null>(null);
  const [addrs, setAddrs] = useState<Address[]>([]);
  const [savePref, setSavePref] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const [areaOpen, setAreaOpen] = useState<number | null>(null);
  const today = todayISO();
  const customer = contacts.find((c) => c.id === draft.customer_id) || null;

  // Load customer's history when the customer changes
  useEffect(() => {
    setHist(null);
    setShowPatterns(true);
    if (!draft.customer_id) return;
    customerHistory(draft.customer_id).then(setHist);
    if (!draft.id && customer?.wants_invoices && !draft.invoice_requested) setDraft({ ...draft, invoice_requested: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.customer_id]);

  // Addresses for everyone on this job
  const contactIds = useMemo(() => [draft.customer_id, ...draft.stops.map((s) => s.contact_id)].filter(Boolean) as string[], [draft.customer_id, draft.stops]);
  useEffect(() => { if (contactIds.length) loadAddresses(contactIds).then(setAddrs); else setAddrs([]); }, [contactIds.join(",")]); // eslint-disable-line

  const patterns: Pattern[] = useMemo(() => (hist ? patternsFor(hist.jobs, hist.preferred, today) : []), [hist, today]);

  // Live price suggestion for the trip as currently entered
  const key = draftPatternKey(draft);
  const priceSug = useMemo(() => {
    if (!hist) return null;
    const same = hist.jobs.filter((j) => draftPatternKeyFromHist(j) === key);
    return suggestPrice(key, same, hist.jobs, hist.preferred);
  }, [hist, key]);

  function applyPattern(p: Pattern) {
    setDraft({
      ...draft,
      stops: p.stops.map((s) => ({
        kind: s.kind, contact_id: s.contact_id, address_id: s.address_id, address_text: s.address_text || "",
        area: s.area || detectArea(s.address_text), instructions: s.instructions || "",
        suggested: ["contact", "address"],
      })),
      price: p.price ? String(p.price.amount) : draft.price,
      priceWhy: p.price?.why,
      description: draft.description || p.description || "",
      suggested: [...new Set([...(draft.suggested || []), ...(p.price ? ["price"] : []), ...(p.description && !draft.description ? ["description"] : [])])],
    });
    setShowPatterns(false);
  }

  function setStop(i: number, patch: Partial<DraftStop>, field?: string) {
    const stops = draft.stops.map((s, k) => (k === i ? { ...s, ...patch, suggested: field ? unsug(s.suggested, field) : s.suggested } : s));
    setDraft({ ...draft, stops });
  }
  function moveStop(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= draft.stops.length) return;
    const stops = [...draft.stops];
    [stops[i], stops[j]] = [stops[j], stops[i]];
    setDraft({ ...draft, stops });
  }

  const nameOf = (id: string | null) => contacts.find((c) => c.id === id)?.name || "";
  const onCreated = (c: Contact) => setContacts((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)));
  const sugField = (f: string) => (draft.suggested || []).includes(f);

  return (
    <div>
      {draft.flags && draft.flags.length > 0 && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          <b>Please check:</b>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>{draft.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      )}

      <div className="h2" style={{ marginTop: 4 }}>When</div>
      <div className="chips">
        {[today, addDays(today, 1)].map((d) => (
          <button type="button" key={d} className={"chip" + (draft.job_date === d ? " on" : "")} onClick={() => setDraft({ ...draft, job_date: d })}>{niceDate(d)}</button>
        ))}
        <label className={"chip" + (![today, addDays(today, 1)].includes(draft.job_date) ? " on" : "")} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
          {![today, addDays(today, 1)].includes(draft.job_date) ? niceDate(draft.job_date) : "Other day…"}
          <input type="date" value={draft.job_date} onChange={(e) => e.target.value && setDraft({ ...draft, job_date: e.target.value })} style={{ position: "absolute", inset: 0, opacity: 0 }} />
        </label>
      </div>

      <div className="h2">Who is ordering?</div>
      <ContactPicker
        contacts={contacts} ranked={ranked} value={draft.customer_id}
        onChange={(id) => setDraft({ ...draft, customer_id: id, suggested: unsug(draft.suggested, "customer") })}
        onCreated={onCreated} placeholder="Search customer…" suggested={sugField("customer")}
      />
      {customer?.instructions && <div className="note info" style={{ marginTop: 8 }}>📌 {customer.instructions}</div>}

      {draft.customer_id && patterns.length > 0 && showPatterns && (
        <>
          <div className="h2">Usual trips — tap one</div>
          {patterns.map((p) => (
            <button type="button" key={p.key} className="list-item" onClick={() => applyPattern(p)}>
              <div className="grow">
                {p.stops.map((s, i) => (
                  <div key={i} className="row" style={{ gap: 6 }}>
                    <span className={"tag " + (s.kind === "pickup" ? "pick" : "drop")}>{s.kind === "pickup" ? "From" : "To"}</span>
                    <span>{[nameOf(s.contact_id), s.address_text].filter(Boolean).join(" · ") || "—"}</span>
                  </div>
                ))}
                <div className="muted small" style={{ marginTop: 4 }}>{p.count}× · last {niceDate(p.lastDate)}</div>
              </div>
              {p.price && <div className="big-number" style={{ fontSize: 24 }}>{money(p.price.amount)}</div>}
            </button>
          ))}
          <button type="button" className="link" onClick={() => setShowPatterns(false)}>Something different</button>
        </>
      )}
      {draft.customer_id && hist && patterns.length > 0 && !showPatterns && (
        <button type="button" className="link" onClick={() => setShowPatterns(true)}>Show usual trips</button>
      )}

      {draft.customer_id && (<>
      <div className="h2">Stops</div>
      {draft.stops.map((s, i) => {
        const owner = s.contact_id || draft.customer_id;
        const known = addrs.filter((a) => a.contact_id === owner && a.line.toLowerCase() !== s.address_text.toLowerCase()).slice(0, 4);
        const sug = (f: string) => (s.suggested || []).includes(f);
        return (
          <div key={i} className="card" style={{ marginTop: 10 }}>
            <div className="row">
              <span className={"tag " + (s.kind === "pickup" ? "pick" : "drop")} style={{ fontSize: 15 }}>{i + 1}. {s.kind === "pickup" ? "Pick up" : "Drop off"}</span>
              <div className="grow" />
              {s.status === "done" && <span className="tag ok">Done</span>}
              <button type="button" className="btn sm ghost" onClick={() => moveStop(i, -1)} aria-label="Move up">↑</button>
              <button type="button" className="btn sm ghost" onClick={() => moveStop(i, 1)} aria-label="Move down">↓</button>
              <button type="button" className="btn sm ghost" onClick={() => setDraft({ ...draft, stops: draft.stops.filter((_, k) => k !== i) })} aria-label="Remove">✕</button>
            </div>
            <label className="f"><span>{s.kind === "pickup" ? "Picking up from" : "Delivering to"}</span></label>
            <ContactPicker
              contacts={contacts} value={s.contact_id}
              onChange={(id) => setStop(i, { contact_id: id }, "contact")}
              onCreated={onCreated} placeholder="Name (optional)" suggested={sug("contact")}
              quick={draft.customer_id && !s.contact_id ? [{ id: draft.customer_id, label: "Same as customer" }] : []}
            />
            <label className="f"><span>Address</span>
              <input className={"input" + (sug("address") ? " suggested" : "")} value={s.address_text} placeholder="Street, town"
                onChange={(e) => setStop(i, { address_text: e.target.value, address_id: null, area: detectArea(e.target.value) || s.area }, "address")} />
            </label>
            {known.length > 0 && (
              <div className="chips" style={{ marginTop: 8 }}>
                {known.map((a) => (
                  <button type="button" key={a.id} className="chip" onClick={() => setStop(i, { address_text: a.line, address_id: a.id, area: a.area || detectArea(a.line) }, "address")}>{a.line}</button>
                ))}
              </div>
            )}
            {sug("address") && <div className="small" style={{ color: "#7a5a00", marginTop: 4 }}>Suggested from past trips — check it</div>}
            {areaOpen === i ? (
              <div className="chips" style={{ marginTop: 10 }}>
                {AREAS.map((a) => (
                  <button type="button" key={a} className={"chip" + ((s.area || "Other") === a ? " on" : "")} style={{ minHeight: 40, fontSize: 15 }} onClick={() => { setStop(i, { area: a === "Other" ? null : a }); setAreaOpen(null); }}>{a}</button>
                ))}
              </div>
            ) : (
              <div className="small" style={{ marginTop: 6 }}>
                Route: <b>{s.area || "Other"}</b> <button type="button" className="link" style={{ padding: "0 6px" }} onClick={() => setAreaOpen(i)}>change</button>
              </div>
            )}
            <label className="f"><span>Instructions</span>
              <input className="input" value={s.instructions} placeholder="e.g. side door, call first" onChange={(e) => setStop(i, { instructions: e.target.value })} />
            </label>
          </div>
        );
      })}
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button type="button" className="btn" onClick={() => setDraft({ ...draft, stops: [...draft.stops, emptyStop("pickup")] })}>+ Pick up</button>
        <button type="button" className="btn" onClick={() => setDraft({ ...draft, stops: [...draft.stops, emptyStop("dropoff")] })}>+ Drop off</button>
      </div>

      <div className="h2">What is it?</div>
      <input className={"input" + (sugField("description") ? " suggested" : "")} value={draft.description} placeholder="e.g. 3 boxes, cake, 2 stops"
        onChange={(e) => setDraft({ ...draft, description: e.target.value, suggested: unsug(draft.suggested, "description") })} />

      <div className="h2">Price</div>
      <div className="row">
        <span className="big-number">$</span>
        <input className={"input money" + (sugField("price") ? " suggested" : "")} inputMode="decimal" value={draft.price} placeholder="0"
          onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^0-9.]/g, ""), priceWhy: undefined, suggested: unsug(draft.suggested, "price") })} />
      </div>
      {draft.priceWhy && <div className="small" style={{ color: "#7a5a00", marginTop: 6 }}>{draft.priceWhy}</div>}
      {priceSug && String(priceSug.amount) !== draft.price && (
        <button type="button" className="chip" style={{ marginTop: 8 }} onClick={() => setDraft({ ...draft, price: String(priceSug.amount), priceWhy: priceSug.why, suggested: [...unsug(draft.suggested, "price"), "price"] })}>
          Use {money(priceSug.amount)} — {priceSug.why}
        </button>
      )}
      {draft.customer_id && draft.price && (
        <label className="row" style={{ marginTop: 10, gap: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={savePref} onChange={(e) => setSavePref(e.target.checked)} style={{ width: 26, height: 26 }} />
          <span>Save {money(Number(draft.price))} as {customer?.name || "this customer"}&apos;s price for this trip</span>
        </label>
      )}

      <div className="h2">Notes</div>
      <textarea className="input" value={draft.notes} placeholder="Anything else" onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />

      <label className="row" style={{ marginTop: 14, gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={draft.invoice_requested} onChange={(e) => setDraft({ ...draft, invoice_requested: e.target.checked })} style={{ width: 26, height: 26 }} />
        <span>Customer wants an invoice</span>
      </label>
      </>)}

      <button type="button" className="btn primary block xl" style={{ marginTop: 22 }} disabled={saving || !draft.customer_id || draft.stops.length === 0} onClick={() => onSave(savePref)}>
        {saving ? "Saving…" : saveLabel || "Add to my jobs"}
      </button>
      {(!draft.customer_id || draft.stops.length === 0) && (
        <div className="muted small center" style={{ marginTop: 6 }}>{!draft.customer_id ? "Pick who is ordering first" : "Add at least one stop"}</div>
      )}
      {extraButtons}
    </div>
  );
}

function draftPatternKeyFromHist(j: HistJob) {
  return draftPatternKey({ stops: j.stops.map((s) => ({ ...s, address_text: s.address_text || "", instructions: "" })) } as unknown as Draft);
}

export async function afterSavePreferred(draft: Draft, save: boolean) {
  if (save && draft.customer_id && draft.price) await savePreferredPrice(draft.customer_id, draftPatternKey(draft), Number(draft.price));
}

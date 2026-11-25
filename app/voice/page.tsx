"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Shell, { toast } from "@/components/Shell";
import JobForm, { afterSavePreferred } from "@/components/JobForm";
import { useContacts } from "@/lib/useContacts";
import { customerHistory, emptyStop, loadAddresses, saveDraft, type Draft, type DraftStop } from "@/lib/data";
import { findMatches } from "@/lib/match";
import { patternsFor } from "@/lib/suggest";
import { detectArea } from "@/lib/areas";
import { todayISO } from "@/lib/dates";
import type { Address, Contact } from "@/lib/types";

type Extracted = {
  customer: string | null; date: string | null; description: string | null; price: number | null; notes: string | null; unclear: string[];
  stops: { kind: "pickup" | "dropoff"; name: string | null; address: string | null; instructions: string | null }[];
};

function match(name: string | null, contacts: Contact[], flags: string[], role: string): { id: string | null; sure: boolean } {
  if (!name) return { id: null, sure: false };
  const m = findMatches(name, contacts, 0.6);
  if (!m.length) { flags.push(`${role} “${name}” isn't saved yet — pick or add them.`); return { id: null, sure: false }; }
  const [top, second] = m;
  if (second && top.score - second.score < 0.06) {
    flags.push(`${role} “${name}” could be ${top.item.name} or ${second.item.name} — I picked ${top.item.name}.`);
    return { id: top.item.id, sure: false };
  }
  if (top.score < 0.97) {
    flags.push(`Heard “${name}”, matched to ${top.item.name}.`);
    return { id: top.item.id, sure: false };
  }
  return { id: top.item.id, sure: true };
}

async function toDraft(x: Extracted, contacts: Contact[], addrs: Address[]): Promise<Draft> {
  const flags: string[] = [...(x.unclear || [])];
  const suggested: string[] = [];
  const cust = match(x.customer, contacts, flags, "Customer");
  if (!x.customer) flags.push("No customer was mentioned.");
  if (cust.id && !cust.sure) suggested.push("customer");

  let stops: DraftStop[] = (x.stops || []).map((s) => {
    const m = match(s.name, contacts, flags, s.kind === "pickup" ? "Pickup" : "Drop-off");
    const st: DraftStop = {
      kind: s.kind === "pickup" ? "pickup" : "dropoff",
      contact_id: m.id, address_id: null, address_text: s.address || "", area: detectArea(s.address),
      instructions: s.instructions || "", suggested: m.id && !m.sure ? ["contact"] : [],
    };
    if (!st.address_text && m.id) {
      const known = addrs.find((a) => a.contact_id === m.id);
      if (known) {
        st.address_text = known.line; st.address_id = known.id; st.area = known.area || detectArea(known.line);
        st.suggested = [...(st.suggested || []), "address"];
      }
    }
    return st;
  });

  let price = x.price != null ? String(x.price) : "";
  let priceWhy: string | undefined;
  if (cust.id) {
    const h = await customerHistory(cust.id);
    const pats = patternsFor(h.jobs, h.preferred, todayISO());
    if (!stops.length && pats[0]) {
      // Memo only named the customer: offer their usual trip
      stops = pats[0].stops.map((s) => ({
        kind: s.kind, contact_id: s.contact_id, address_id: s.address_id, address_text: s.address_text || "",
        area: s.area || detectArea(s.address_text), instructions: s.instructions || "", suggested: ["contact", "address"],
      }));
      flags.push("No stops were said — filled in this customer's usual trip.");
    }
    if (!price) {
      const p = pats[0]?.price;
      if (p) { price = String(p.amount); priceWhy = p.why; suggested.push("price"); }
    }
  }
  if (!stops.length) stops = [emptyStop("pickup"), emptyStop("dropoff")];
  stops.forEach((s, i) => { if (!s.address_text) flags.push(`Stop ${i + 1} (${s.kind === "pickup" ? "pick up" : "drop off"}) has no address.`); });
  if (!price) flags.push("No price was said.");

  return {
    job_date: x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : todayISO(),
    customer_id: cust.id, description: x.description || "", notes: x.notes || "", price, priceWhy,
    invoice_requested: false, stops, suggested, flags: [...new Set(flags)], source: "voice",
  };
}

export default function Voice() {
  const router = useRouter();
  const { contacts, setContacts, ranked } = useContacts();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [transcript, setTranscript] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [idx, setIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const [typed, setTyped] = useState("");
  const [showType, setShowType] = useState(false);
  const chunks = useRef<Blob[]>([]);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!rec) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [rec]);
  // Stop automatically at 3 minutes so a forgotten recording doesn't cost money
  useEffect(() => { if (rec && secs >= 180) { rec.stop(); setRec(null); } }, [secs, rec]);

  async function start() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "";
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        send(new Blob(chunks.current, { type: r.mimeType || "audio/webm" }));
      };
      r.start();
      setSecs(0);
      setRec(r);
    } catch {
      setErr("The microphone is blocked. Allow the microphone for this app in your phone settings, or upload a voice memo instead.");
    }
  }
  function stop() { rec?.stop(); setRec(null); }

  async function send(audio: Blob | null, text = "") {
    setBusy("Listening to your memo…");
    setErr("");
    const fd = new FormData();
    if (audio) fd.append("audio", audio);
    if (text) fd.append("text", text);
    try {
      const r = await fetch("/api/voice", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setErr(j.error || "Something went wrong."); if (j.transcript) setTranscript(j.transcript); setBusy(null); return; }
      setTranscript(j.transcript);
      setBusy("Filling in the jobs…");
      const addrs = await loadAddresses();
      const ds = await Promise.all((j.jobs as Extracted[]).map((x) => toDraft(x, contacts, addrs)));
      if (!ds.length) setErr("I couldn't find any deliveries in that memo. Try again and say who, from where, and to where.");
      setDrafts(ds); setIdx(0);
    } catch {
      setErr("No connection. Try again.");
    }
    setBusy(null);
  }

  async function confirm(savePref: boolean) {
    setSaving(true);
    try {
      await saveDraft(drafts[idx]);
      await afterSavePreferred(drafts[idx], savePref);
      toast(`Job ${idx + 1} added ✓`);
      next();
    } catch (e: any) { toast("Couldn't save: " + e.message); }
    setSaving(false);
  }
  function next() {
    if (idx + 1 < drafts.length) { setIdx(idx + 1); window.scrollTo(0, 0); }
    else { setDrafts([]); router.push("/"); }
  }

  if (drafts.length) {
    return (
      <Shell title={`Check job ${idx + 1} of ${drafts.length}`}>
        <details className="card" style={{ marginBottom: 12 }}>
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>What I heard</summary>
          <p style={{ marginBottom: 0 }}>{transcript}</p>
        </details>
        <div className="note info small" style={{ marginBottom: 12 }}>
          <span className="tag sug">Yellow</span> = my guess from past trips, not from the memo. Check before saving.
        </div>
        <JobForm
          key={idx}
          draft={drafts[idx]}
          setDraft={(d) => setDrafts(drafts.map((x, i) => (i === idx ? d : x)))}
          contacts={contacts} setContacts={setContacts} ranked={ranked}
          onSave={confirm} saving={saving} saveLabel="✓ Looks good — add job"
          extraButtons={<button className="btn ghost block" style={{ marginTop: 10 }} onClick={next}>Skip this one</button>}
        />
      </Shell>
    );
  }

  return (
    <Shell title="Voice memo" back>
      <p className="center" style={{ fontSize: 20, margin: "8px 0 0" }}>
        {rec ? "Recording… tap to stop" : busy ? "" : "Tap and say the jobs"}
      </p>
      {!busy && (
        <button className={"mic" + (rec ? " rec" : "")} onClick={rec ? stop : start} aria-label={rec ? "Stop recording" : "Start recording"}>
          {rec ? "■" : "🎤"}
        </button>
      )}
      {rec && <p className="center big-number">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")} <span className="muted small">/ 3:00</span></p>}
      {busy && <div className="card center" style={{ marginTop: 30, padding: 30 }}><div style={{ fontSize: 40 }}>⏳</div><b>{busy}</b></div>}
      {err && <div className="note bad" style={{ marginTop: 12 }}>{err}</div>}
      {transcript && err && <div className="card small" style={{ marginTop: 8 }}>Heard: {transcript}</div>}

      {!rec && !busy && (
        <>
          <div className="note info small" style={{ marginTop: 16 }}>
            Example: “Gemsli, pick up at 333 Route 211, drop off in Monsey, 35 dollars. Then Em Kay from 203 Rutledge to Monroe.”
          </div>
          <input ref={file} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 10 * 1024 * 1024) { setErr("That memo is too long. Keep memos under about 5 minutes."); return; } send(f); }} />
          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => file.current?.click()}>📁 Upload memo</button>
            <button className="btn" onClick={() => setShowType(!showType)}>⌨️ Type it</button>
          </div>
          {showType && (
            <div style={{ marginTop: 12 }}>
              <textarea className="input" rows={4} placeholder="Type the jobs like you'd say them" value={typed} onChange={(e) => setTyped(e.target.value)} />
              <button className="btn primary block" style={{ marginTop: 8 }} disabled={!typed.trim()} onClick={() => send(null, typed)}>Read jobs</button>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}

"use client";
import { useMemo, useState } from "react";
import type { Contact } from "@/lib/types";
import { findMatches } from "@/lib/match";
import { createContact } from "@/lib/data";
import { toast } from "./Shell";

type Props = {
  contacts: Contact[];
  ranked?: string[];            // contact ids best-first, shown before typing
  value: string | null;
  onChange: (id: string | null) => void;
  onCreated: (c: Contact) => void;
  placeholder?: string;
  suggested?: boolean;
  quick?: { id: string; label: string }[]; // shortcut chips like "Same as customer"
  allowAdd?: boolean;
};

export default function ContactPicker({ contacts, ranked, value, onChange, onCreated, placeholder, suggested, quick, allowAdd = true }: Props) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = contacts.find((c) => c.id === value) || null;

  const list = useMemo(() => {
    if (q.trim()) return findMatches(q, contacts, 0.45).slice(0, 8).map((m) => m.item);
    const byId = new Map(contacts.map((c) => [c.id, c]));
    return (ranked || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 6) as Contact[];
  }, [q, contacts, ranked]);

  if (selected) {
    return (
      <div className={"card row" + (suggested ? " suggested" : "")} style={{ padding: 10 }}>
        <div className="avatar">{selected.name[0]?.toUpperCase()}</div>
        <div className="grow">
          <div style={{ fontWeight: 800 }}>{selected.name}</div>
          <div className="muted small">{selected.phone || "No phone saved"}{suggested ? " · suggested" : ""}</div>
        </div>
        <button type="button" className="btn sm ghost" onClick={() => { onChange(null); setQ(""); }}>Change</button>
      </div>
    );
  }

  async function add() {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const c = await createContact({ name: q.trim(), phone: phone.trim() || null });
      onCreated(c);
      onChange(c.id);
      setAdding(false); setQ(""); setPhone("");
    } catch (e: any) {
      toast("Couldn't save: " + e.message);
    }
    setBusy(false);
  }

  return (
    <div>
      {quick && quick.length > 0 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {quick.map((x) => <button key={x.id + x.label} type="button" className="chip" onClick={() => onChange(x.id)}>{x.label}</button>)}
        </div>
      )}
      <input className="input" placeholder={placeholder || "Type a name…"} value={q} onChange={(e) => { setQ(e.target.value); setAdding(false); }} />
      <div style={{ marginTop: 8 }}>
        {list.map((c) => (
          <button type="button" key={c.id} className="list-item" onClick={() => onChange(c.id)}>
            <div className="avatar">{c.name[0]?.toUpperCase()}</div>
            <div className="grow">
              <div style={{ fontWeight: 800 }}>{c.name}</div>
              {c.phone && <div className="muted small">{c.phone}</div>}
            </div>
          </button>
        ))}
      </div>
      {allowAdd && q.trim() && !adding && (
        <button type="button" className="btn block" style={{ marginTop: 8 }} onClick={() => setAdding(true)}>+ Add new: “{q.trim()}”</button>
      )}
      {adding && (
        <div className="card" style={{ marginTop: 8 }}>
          <div style={{ fontWeight: 800 }}>New: {q.trim()}</div>
          <label className="f"><span>Phone (optional)</span>
            <input className="input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" className="btn primary" disabled={busy} onClick={add}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell, { toast } from "@/components/Shell";
import { sb } from "@/lib/supabase-browser";

type Preset = { id: string; label: string; amount: number; sort: number };
type Flag = { id: string; kind: string; message: string; job_id: string | null; contact_id: string | null; created_at: string };

export default function Settings() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagCount, setFlagCount] = useState(0);
  const [n, setN] = useState({ label: "", amount: "" });
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    const [p, f, u] = await Promise.all([
      sb().from("extra_presets").select("*").order("sort"),
      sb().from("review_flags").select("*", { count: "exact" }).eq("resolved", false).order("created_at", { ascending: false }).limit(30),
      sb().auth.getUser(),
    ]);
    setPresets((p.data || []).map((x: any) => ({ ...x, amount: Number(x.amount) })));
    setFlags((f.data || []) as Flag[]);
    setFlagCount(f.count || 0);
    setEmail(u.data.user?.email || "");
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addPreset() {
    await sb().from("extra_presets").insert({ label: n.label.trim(), amount: Number(n.amount), sort: presets.length + 1 });
    setN({ label: "", amount: "" });
    load();
  }
  async function updatePreset(p: Preset, amount: string) {
    await sb().from("extra_presets").update({ amount: Number(amount) || 0 }).eq("id", p.id);
    toast("Saved");
    load();
  }
  async function removePreset(p: Preset) {
    await sb().from("extra_presets").delete().eq("id", p.id);
    load();
  }
  async function resolve(f: Flag) {
    await sb().from("review_flags").update({ resolved: true }).eq("id", f.id);
    load();
  }

  return (
    <Shell title="Settings" back>
      <div className="h2" style={{ marginTop: 0 }}>Quick extra charges</div>
      <p className="muted small" style={{ marginTop: 0 }}>These show as one-tap buttons on every job.</p>
      {presets.map((p) => (
        <div key={p.id} className="card row" style={{ marginTop: 6, padding: 10 }}>
          <div className="grow"><b>{p.label}</b></div>
          <span>$</span>
          <input className="input" style={{ width: 90, minHeight: 44 }} inputMode="decimal" defaultValue={p.amount} onBlur={(e) => Number(e.target.value) !== p.amount && updatePreset(p, e.target.value)} />
          <button className="btn sm ghost" onClick={() => removePreset(p)} aria-label="Remove">✕</button>
        </div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        <input className="input grow" placeholder="New charge, e.g. Heavy item" value={n.label} onChange={(e) => setN({ ...n, label: e.target.value })} />
        <input className="input" style={{ width: 100 }} placeholder="$" inputMode="decimal" value={n.amount} onChange={(e) => setN({ ...n, amount: e.target.value.replace(/[^0-9.]/g, "") })} />
      </div>
      <button className="btn block" style={{ marginTop: 8 }} disabled={!n.label.trim() || !n.amount} onClick={addPreset}>+ Add quick charge</button>

      <div className="h2">Things to check {flagCount > 0 && `(${flagCount})`}</div>
      {flags.length === 0 && <div className="card center muted">Nothing to check 👍</div>}
      {flags.map((f) => (
        <div key={f.id} className="card" style={{ marginTop: 6 }}>
          <div className="small">{f.message}</div>
          <div className="row" style={{ marginTop: 8 }}>
            {f.job_id && <Link href={`/job/${f.job_id}`} className="btn sm">Open job</Link>}
            {f.contact_id && <Link href={`/customers/${f.contact_id}`} className="btn sm">Open customer</Link>}
            <div className="grow" />
            <button className="btn sm ghost" onClick={() => resolve(f)}>✓ OK</button>
          </div>
        </div>
      ))}

      <div className="h2">Old spreadsheet</div>
      <Link href="/import" className="btn block">📥 Import from Google Sheet</Link>

      <div className="h2">Install on phone</div>
      <div className="card small">
        <b>iPhone:</b> in Safari tap Share → “Add to Home Screen”.<br />
        <b>Android:</b> in Chrome tap ⋮ → “Add to Home screen”.
      </div>

      <div className="h2">Account</div>
      <div className="card">
        <div className="muted small">Signed in as {email}</div>
        <button className="btn block" style={{ marginTop: 10 }} onClick={async () => { await sb().auth.signOut(); window.location.href = "/login"; }}>Sign out</button>
      </div>
      <p className="muted small center" style={{ marginTop: 20 }}>Spitzer&apos;s Express · 845-781-6392</p>
    </Shell>
  );
}

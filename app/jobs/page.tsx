"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { loadAddresses, loadCustomerStats } from "@/lib/data";
import { sb } from "@/lib/supabase-browser";
import { loadContacts, loadMoney } from "@/lib/data";
import type { Contact, Job, JobMoney, Stop } from "@/lib/types";
import { niceDate, todayISO } from "@/lib/dates";
import { periodRange, type PeriodMode } from "@/lib/periods";
import { buildWorkbook, type ExJob } from "@/lib/exportSheet";
import { toast } from "@/components/Shell";
import { money } from "@/lib/money";
import { norm } from "@/lib/match";

type Row = Job & { stops: Stop[]; money?: JobMoney };

const STATUS = [
  ["all", "All"], ["open", "Not done"], ["delivered", "Delivered"], ["unpaid", "Unpaid"], ["invoice", "Invoice wanted"], ["cancelled", "Cancelled"],
] as const;
const MODES: [PeriodMode, string][] = [["week", "Week"], ["month", "Month"], ["year", "Year"], ["custom", "Custom"], ["upcoming", "Upcoming"], ["all", "All"]];

export default function AllJobs() {
  const [status, setStatus] = useState<(typeof STATUS)[number][0]>("all");
  const [mode, setMode] = useState<PeriodMode>("week");
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState({ from: todayISO().slice(0, 8) + "01", to: todayISO() });
  const [exporting, setExporting] = useState(false);
  const period = periodRange(mode, offset, todayISO(), custom);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = sb().from("jobs").select("*, stops(*)");
    if (period.from) query = query.gte("job_date", period.from);
    if (period.to) query = query.lte("job_date", period.to);
    if (status === "cancelled") query = query.eq("delivery_status", "cancelled");
    else if (status !== "all") query = query.neq("delivery_status", "cancelled");
    if (status === "open") query = query.in("delivery_status", ["upcoming", "picked_up"]);
    if (status === "delivered") query = query.eq("delivery_status", "delivered");
    if (status === "invoice") query = query.eq("invoice_requested", true).is("invoice_id", null);
    query = query.order("job_date", { ascending: mode === "upcoming" }).order("created_at", { ascending: false }).limit(5000);
    const [{ data }, cs] = await Promise.all([query, loadContacts()]);
    const list = (data || []) as Row[];
    const m = await loadMoney(list.map((j) => j.id));
    list.forEach((j) => { j.money = m[j.id]; j.stops.sort((a, b) => a.seq - b.seq); });
    setRows(status === "unpaid" ? list.filter((j) => (j.money?.balance || 0) > 0.004) : list);
    setContacts(Object.fromEntries(cs.map((c) => [c.id, c])));
    setLoading(false);
  }, [status, period.from, period.to, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportExcel() {
    if (!shown.length) { toast("No jobs to export"); return; }
    setExporting(true);
    try {
      const ids = shown.map((j) => j.id);
      const extras: Record<string, { label: string; amount: number }[]> = {};
      const pays: Record<string, { amount: number; method: string | null }[]> = {};
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [ex, al] = await Promise.all([
          sb().from("job_extras").select("job_id, label, amount").in("job_id", chunk),
          sb().from("payment_allocations").select("job_id, amount, payments(method)").in("job_id", chunk),
        ]);
        (ex.data || []).forEach((e: any) => (extras[e.job_id] = [...(extras[e.job_id] || []), { label: e.label, amount: Number(e.amount) }]));
        (al.data || []).forEach((a: any) => (pays[a.job_id] = [...(pays[a.job_id] || []), { amount: Number(a.amount), method: a.payments?.method || null }]));
      }
      const invIds = [...new Set(shown.map((j) => j.invoice_id).filter(Boolean))] as string[];
      const { data: invs } = invIds.length ? await sb().from("invoices").select("id, number").in("id", invIds) : { data: [] };
      const invNum = Object.fromEntries((invs || []).map((x: any) => [x.id, x.number]));
      const name = (id: string | null) => (id ? contacts[id]?.name || "" : "");
      const exJobs: ExJob[] = shown.map((j) => ({
        id: j.id, job_date: j.job_date, customer: name(j.customer_id), description: j.description, notes: j.notes,
        delivery_status: j.delivery_status, invoice_requested: j.invoice_requested, invoice_number: j.invoice_id ? invNum[j.invoice_id] || null : null,
        stops: j.stops.map((s) => ({ kind: s.kind, address_text: s.address_text, contact: s.contact_id && s.contact_id !== j.customer_id ? name(s.contact_id) : null })),
        extras: extras[j.id] || [],
        total: j.money?.total ?? Number(j.price || 0), paid: j.money?.paid || 0, balance: j.money?.balance ?? Number(j.price || 0),
        payments: pays[j.id] || [],
      }));
      const [stats, addrs] = await Promise.all([loadCustomerStats(), loadAddresses()]);
      const billing = Object.values(contacts).filter((c) => stats[c.id]?.jobs_total);
      const tabs = buildWorkbook(exJobs, billing.map((c) => ({
        name: c.name, phone: c.phone, email: c.invoice_email || c.email,
        address: addrs.find((a) => a.contact_id === c.id)?.line || null, balance: stats[c.id]?.balance || 0,
      })));
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const t of tabs) {
        const ws = XLSX.utils.aoa_to_sheet(t.rows);
        ws["!cols"] = t.name === "Open Balances" ? [{ wch: 28 }, { wch: 12 }] : t.name === "Customer Info" ? [{ wch: 28 }, { wch: 34 }, { wch: 16 }, { wch: 30 }] : [{ wch: 10 }, { wch: 24 }, { wch: 26 }, { wch: 26 }, { wch: 22 }, { wch: 9 }, { wch: 20 }, { wch: 26 }];
        XLSX.utils.book_append_sheet(wb, ws, t.name);
      }
      XLSX.writeFile(wb, `Spitzers Express - ${period.label.replace(/[^\w ,–-]/g, "").replace(/–/g, "-")}.xlsx`);
      toast("Excel file downloaded ✓");
    } catch (e: any) {
      toast("Export failed: " + e.message);
    }
    setExporting(false);
  }
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const n = norm(q);
    if (!n) return rows;
    return rows.filter((j) => {
      const text = [contacts[j.customer_id || ""]?.name, j.description, j.notes, ...j.stops.map((s) => s.address_text), ...j.stops.map((s) => contacts[s.contact_id || ""]?.name)].join(" ");
      return norm(text).includes(n);
    });
  }, [rows, q, contacts]);

  const total = shown.reduce((s, j) => s + (j.money?.total || 0), 0);
  const owed = shown.reduce((s, j) => s + Math.max(0, j.money?.balance || 0), 0);

  // group by date
  const groups = useMemo(() => {
    const g = new Map<string, Row[]>();
    shown.forEach((j) => g.set(j.job_date, [...(g.get(j.job_date) || []), j]));
    return [...g.entries()];
  }, [shown]);

  return (
    <Shell title="Jobs">
      <input className="input" placeholder="🔍 Search customer, address, item…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips" style={{ marginTop: 10 }}>
        {MODES.map(([v, l]) => <button key={v} className={"chip" + (mode === v ? " on" : "")} onClick={() => { setMode(v); setOffset(0); }}>{l}</button>)}
      </div>
      {(mode === "week" || mode === "month" || mode === "year") && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => setOffset(offset - 1)} aria-label="Previous">‹</button>
          <div className="grow center" style={{ fontWeight: 800, fontSize: 18 }}>{period.label}</div>
          <button className="btn sm" onClick={() => setOffset(offset + 1)} aria-label="Next">›</button>
        </div>
      )}
      {mode === "custom" && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <label className="f" style={{ marginTop: 0 }}><span>From</span><input className="input" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="f" style={{ marginTop: 0 }}><span>To</span><input className="input" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} /></label>
        </div>
      )}
      <div className="chips" style={{ marginTop: 8 }}>
        {STATUS.map(([v, l]) => <button key={v} className={"chip" + (status === v ? " on" : "")} style={{ minHeight: 42, fontSize: 15 }} onClick={() => setStatus(v)}>{l}</button>)}
      </div>

      <div className="summary" style={{ marginTop: 12 }}>
        <div><b>{shown.length}</b><span>jobs</span></div>
        <div><b>{money(total)}</b><span>charges</span></div>
        <div><b style={{ color: owed > 0 ? "var(--red)" : undefined }}>{money(owed)}</b><span>still owed</span></div>
      </div>

      <button className="btn dark block" style={{ marginTop: 10 }} disabled={exporting || loading || !shown.length} onClick={exportExcel}>
        {exporting ? "Making Excel file…" : `📥 Download Excel (${shown.length} jobs)`}
      </button>

      {loading && <p className="muted center">Loading…</p>}
      {!loading && shown.length === 0 && <div className="card center" style={{ marginTop: 12 }}>No jobs match.</div>}

      {groups.map(([date, list]) => (
        <section key={date}>
          <div className="h2">{niceDate(date)} · {list.length}</div>
          {list.map((j) => {
            const c = contacts[j.customer_id || ""];
            const ds = j.delivery_status;
            const ps = j.money?.payment_status;
            return (
              <Link key={j.id} href={`/job/${j.id}`} className="list-item">
                <div className="grow">
                  <div style={{ fontWeight: 800 }}>{c?.name || "No customer"}</div>
                  <div className="small">{j.stops.map((s) => s.address_text?.split(",")[0]).filter(Boolean).join(" → ") || j.description || "—"}</div>
                  <div className="row wrap" style={{ gap: 4, marginTop: 4 }}>
                    <span className={"tag " + (ds === "delivered" ? "ok" : ds === "cancelled" ? "grey" : ds === "picked_up" ? "pick" : "warn")}>
                      {ds === "delivered" ? "Delivered" : ds === "cancelled" ? "Cancelled" : ds === "picked_up" ? "Picked up" : "To do"}
                    </span>
                    {ds !== "cancelled" && ps && <span className={"tag " + (ps === "paid" ? "ok" : ps === "partial" ? "warn" : "bad")}>{ps === "paid" ? "Paid" : ps === "partial" ? "Part paid" : "Unpaid"}</span>}
                    {j.invoice_requested && !j.invoice_id && <span className="tag grey">Invoice</span>}
                  </div>
                </div>
                <b>{money(j.money?.total ?? j.price)}</b>
              </Link>
            );
          })}
        </section>
      ))}
    </Shell>
  );
}

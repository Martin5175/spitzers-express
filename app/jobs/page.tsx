"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { sb } from "@/lib/supabase-browser";
import { loadContacts, loadMoney } from "@/lib/data";
import type { Contact, Job, JobMoney, Stop } from "@/lib/types";
import { addDays, niceDate, todayISO } from "@/lib/dates";
import { money } from "@/lib/money";
import { norm } from "@/lib/match";

type Row = Job & { stops: Stop[]; money?: JobMoney };

const STATUS = [
  ["all", "All"], ["open", "Not done"], ["delivered", "Delivered"], ["unpaid", "Unpaid"], ["invoice", "Invoice wanted"], ["cancelled", "Cancelled"],
] as const;
const RANGE = [
  ["upcoming", "Upcoming"], ["week", "Last 7 days"], ["month", "Last 30 days"], ["all", "Everything"],
] as const;

export default function AllJobs() {
  const [status, setStatus] = useState<(typeof STATUS)[number][0]>("all");
  const [range, setRange] = useState<(typeof RANGE)[number][0]>("week");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const t = todayISO();
    let query = sb().from("jobs").select("*, stops(*)");
    if (range === "upcoming") query = query.gte("job_date", t);
    if (range === "week") query = query.gte("job_date", addDays(t, -7));
    if (range === "month") query = query.gte("job_date", addDays(t, -30));
    if (status === "cancelled") query = query.eq("delivery_status", "cancelled");
    else if (status !== "all") query = query.neq("delivery_status", "cancelled");
    if (status === "open") query = query.in("delivery_status", ["upcoming", "picked_up"]);
    if (status === "delivered") query = query.eq("delivery_status", "delivered");
    if (status === "invoice") query = query.eq("invoice_requested", true).is("invoice_id", null);
    query = query.order("job_date", { ascending: range === "upcoming" }).order("created_at", { ascending: false }).limit(1000);
    const [{ data }, cs] = await Promise.all([query, loadContacts()]);
    const list = (data || []) as Row[];
    const m = await loadMoney(list.map((j) => j.id));
    list.forEach((j) => { j.money = m[j.id]; j.stops.sort((a, b) => a.seq - b.seq); });
    setRows(status === "unpaid" ? list.filter((j) => (j.money?.balance || 0) > 0.004) : list);
    setContacts(Object.fromEntries(cs.map((c) => [c.id, c])));
    setLoading(false);
  }, [status, range]);
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
    <Shell title="All jobs" back>
      <input className="input" placeholder="🔍 Search customer, address, item…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips" style={{ marginTop: 10 }}>
        {RANGE.map(([v, l]) => <button key={v} className={"chip" + (range === v ? " on" : "")} onClick={() => setRange(v)}>{l}</button>)}
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        {STATUS.map(([v, l]) => <button key={v} className={"chip" + (status === v ? " on" : "")} style={{ minHeight: 42, fontSize: 15 }} onClick={() => setStatus(v)}>{l}</button>)}
      </div>

      <div className="summary" style={{ marginTop: 12 }}>
        <div><b>{shown.length}</b><span>jobs</span></div>
        <div><b>{money(total)}</b><span>charges</span></div>
        <div><b style={{ color: owed > 0 ? "var(--red)" : undefined }}>{money(owed)}</b><span>still owed</span></div>
      </div>

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

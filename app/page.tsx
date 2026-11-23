"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Shell, { toast } from "@/components/Shell";
import PhotoButton from "@/components/PhotoButton";
import { sb } from "@/lib/supabase-browser";
import { loadContacts, loadJobs, setStopDone } from "@/lib/data";
import type { Contact, JobFull, Stop } from "@/lib/types";
import { AREAS } from "@/lib/areas";
import { mapsLinks } from "@/lib/maps";
import { addDays, niceDate, todayISO } from "@/lib/dates";
import { money } from "@/lib/money";

type Row = Stop & { job: JobFull };

function Today() {
  const params = useSearchParams();
  const router = useRouter();
  const [date, setDate] = useState(params.get("date") || todayISO());
  const [jobs, setJobs] = useState<JobFull[]>([]);
  const [contacts, setContacts] = useState<Record<string, Contact>>({});
  const [loading, setLoading] = useState(true);
  const [leftover, setLeftover] = useState<string[]>([]);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(async () => {
    const [j, c] = await Promise.all([loadJobs({ date }), loadContacts()]);
    setJobs(j.filter((x) => x.delivery_status !== "cancelled"));
    setContacts(Object.fromEntries(c.map((x) => [x.id, x])));
    setLoading(false);
    if (date === todayISO()) {
      const { data } = await sb().from("jobs").select("id").lt("job_date", date).in("delivery_status", ["upcoming", "picked_up"]).limit(200);
      setLeftover((data || []).map((x: any) => x.id));
    } else setLeftover([]);
  }, [date]);
  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { router.replace(date === todayISO() ? "/" : `/?date=${date}`); }, [date]); // eslint-disable-line

  const rows: Row[] = useMemo(
    () => jobs.flatMap((j) => j.stops.map((s) => ({ ...s, job: j }))).sort((a, b) => Number(a.route_order) - Number(b.route_order) || a.seq - b.seq),
    [jobs]
  );
  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status === "done");
  const groups = AREAS.map((a) => ({ area: a, stops: pending.filter((r) => (r.area || "Other") === a) })).filter((g) => g.stops.length);

  const name = (id: string | null) => (id ? contacts[id]?.name || "" : "");
  const phone = (id: string | null) => (id ? contacts[id]?.phone || "" : "");

  async function move(r: Row, dir: -1 | 1) {
    const list = pending.filter((x) => (x.area || "Other") === (r.area || "Other"));
    const i = list.findIndex((x) => x.id === r.id);
    const other = list[i + dir];
    if (!other) return;
    const a = Number(r.route_order), b = Number(other.route_order);
    const na = a === b ? b + dir * 0.5 : b, nb = a;
    await Promise.all([
      sb().from("stops").update({ route_order: na }).eq("id", r.id),
      sb().from("stops").update({ route_order: nb }).eq("id", other.id),
    ]);
    load();
  }
  async function pickedUp(r: Row) {
    await setStopDone(r.id, r.job_id, true);
    toast("Picked up ✓");
    load();
  }
  async function undo(r: Row) {
    await setStopDone(r.id, r.job_id, false);
    load();
  }
  async function moveLeftoverToToday() {
    await sb().from("jobs").update({ job_date: todayISO() }).in("id", leftover);
    toast("Moved to today");
    load();
  }

  const earned = jobs.reduce((s, j) => s + (j.money?.total || 0), 0);
  const picks = pending.filter((r) => r.kind === "pickup").length;
  const drops = pending.filter((r) => r.kind === "dropoff").length;

  return (
    <Shell
      title="My Jobs"
      headerExtra={
        <div className="datebar">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
          <div className="d">{niceDate(date)}<input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
        </div>
      }
    >
      {leftover.length > 0 && (
        <div className="note warn" style={{ marginBottom: 12 }}>
          <b>{leftover.length} unfinished job{leftover.length > 1 ? "s" : ""} from earlier days.</b>
          <button className="btn sm block" style={{ marginTop: 8 }} onClick={moveLeftoverToToday}>Move them to today</button>
        </div>
      )}

      <div className="summary">
        <div><b>{picks}</b><span>to pick up</span></div>
        <div><b>{drops}</b><span>to deliver</span></div>
        <div><b>{done.length}</b><span>done</span></div>
      </div>

      {loading && <p className="muted center">Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className="card center" style={{ marginTop: 16, padding: 28 }}>
          <div style={{ fontSize: 44 }}>🚚</div>
          <div className="card-title">No jobs {niceDate(date).toLowerCase() === "today" ? "yet today" : "this day"}</div>
          <div className="btn-row" style={{ marginTop: 16 }}>
            <Link href="/new" className="btn primary">+ New job</Link>
            <Link href="/voice" className="btn">🎤 Voice</Link>
          </div>
        </div>
      )}

      {groups.map((g) => {
        const links = mapsLinks(g.stops.map((r) => ({ address: r.address_text || "", area: r.area })));
        const noAddr = g.stops.filter((r) => !r.address_text).length;
        return (
          <section key={g.area}>
            <div className="card area" style={{ marginTop: 18 }}>
              <div className="area-head">
                <div className="area-name">{g.area}</div>
                <span className="tag grey">{g.stops.length} stop{g.stops.length > 1 ? "s" : ""}</span>
              </div>
              {links.map((l, i) => (
                <a key={i} href={l} target="_blank" rel="noreferrer" className="btn dark block" style={{ marginTop: 10 }}>
                  🗺️ Open {g.area} route{links.length > 1 ? ` (part ${i + 1})` : ""} in Google Maps
                </a>
              ))}
              {noAddr > 0 && <div className="muted small" style={{ marginTop: 6 }}>{noAddr} stop{noAddr > 1 ? "s have" : " has"} no address and {noAddr > 1 ? "aren't" : "isn't"} in the map link.</div>}
            </div>
            {g.stops.map((r, i) => {
              const who = name(r.contact_id) || name(r.job.customer_id);
              const tel = phone(r.contact_id) || phone(r.job.customer_id);
              const pickupPending = r.kind === "dropoff" && r.job.stops.some((s) => s.kind === "pickup" && s.status === "pending");
              return (
                <div key={r.id} className="card" style={{ marginTop: 8 }}>
                  <div className="stop">
                    <div className="stop-main">
                      <div className="row wrap" style={{ gap: 6 }}>
                        <span className={"tag " + (r.kind === "pickup" ? "pick" : "drop")}>{r.kind === "pickup" ? "Pick up" : "Drop off"}</span>
                        {pickupPending && <span className="tag grey">not picked up yet</span>}
                      </div>
                      <Link href={`/job/${r.job_id}`}>
                        <div className="stop-name" style={{ marginTop: 6 }}>{who || "—"}</div>
                        <div className="stop-addr">{r.address_text || <span className="muted">No address</span>}</div>
                        {r.job.customer_id && r.contact_id && r.contact_id !== r.job.customer_id && <div className="muted small">for {name(r.job.customer_id)}</div>}
                        {r.instructions && <div className="small" style={{ marginTop: 4 }}>📌 {r.instructions}</div>}
                        {r.job.description && <div className="muted small">📦 {r.job.description}</div>}
                      </Link>
                    </div>
                    <div className="order">
                      <button onClick={() => move(r, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button onClick={() => move(r, 1)} disabled={i === g.stops.length - 1} aria-label="Move down">↓</button>
                    </div>
                  </div>
                  <div style={{ marginTop: 10 }} className={tel ? "btn-row" : ""}>
                    {r.kind === "pickup" ? (
                      <button className="btn primary block" onClick={() => pickedUp(r)}>✓ Picked up</button>
                    ) : (
                      <PhotoButton jobId={r.job_id} stopId={r.id} onDone={load} className="btn green block" label="📷 Delivered" />
                    )}
                    {tel && <a className="btn block" href={`tel:${tel}`}>📞 Call</a>}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}

      {done.length > 0 && (
        <>
          <button className="btn ghost block" style={{ marginTop: 20 }} onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hide" : "Show"} finished stops ({done.length})
          </button>
          {showDone && done.map((r) => (
            <div key={r.id} className="card done row" style={{ marginTop: 8 }}>
              <Link href={`/job/${r.job_id}`} className="grow">
                <span className="tag ok">{r.kind === "pickup" ? "Picked up" : "Delivered"}</span>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{name(r.contact_id) || name(r.job.customer_id)}</div>
                <div className="small">{r.address_text}</div>
              </Link>
              <button className="btn sm ghost" onClick={() => undo(r)}>Undo</button>
            </div>
          ))}
        </>
      )}

      {rows.length > 0 && (
        <div className="muted small center" style={{ marginTop: 20 }}>
          {jobs.length} job{jobs.length > 1 ? "s" : ""} · {money(earned)} in charges
        </div>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense><Today /></Suspense>;
}

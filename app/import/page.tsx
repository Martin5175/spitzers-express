"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { sb } from "@/lib/supabase-browser";
import { parseCustomerSheet, parseDeliverySheet, stripCardData, type ImportedContact, type ImportedRow } from "@/lib/importSheet";
import { duplicateGroups, norm } from "@/lib/match";
import { detectArea } from "@/lib/areas";
import { allocateOldestFirst, money } from "@/lib/money";
import type { Contact } from "@/lib/types";

type Parsed = { rows: ImportedRow[]; contacts: ImportedContact[]; balances: { name: string; amount: string; ref: string }[]; tabs: { name: string; kind: string; count: number }[] };
type Group = { names: string[]; keep: string; merge: boolean };

const uuid = () => crypto.randomUUID();
async function chunked<T>(table: string, rows: T[], size = 400) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await sb().from(table).insert(rows.slice(i, i + size) as any);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

export default function ImportPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [err, setErr] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function readFile(f: File) {
    setErr(""); setParsed(null); setDone(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const out: Parsed = { rows: [], contacts: [], balances: [], tabs: [] };
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" });
        if (/customer/i.test(name)) {
          const c = parseCustomerSheet(name, rows);
          out.contacts.push(...c); out.tabs.push({ name, kind: "Customers", count: c.length });
        } else if (/balance/i.test(name)) {
          let n = 0;
          rows.forEach((r, i) => {
            const cells = r.map((x) => String(x ?? "").trim()).filter(Boolean);
            const amt = cells.find((x) => /^\$?-?\d+(\.\d+)?$/.test(x.replace(/,/g, "")));
            const nm = cells.find((x) => /[a-z]/i.test(x) && !/name|balance|total|customer/i.test(x));
            if (nm && amt) { out.balances.push({ name: stripCardData(nm).text, amount: amt, ref: `${name}!row ${i + 1}` }); n++; }
          });
          out.tabs.push({ name, kind: "Open balances (for checking)", count: n });
        } else {
          const r = parseDeliverySheet(name, rows, year);
          if (r.length) { out.rows.push(...r); out.tabs.push({ name, kind: "Deliveries", count: r.length }); }
          else out.tabs.push({ name, kind: "Skipped (no delivery table found)", count: 0 });
        }
      }
      out.rows.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
      setParsed(out);
      const names = [...out.rows.map((r) => r.customer.trim()), ...out.contacts.map((c) => c.name.trim())];
      setGroups(duplicateGroups(names).map((g) => {
        const counts = g.map((n) => names.filter((x) => x === n).length);
        return { names: g, keep: g[counts.indexOf(Math.max(...counts))], merge: true };
      }));
    } catch (e: any) {
      setErr("Couldn't read that file. In Google Sheets choose File → Download → Microsoft Excel (.xlsx), then pick that file here. (" + e.message + ")");
    }
  }

  const stats = useMemo(() => {
    if (!parsed) return null;
    const flagged = parsed.rows.filter((r) => r.flags.length).length;
    const cards = parsed.rows.filter((r) => r.flags.some((f) => f.includes("Card"))).length;
    const total = parsed.rows.reduce((s, r) => s + (r.rate || 0), 0);
    return { flagged, cards, total };
  }, [parsed]);

  async function runImport() {
    if (!parsed) return;
    try {
      const s = sb();
      setProgress("Checking what's already imported…");
      const { data: already } = await s.from("jobs").select("import_ref").not("import_ref", "is", null).limit(50000);
      const seen = new Set((already || []).map((x: any) => x.import_ref));
      const rows = parsed.rows.filter((r) => !seen.has(r.ref));

      // Canonical names
      const canon = new Map<string, string>();
      for (const g of groups) if (g.merge) g.names.forEach((n) => canon.set(n, g.keep));
      const nameOf = (n: string) => canon.get(n.trim()) || n.trim();

      setProgress("Saving customers…");
      const { data: existing } = await s.from("contacts").select("*").limit(5000);
      const byNorm = new Map<string, Contact>();
      (existing || []).forEach((c: any) => [c.name, ...(c.aliases || [])].forEach((n: string) => byNorm.set(norm(n), c)));
      const contactId = new Map<string, string>();
      const newContacts: any[] = [];
      const allNames = new Set([...rows.map((r) => nameOf(r.customer)), ...parsed.contacts.map((c) => nameOf(c.name))]);
      for (const n of allNames) {
        const ex = byNorm.get(norm(n));
        if (ex) { contactId.set(n, ex.id); continue; }
        const id = uuid();
        const aliases = groups.find((g) => g.merge && g.keep === n)?.names.filter((x) => x !== n) || [];
        const info = parsed.contacts.filter((c) => nameOf(c.name) === n);
        newContacts.push({
          id, name: n, aliases,
          phone: info.find((c) => c.phone)?.phone || null,
          email: info.find((c) => c.email)?.email || null,
          notes: info.length ? info.map((c) => `From sheet (${c.ref}): ${c.notes}`).join("\n") : null,
        });
        contactId.set(n, id);
        byNorm.set(norm(n), { id, name: n } as Contact);
      }
      await chunked("contacts", newContacts);

      setProgress("Saving addresses…");
      const { data: exAddr } = await s.from("addresses").select("id, contact_id, line").limit(20000);
      const addrKey = (cid: string, line: string) => cid + "|" + line.trim().toLowerCase();
      const addrId = new Map<string, string>((exAddr || []).map((a: any) => [addrKey(a.contact_id || "", a.line), a.id]));
      const newAddr: any[] = [];
      const getAddr = (cid: string, line: string | null) => {
        if (!line) return null;
        const k = addrKey(cid, line);
        if (!addrId.has(k)) { const id = uuid(); addrId.set(k, id); newAddr.push({ id, contact_id: cid, line: line.trim(), area: detectArea(line) }); }
        return addrId.get(k)!;
      };

      const jobs: any[] = [], stops: any[] = [], pays: any[] = [], allocs: any[] = [], flags: any[] = [];
      const open = new Map<string, { job_id: string; job_date: string; balance: number }[]>();
      for (const r of rows) {
        const cid = contactId.get(nameOf(r.customer))!;
        const jid = uuid();
        const noteParts = [`Imported from sheet (${r.ref}).`];
        if (r.paymentText) noteParts.push(`Payment note: "${r.paymentText}"`);
        if (r.extraNotes) noteParts.push(`Other notes: ${r.extraNotes}`);
        if (nameOf(r.customer) !== r.customer.trim()) noteParts.push(`Name in sheet: "${r.customer}"`);
        jobs.push({
          id: jid, job_date: r.date || `${year}-01-01`, customer_id: cid, description: r.description, notes: noteParts.join("\n"),
          price: r.rate, delivery_status: "delivered", invoice_requested: r.invoiceRequested, source: "import", import_ref: r.ref,
        });
        let seq = 0;
        if (r.pickup) stops.push({ job_id: jid, seq: seq++, kind: "pickup", address_id: getAddr(cid, r.pickup), address_text: r.pickup, area: detectArea(r.pickup), status: "done" });
        if (r.dropoff) stops.push({ job_id: jid, seq: seq++, kind: "dropoff", address_id: getAddr(cid, r.dropoff), address_text: r.dropoff, area: detectArea(r.dropoff), status: "done" });

        const list = open.get(cid) || [];
        const rate = r.rate || 0;
        let thisBal = rate;
        if (r.payment?.amount) {
          const pid = uuid();
          pays.push({ id: pid, customer_id: cid, amount: r.payment.amount, method: r.payment.method, received_on: r.date || `${year}-01-01`, note: `From sheet: "${r.payment.raw}"` });
          const first = Math.min(r.payment.amount, rate);
          if (first > 0) { allocs.push({ payment_id: pid, job_id: jid, amount: first }); thisBal -= first; }
          const rest = r.payment.amount - first;
          if (rest > 0.004) {
            const plan = allocateOldestFirst(rest, list);
            plan.allocations.forEach((a) => {
              allocs.push({ payment_id: pid, job_id: a.job_id, amount: a.amount });
              const j = list.find((x) => x.job_id === a.job_id)!; j.balance -= a.amount;
            });
            if (plan.allocations.length || plan.leftover > 0) {
              flags.push({ kind: "import", job_id: jid, contact_id: cid, message: `${r.customer} paid ${money(r.payment.amount)} on ${r.date} (${r.ref}). ${money(first)} went to that job, ${money(rest - plan.leftover)} to older unpaid jobs${plan.leftover > 0 ? `, ${money(plan.leftover)} kept as credit` : ""}. Please check.` });
            }
          }
        }
        if (thisBal > 0.004) list.push({ job_id: jid, job_date: r.date || "", balance: thisBal });
        open.set(cid, list.filter((x) => x.balance > 0.004));
        r.flags.filter((f) => !f.includes("doesn't match") || !(r.payment && r.payment.amount! > rate))
          .forEach((f) => flags.push({ kind: "import", job_id: jid, contact_id: cid, message: `${r.customer}, ${r.date || "no date"} (${r.ref}): ${f}` }));
      }
      for (const g of groups) if (g.merge) {
        const cid = contactId.get(g.keep);
        if (cid) flags.push({ kind: "duplicate", contact_id: cid, message: `These names were combined into “${g.keep}”: ${g.names.join(", ")}. If any are really different customers, change those jobs.` });
      }
      for (const b of parsed.balances) {
        const cid = contactId.get(nameOf(b.name)) || null;
        flags.push({ kind: "balance", contact_id: cid, message: `Old “Open Balances” tab says ${b.name}: ${b.amount} (${b.ref}). Compare with the app's balance.` });
      }

      setProgress(`Saving ${newAddr.length} addresses…`); await chunked("addresses", newAddr);
      setProgress(`Saving ${jobs.length} jobs…`); await chunked("jobs", jobs);
      setProgress(`Saving ${stops.length} stops…`); await chunked("stops", stops);
      setProgress(`Saving ${pays.length} payments…`); await chunked("payments", pays); await chunked("payment_allocations", allocs);
      setProgress(`Saving ${flags.length} things to check…`); await chunked("review_flags", flags);
      setProgress(null);
      setDone(`Imported ${jobs.length} jobs, ${newContacts.length} new customers and ${pays.length} payments.${rows.length < parsed.rows.length ? ` Skipped ${parsed.rows.length - rows.length} rows that were already imported.` : ""} ${flags.length} things are listed under Settings → Things to check.`);
    } catch (e: any) {
      setProgress(null);
      setErr("Import stopped: " + e.message + ". You can run it again — rows already saved are skipped.");
    }
  }

  return (
    <Shell title="Import sheet" back>
      <div className="note info small">
        1. Open the Google Sheet → <b>File → Download → Microsoft Excel (.xlsx)</b>.<br />
        2. Pick that file below. The Google Sheet itself is never changed.<br />
        Card numbers, expiry dates and security codes are removed and never saved.
      </div>
      <label className="f"><span>Year of the sheet (when a tab doesn&apos;t say)</span>
        <input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
      </label>
      <label className="btn primary block xl" style={{ marginTop: 14 }}>
        📄 Choose .xlsx file
        <input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
      </label>
      {err && <div className="note bad" style={{ marginTop: 12 }}>{err}</div>}

      {parsed && stats && !done && (
        <>
          <div className="h2">What I found</div>
          {parsed.tabs.map((t) => (
            <div key={t.name} className="row card" style={{ marginTop: 6, padding: 10 }}>
              <div className="grow"><b>{t.name}</b><div className="muted small">{t.kind}</div></div>
              <b>{t.count}</b>
            </div>
          ))}
          <div className="card" style={{ marginTop: 10 }}>
            {parsed.rows.length} deliveries · {money(stats.total)} in charges<br />
            {stats.flagged} rows need a look later{stats.cards ? ` · card details removed from ${stats.cards}` : ""}
          </div>

          {groups.length > 0 && (
            <>
              <div className="h2">Same customer? ({groups.length})</div>
              <p className="muted small" style={{ marginTop: 0 }}>These names look alike. Ticked groups become one customer, using the name you choose.</p>
              {groups.map((g, gi) => (
                <div key={gi} className="card" style={{ marginTop: 8 }}>
                  <label className="row" style={{ cursor: "pointer" }}>
                    <input type="checkbox" checked={g.merge} style={{ width: 24, height: 24 }} onChange={(e) => setGroups(groups.map((x, i) => (i === gi ? { ...x, merge: e.target.checked } : x)))} />
                    <b>Combine</b>
                  </label>
                  <div className="chips" style={{ marginTop: 8 }}>
                    {g.names.map((n) => (
                      <button key={n} className={"chip" + (g.keep === n && g.merge ? " on" : "")} disabled={!g.merge} onClick={() => setGroups(groups.map((x, i) => (i === gi ? { ...x, keep: n } : x)))}>{n}</button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          <button className="btn primary block xl" style={{ marginTop: 20 }} disabled={!!progress} onClick={runImport}>
            {progress || `Import ${parsed.rows.length} deliveries`}
          </button>
        </>
      )}
      {done && (
        <div className="note ok" style={{ marginTop: 16 }}>
          ✓ {done}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <Link href="/customers" className="btn">Customers</Link>
            <Link href="/settings" className="btn">Things to check</Link>
          </div>
        </div>
      )}
    </Shell>
  );
}

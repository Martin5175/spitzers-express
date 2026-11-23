"use client";
import { useEffect, useMemo, useState } from "react";
import { Sheet, toast } from "./Shell";
import { allocateOldestFirst, METHODS, money } from "@/lib/money";
import { openJobsFor, recordPayment } from "@/lib/data";
import { niceDate, todayISO } from "@/lib/dates";

/**
 * Record money received. With a jobId the job is paid first; anything extra goes to the
 * customer's oldest unpaid jobs, and any leftover stays as credit.
 */
export default function PaymentSheet({ open, onClose, onSaved, customerId, customerName, jobId, jobBalance }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  customerId: string | null; customerName: string; jobId?: string; jobBalance?: number;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("Zelle");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [openJobs, setOpenJobs] = useState<{ job_id: string; job_date: string; balance: number }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(jobId && jobBalance ? String(jobBalance) : "");
    setNote(""); setDate(todayISO());
    if (customerId) openJobsFor(customerId).then(setOpenJobs); else setOpenJobs([]);
  }, [open, customerId, jobId, jobBalance]);

  const plan = useMemo(() => {
    const amt = Number(amount) || 0;
    if (!amt) return { allocations: [], leftover: 0 };
    if (jobId) {
      const first = Math.min(amt, jobBalance || 0);
      const rest = allocateOldestFirst(amt - first, openJobs.filter((j) => j.job_id !== jobId));
      return { allocations: [...(first > 0 ? [{ job_id: jobId, amount: first }] : []), ...rest.allocations], leftover: rest.leftover };
    }
    return allocateOldestFirst(amt, openJobs);
  }, [amount, openJobs, jobId, jobBalance]);

  const owed = openJobs.reduce((s, j) => s + j.balance, 0);
  const dateOf = (id: string) => openJobs.find((j) => j.job_id === id)?.job_date || "";

  async function save() {
    setBusy(true);
    try {
      await recordPayment({ customer_id: customerId, amount: Number(amount), method, received_on: date, note, allocations: plan.allocations });
      toast(`${money(Number(amount))} recorded ✓`);
      onSaved(); onClose();
    } catch (e: any) {
      toast("Couldn't save: " + e.message);
    }
    setBusy(false);
  }

  return (
    <Sheet open={open} onClose={onClose}>
      <h3>Money received</h3>
      <div className="muted">{customerName}{customerId ? ` · owes ${money(owed)} in total` : ""}</div>
      <label className="f"><span>How much?</span>
        <div className="row"><span className="big-number">$</span>
          <input className="input money" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
        </div>
      </label>
      {jobId && owed > (jobBalance || 0) && (
        <button className="chip" style={{ marginTop: 8 }} onClick={() => setAmount(String(Math.round(owed * 100) / 100))}>Paid everything they owe ({money(owed)})</button>
      )}
      <label className="f"><span>How did they pay?</span></label>
      <div className="chips">
        {METHODS.map((m) => <button key={m} className={"chip" + (method === m ? " on" : "")} onClick={() => setMethod(m)}>{m}</button>)}
      </div>
      <label className="f"><span>Date received</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="f"><span>Note (optional)</span>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {plan.allocations.length > 0 && (
        <div className="note info" style={{ marginTop: 12 }}>
          <b>This pays:</b>
          {plan.allocations.map((a) => (
            <div key={a.job_id} className="row small"><span className="grow">{a.job_id === jobId ? "This job" : `Job from ${niceDate(dateOf(a.job_id))}`}</span><span>{money(a.amount)}</span></div>
          ))}
          {plan.leftover > 0 && <div className="row small"><span className="grow">Extra kept as credit</span><span>{money(plan.leftover)}</span></div>}
        </div>
      )}
      <button className="btn primary block xl" style={{ marginTop: 16 }} disabled={busy || !Number(amount)} onClick={save}>{busy ? "Saving…" : "Save payment"}</button>
    </Sheet>
  );
}

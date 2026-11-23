"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Shell, { toast } from "@/components/Shell";
import JobForm, { afterSavePreferred } from "@/components/JobForm";
import { emptyStop, loadJobs, saveDraft, type Draft } from "@/lib/data";
import { useContacts } from "@/lib/useContacts";
import { todayISO } from "@/lib/dates";

function blank(customerId: string | null = null): Draft {
  return { job_date: todayISO(), customer_id: customerId, description: "", notes: "", price: "", invoice_requested: false, stops: [emptyStop("pickup"), emptyStop("dropoff")], suggested: [] };
}

function NewJob() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const { contacts, setContacts, ranked } = useContacts();
  const [draft, setDraft] = useState<Draft>(blank(params.get("customer")));
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(!editId);

  useEffect(() => {
    if (!editId) return;
    loadJobs({ ids: [editId] }).then(([j]) => {
      if (!j) return;
      setDraft({
        id: j.id, job_date: j.job_date, customer_id: j.customer_id, description: j.description || "", notes: j.notes || "",
        price: j.price == null ? "" : String(j.price), invoice_requested: j.invoice_requested,
        stops: j.stops.map((s) => ({ id: s.id, kind: s.kind, contact_id: s.contact_id, address_id: s.address_id, address_text: s.address_text || "", area: s.area, instructions: s.instructions || "", status: s.status, suggested: [] })),
      });
      setReady(true);
    });
  }, [editId]);

  async function save(savePref: boolean) {
    setSaving(true);
    try {
      const id = await saveDraft(draft);
      await afterSavePreferred(draft, savePref);
      toast(editId ? "Saved" : "Job added ✓");
      if (editId) router.replace(`/job/${id}`);
      else router.push(`/?date=${draft.job_date}`);
    } catch (e: any) {
      toast("Couldn't save: " + e.message);
      setSaving(false);
    }
  }

  return (
    <Shell title={editId ? "Edit job" : "New job"} back={!!editId}>
      {ready ? (
        <JobForm draft={draft} setDraft={setDraft} contacts={contacts} setContacts={setContacts} ranked={ranked} onSave={save} saving={saving} saveLabel={editId ? "Save changes" : undefined} />
      ) : <p className="muted">Loading…</p>}
    </Shell>
  );
}

export default function Page() {
  return <Suspense><NewJob /></Suspense>;
}

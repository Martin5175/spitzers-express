"use client";
import { sb } from "./supabase-browser";
import type { Contact, Address, Stop, Job, JobMoney, JobFull } from "./types";
import { detectArea } from "./areas";
import { patternKey, type HistJob, type PreferredPrice } from "./suggest";

export async function loadContacts(): Promise<Contact[]> {
  const { data, error } = await sb().from("contacts").select("*").order("name").limit(5000);
  if (error) throw error;
  return data as Contact[];
}

export async function loadCustomerStats(): Promise<Record<string, { jobs_90d: number; jobs_total: number; last_job: string | null; balance: number; unapplied_credit: number }>> {
  const { data } = await sb().from("customer_stats").select("*").limit(5000);
  const out: Record<string, any> = {};
  (data || []).forEach((r: any) => (out[r.customer_id] = { ...r, balance: Number(r.balance), unapplied_credit: Number(r.unapplied_credit) }));
  return out;
}

export async function loadAddresses(contactIds?: string[]): Promise<Address[]> {
  let q = sb().from("addresses").select("*").order("created_at", { ascending: false }).limit(5000);
  if (contactIds?.length) q = q.in("contact_id", contactIds);
  const { data } = await q;
  return (data || []) as Address[];
}

export async function loadJobs(filter: { date?: string; customerId?: string; ids?: string[]; limit?: number }): Promise<JobFull[]> {
  let q = sb().from("jobs").select("*, stops(*)");
  if (filter.date) q = q.eq("job_date", filter.date);
  if (filter.customerId) q = q.eq("customer_id", filter.customerId);
  if (filter.ids) q = q.in("id", filter.ids);
  q = q.order("job_date", { ascending: false }).order("created_at", { ascending: false }).limit(filter.limit || 500);
  const { data, error } = await q;
  if (error) throw error;
  const jobs = (data || []) as (Job & { stops: Stop[] })[];
  jobs.forEach((j) => j.stops.sort((a, b) => a.seq - b.seq));
  const ids = jobs.map((j) => j.id);
  const money = await loadMoney(ids);
  return jobs.map((j) => ({ ...j, price: j.price == null ? null : Number(j.price), money: money[j.id] || null }));
}

export async function loadMoney(jobIds: string[]): Promise<Record<string, JobMoney>> {
  const out: Record<string, JobMoney> = {};
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data } = await sb().from("job_money").select("*").in("job_id", jobIds.slice(i, i + 200));
    (data || []).forEach((m: any) => (out[m.job_id] = { ...m, total: Number(m.total), paid: Number(m.paid), balance: Number(m.balance) }));
  }
  return out;
}

export async function customerHistory(customerId: string): Promise<{ jobs: HistJob[]; preferred: PreferredPrice[] }> {
  const [{ data: jobs }, { data: pref }] = await Promise.all([
    sb().from("jobs").select("id, job_date, price, description, delivery_status, stops(kind, seq, contact_id, address_id, address_text, area, instructions)")
      .eq("customer_id", customerId).neq("delivery_status", "cancelled")
      .order("job_date", { ascending: false }).order("created_at", { ascending: false }).limit(150),
    sb().from("preferred_prices").select("pattern_key, amount, label").eq("customer_id", customerId),
  ]);
  return {
    jobs: (jobs || []).map((j: any) => ({
      ...j, price: j.price == null ? null : Number(j.price),
      stops: (j.stops || []).sort((a: any, b: any) => a.seq - b.seq),
    })),
    preferred: (pref || []).map((p: any) => ({ ...p, amount: Number(p.amount) })),
  };
}

export async function savePreferredPrice(customerId: string, key: string, amount: number, label?: string) {
  const { error } = await sb().from("preferred_prices").upsert(
    { customer_id: customerId, pattern_key: key, amount, label: label || null, updated_at: new Date().toISOString() },
    { onConflict: "customer_id,pattern_key" }
  );
  if (error) throw error;
}

export async function createContact(c: Partial<Contact> & { name: string }): Promise<Contact> {
  const { data, error } = await sb().from("contacts").insert({ ...c, name: c.name.trim() }).select().single();
  if (error) throw error;
  return data as Contact;
}

// ---------- Job drafts ----------
export type DraftStop = {
  id?: string;
  kind: "pickup" | "dropoff";
  contact_id: string | null;
  address_id: string | null;
  address_text: string;
  area: string | null;
  instructions: string;
  status?: "pending" | "done";
  suggested?: string[]; // which fields were suggested rather than told
};
export type Draft = {
  id?: string;
  job_date: string;
  customer_id: string | null;
  description: string;
  notes: string;
  price: string;
  priceWhy?: string;
  invoice_requested: boolean;
  stops: DraftStop[];
  suggested?: string[];
  flags?: string[];
  source?: "manual" | "voice";
};

export function emptyStop(kind: "pickup" | "dropoff"): DraftStop {
  return { kind, contact_id: null, address_id: null, address_text: "", area: null, instructions: "", suggested: [] };
}

export function draftPatternKey(d: Draft) {
  return patternKey(d.stops.map((s) => ({ kind: s.kind, contact_id: s.contact_id, address_id: s.address_id, address_text: s.address_text || null, area: s.area, instructions: null })));
}

/** Saves a job and its stops. New addresses are remembered on the stop's contact (or the customer). */
export async function saveDraft(d: Draft): Promise<string> {
  const s = sb();
  // Remember addresses
  for (const st of d.stops) {
    const line = st.address_text.trim();
    if (!line) { st.address_id = null; continue; }
    if (!st.area) st.area = detectArea(line);
    const owner = st.contact_id || d.customer_id;
    if (st.address_id) {
      const { data: a } = await s.from("addresses").select("line").eq("id", st.address_id).maybeSingle();
      if (a && a.line.trim().toLowerCase() === line.toLowerCase()) {
        if (st.area) await s.from("addresses").update({ area: st.area }).eq("id", st.address_id);
        continue;
      }
    }
    let q = s.from("addresses").select("id, area").ilike("line", line.replace(/[%_]/g, "\\$&"));
    q = owner ? q.eq("contact_id", owner) : q.is("contact_id", null);
    const { data: found } = await q.limit(1);
    if (found && found.length) st.address_id = found[0].id;
    else {
      const { data: na } = await s.from("addresses").insert({ contact_id: owner, line, area: st.area }).select("id").single();
      st.address_id = na?.id || null;
    }
  }
  const row = {
    job_date: d.job_date,
    customer_id: d.customer_id,
    description: d.description.trim() || null,
    notes: d.notes.trim() || null,
    price: d.price.trim() === "" ? null : Number(d.price),
    invoice_requested: d.invoice_requested,
    source: d.source || "manual",
  };
  let jobId = d.id;
  if (jobId) {
    const { error } = await s.from("jobs").update(row).eq("id", jobId);
    if (error) throw error;
  } else {
    const { data, error } = await s.from("jobs").insert(row).select("id").single();
    if (error) throw error;
    jobId = data.id as string;
  }
  // route order: new stops go to the end of that day's list
  const { data: dayStops } = await s.from("stops").select("route_order, jobs!inner(job_date)").eq("jobs.job_date", d.job_date).order("route_order", { ascending: false }).limit(1);
  let next = dayStops && dayStops.length ? Number(dayStops[0].route_order) + 1 : 1;

  const keepIds = d.stops.filter((x) => x.id).map((x) => x.id!);
  if (d.id) {
    const { data: existing } = await s.from("stops").select("id").eq("job_id", jobId);
    const remove = (existing || []).map((x: any) => x.id).filter((id: string) => !keepIds.includes(id));
    if (remove.length) await s.from("stops").delete().in("id", remove);
  }
  for (let i = 0; i < d.stops.length; i++) {
    const st = d.stops[i];
    const r = {
      job_id: jobId, seq: i, kind: st.kind, contact_id: st.contact_id, address_id: st.address_id,
      address_text: st.address_text.trim() || null, area: st.area, instructions: st.instructions.trim() || null,
    };
    if (st.id) await s.from("stops").update(r).eq("id", st.id);
    else await s.from("stops").insert({ ...r, route_order: next++ });
  }
  await refreshJobStatus(jobId!);
  return jobId!;
}

export async function refreshJobStatus(jobId: string) {
  const s = sb();
  const { data: job } = await s.from("jobs").select("delivery_status").eq("id", jobId).single();
  if (!job || job.delivery_status === "cancelled") return;
  const { data: stops } = await s.from("stops").select("kind, status").eq("job_id", jobId);
  const list = stops || [];
  const drops = list.filter((x: any) => x.kind === "dropoff");
  const picks = list.filter((x: any) => x.kind === "pickup");
  let status = "upcoming";
  if (drops.length && drops.every((x: any) => x.status === "done")) status = "delivered";
  else if (picks.length && picks.every((x: any) => x.status === "done")) status = "picked_up";
  else if (!list.length) status = job.delivery_status;
  if (status !== job.delivery_status) await s.from("jobs").update({ delivery_status: status }).eq("id", jobId);
}

export async function setStopDone(stopId: string, jobId: string, done: boolean) {
  await sb().from("stops").update({ status: done ? "done" : "pending", completed_at: done ? new Date().toISOString() : null }).eq("id", stopId);
  await refreshJobStatus(jobId);
}

// ---------- Photos ----------
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", 0.82));
  } catch {
    return file;
  }
}

export async function uploadPhoto(file: File, jobId: string, stopId: string | null): Promise<string> {
  const blob = await shrink(file);
  const path = `${jobId}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb().storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  const { data, error: e2 } = await sb().from("photos").insert({ job_id: jobId, stop_id: stopId, path }).select("id").single();
  if (e2) throw e2;
  return data.id as string;
}

export async function textPhoto(photoIds: string | string[]): Promise<{ ok: boolean; message: string }> {
  try {
    const ids = Array.isArray(photoIds) ? photoIds : [photoIds];
    const r = await fetch("/api/send-photo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ photoIds: ids }) });
    const j = await r.json();
    return { ok: !!j.ok, message: j.message || (j.ok ? "Photo texted" : "Photo text failed") };
  } catch {
    return { ok: false, message: "No connection. Photo saved — tap Resend later." };
  }
}

export async function photoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await sb().storage.from("photos").createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  (data || []).forEach((d: any) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}

// ---------- Payments ----------
export async function recordPayment(p: { customer_id: string | null; amount: number; method: string; received_on: string; note?: string; allocations: { job_id: string; amount: number }[] }) {
  const s = sb();
  const { data, error } = await s.from("payments").insert({ customer_id: p.customer_id, amount: p.amount, method: p.method, received_on: p.received_on, note: p.note || null }).select("id").single();
  if (error) throw error;
  if (p.allocations.length) {
    const { error: e2 } = await s.from("payment_allocations").insert(p.allocations.map((a) => ({ ...a, payment_id: data.id })));
    if (e2) throw e2;
  }
  return data.id as string;
}

export async function openJobsFor(customerId: string) {
  const { data } = await sb().from("job_money").select("job_id, balance, job_date").eq("customer_id", customerId).gt("balance", 0).limit(1000);
  return (data || []).map((r: any) => ({ job_id: r.job_id, balance: Number(r.balance), job_date: r.job_date as string }));
}

/** Where things picked up at this address usually go (learned from all past jobs, any customer). */
export async function usualDropoffsFrom(pickupAddress: string): Promise<{ address_text: string; area: string | null; contact_id: string | null; count: number }[]> {
  const line = pickupAddress.trim();
  if (line.length < 4) return [];
  const s = sb();
  const { data: picks } = await s.from("stops").select("job_id").eq("kind", "pickup").ilike("address_text", line.replace(/[%_]/g, "\\$&")).limit(300);
  const ids = [...new Set((picks || []).map((p: any) => p.job_id))];
  if (!ids.length) return [];
  const counts = new Map<string, { address_text: string; area: string | null; contact_id: string | null; count: number }>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data: drops } = await s.from("stops").select("address_text, area, contact_id").eq("kind", "dropoff").in("job_id", ids.slice(i, i + 150));
    (drops || []).forEach((d: any) => {
      if (!d.address_text || d.address_text.trim().toLowerCase() === line.toLowerCase()) return;
      const k = d.address_text.trim().toLowerCase();
      const c = counts.get(k) || { address_text: d.address_text.trim(), area: d.area, contact_id: d.contact_id, count: 0 };
      c.count++;
      counts.set(k, c);
    });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 4);
}

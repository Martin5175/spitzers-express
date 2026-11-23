// Learns from confirmed jobs: usual trips per customer and usual prices.

export type HistStop = { kind: "pickup" | "dropoff"; contact_id: string | null; address_id: string | null; address_text: string | null; area: string | null; instructions: string | null };
export type HistJob = { id: string; job_date: string; price: number | null; description: string | null; stops: HistStop[] };
export type PreferredPrice = { pattern_key: string; amount: number };

export type Pattern = {
  key: string;
  stops: HistStop[];
  count: number;
  lastDate: string;
  score: number;
  price: PriceSuggestion | null;
  description: string | null;
};
export type PriceSuggestion = { amount: number; why: string; saved: boolean };

function addrKey(s: HistStop) {
  return (s.address_id || (s.address_text || "").toLowerCase().replace(/[^a-z0-9]/g, "")) + "@" + (s.contact_id || "");
}

/** Same trip = same stops (kind + contact + address) in the same order. */
export function patternKey(stops: HistStop[]): string {
  return stops.map((s) => s.kind[0] + ":" + addrKey(s)).join(">");
}

function daysAgo(iso: string, today: string) {
  return Math.max(0, (Date.parse(today) - Date.parse(iso)) / 86400000);
}

function mode(nums: number[]): { value: number; n: number } | null {
  if (!nums.length) return null;
  const c = new Map<number, number>();
  nums.forEach((x) => c.set(x, (c.get(x) || 0) + 1));
  let best = nums[0], n = 0;
  for (const [v, k] of c) if (k > n) { best = v; n = k; }
  return { value: best, n };
}

export function suggestPrice(key: string, jobsForPattern: HistJob[], allCustomerJobs: HistJob[], preferred: PreferredPrice[]): PriceSuggestion | null {
  const exact = preferred.find((p) => p.pattern_key === key);
  if (exact) return { amount: Number(exact.amount), why: "Saved price for this trip", saved: true };
  const recent = jobsForPattern.filter((j) => j.price != null).slice(0, 10).map((j) => Number(j.price));
  const m = mode(recent);
  if (m && m.n >= 2) return { amount: m.value, why: `Usual price (${m.n} of last ${recent.length})`, saved: false };
  if (recent.length) return { amount: recent[0], why: "Last time for this trip", saved: false };
  const def = preferred.find((p) => p.pattern_key === "*");
  if (def) return { amount: Number(def.amount), why: "Customer's saved price", saved: true };
  const any = mode(allCustomerJobs.filter((j) => j.price != null).slice(0, 15).map((j) => Number(j.price)));
  if (any) return { amount: any.value, why: "Customer's most common price", saved: false };
  return null;
}

/** Usual trips for a customer, best first. Jobs must be sorted newest first. */
export function patternsFor(jobs: HistJob[], preferred: PreferredPrice[], today: string, limit = 4): Pattern[] {
  const groups = new Map<string, HistJob[]>();
  for (const j of jobs) {
    if (!j.stops.length) continue;
    const k = patternKey(j.stops);
    groups.set(k, [...(groups.get(k) || []), j]);
  }
  const out: Pattern[] = [];
  for (const [key, list] of groups) {
    const last = list[0];
    // frequency + recency: each past job counts less the older it is
    const score = list.reduce((s, j) => s + Math.exp(-daysAgo(j.job_date, today) / 45), 0);
    // need at least one stop with a real address or contact to be worth suggesting
    if (!last.stops.some((s) => s.address_text || s.address_id || s.contact_id)) continue;
    out.push({
      key, stops: last.stops, count: list.length, lastDate: last.job_date, score,
      price: suggestPrice(key, list, jobs, preferred),
      description: last.description,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Customer ranking score: frequency weighted by recency. */
export function customerScore(jobs90: number, lastJob: string | null, today: string): number {
  if (!lastJob) return 0;
  return jobs90 + 10 * Math.exp(-daysAgo(lastJob, today) / 14);
}

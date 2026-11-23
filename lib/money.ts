export function money(n: number | null | undefined): string {
  const v = Number(n || 0);
  return "$" + (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export type OpenJob = { job_id: string; job_date: string; balance: number };

/** Splits a lump-sum payment across open jobs, oldest first. Leftover stays as credit. */
export function allocateOldestFirst(amount: number, open: OpenJob[]): { allocations: { job_id: string; amount: number }[]; leftover: number } {
  let left = Math.round(amount * 100);
  const allocations: { job_id: string; amount: number }[] = [];
  const sorted = [...open].filter((j) => j.balance > 0).sort((a, b) => a.job_date.localeCompare(b.job_date));
  for (const j of sorted) {
    if (left <= 0) break;
    const bal = Math.round(j.balance * 100);
    const take = Math.min(bal, left);
    allocations.push({ job_id: j.job_id, amount: take / 100 });
    left -= take;
  }
  return { allocations, leftover: left / 100 };
}

export const METHODS = ["Zelle", "Cash", "Check", "Card", "Other"] as const;

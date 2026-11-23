import { addDays } from "./dates.ts";

export type PeriodMode = "week" | "month" | "year" | "custom" | "upcoming" | "all";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(s + "T12:00:00");

/** Date range for a period. offset 0 = current week/month/year, -1 = previous, etc. Weeks run Sunday–Saturday. */
export function periodRange(mode: PeriodMode, offset: number, today: string, custom?: { from: string; to: string }): { from: string | null; to: string | null; label: string } {
  const t = parse(today);
  if (mode === "week") {
    const start = addDays(today, -t.getDay() + offset * 7);
    const end = addDays(start, 6);
    const f = (s: string) => parse(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { from: start, to: end, label: offset === 0 ? `This week · ${f(start)} – ${f(end)}` : `${f(start)} – ${f(end)}` };
  }
  if (mode === "month") {
    const d = new Date(t.getFullYear(), t.getMonth() + offset, 1, 12);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12);
    return { from: iso(d), to: iso(e), label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }) };
  }
  if (mode === "year") {
    const y = t.getFullYear() + offset;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  }
  if (mode === "custom") return { from: custom?.from || null, to: custom?.to || null, label: "Custom dates" };
  if (mode === "upcoming") return { from: today, to: null, label: "Today and later" };
  return { from: null, to: null, label: "Everything" };
}

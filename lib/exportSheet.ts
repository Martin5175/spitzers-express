// Builds an Excel layout like the old Google Sheet: one tab per month,
// Date | Customer Name | Pick Up Location | Drop off Location | Description | Rate | Payment Method | Payment Status
// plus Open Balances and Customer Info tabs.

export type ExJob = {
  id: string; job_date: string; customer: string; description: string | null; notes: string | null;
  delivery_status: string; invoice_requested: boolean; invoice_number: string | null;
  stops: { kind: "pickup" | "dropoff"; address_text: string | null; contact: string | null }[];
  extras: { label: string; amount: number }[];
  total: number; paid: number; balance: number;
  payments: { amount: number; method: string | null }[];
};
export type ExContact = { name: string; phone: string | null; email: string | null; address: string | null; balance: number };

export const HEADER = ["Date", "Customer Name", "Pick Up Location", "Drop off Location", "Description", "Rate", "Payment Method", "Payment Status"];

const MONTH = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const DAY = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
const n2 = (n: number) => (Math.round(n * 100) / 100).toString();

function place(s: ExJob["stops"][number]) {
  return [s.address_text, s.contact && s.address_text ? `(${s.contact})` : s.contact].filter(Boolean).join(" ");
}

export function jobRow(j: ExJob, showDate: boolean): (string | number)[] {
  const picks = j.stops.filter((s) => s.kind === "pickup").map(place).filter(Boolean);
  const drops = j.stops.filter((s) => s.kind === "dropoff").map(place).filter(Boolean);
  const desc = [j.description, j.stops.length > 2 ? `${j.stops.length - 1} stops` : "", ...j.extras.map((e) => `+${e.label} ${n2(e.amount)}`), j.delivery_status === "cancelled" ? "CANCELLED" : ""]
    .filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const pay = j.payments.length
    ? j.payments.map((p) => `paid ${n2(p.amount)}${p.method ? `(${p.method.toLowerCase()})` : ""}`).join(", ")
    : "";
  const status: string[] = [];
  if (j.delivery_status !== "cancelled") {
    if (j.balance > 0.004 && j.paid > 0) status.push(`owes ${n2(j.balance)}`);
    else if (j.balance > 0.004) status.push("unpaid");
  }
  if (j.invoice_number) status.push(`invoiced ${j.invoice_number}`);
  else if (j.invoice_requested) status.push("please send a invoice");
  return [showDate ? DAY(j.job_date) : "", j.customer, picks.join(" / "), drops.join(" / "), desc, j.total, pay, status.join(", ")];
}

/** Returns tabs as rows of cells, oldest month first. */
export function buildWorkbook(jobs: ExJob[], contacts: ExContact[]): { name: string; rows: (string | number)[][] }[] {
  const sorted = [...jobs].sort((a, b) => a.job_date.localeCompare(b.job_date));
  const months = new Map<string, ExJob[]>();
  sorted.forEach((j) => { const m = MONTH(j.job_date); months.set(m, [...(months.get(m) || []), j]); });
  const tabs: { name: string; rows: (string | number)[][] }[] = [];
  for (const [name, list] of months) {
    const rows: (string | number)[][] = [HEADER, []];
    let day = "";
    list.forEach((j, i) => {
      if (j.job_date !== day && day) rows.push([]);
      rows.push(jobRow(j, j.job_date !== day));
      day = j.job_date;
      if (i === list.length - 1) rows.push([]);
    });
    const total = list.filter((j) => j.delivery_status !== "cancelled").reduce((s, j) => s + j.total, 0);
    const owed = list.reduce((s, j) => s + Math.max(0, j.balance), 0);
    rows.push(["", "TOTAL", "", "", `${list.length} jobs`, Math.round(total * 100) / 100, "", owed > 0 ? `still owed ${n2(owed)}` : "all paid"]);
    tabs.push({ name: name.slice(0, 31), rows });
  }
  const owing = contacts.filter((c) => c.balance > 0.004).sort((a, b) => b.balance - a.balance);
  tabs.push({ name: "Open Balances", rows: [["Customer Name", "Balance"], ...owing.map((c) => [c.name, Math.round(c.balance * 100) / 100]), [], ["TOTAL", Math.round(owing.reduce((s, c) => s + c.balance, 0) * 100) / 100]] });
  tabs.push({ name: "Customer Info", rows: [["Customer Name", "Address", "Phone Number", "Email Address"], ...[...contacts].sort((a, b) => a.name.localeCompare(b.name)).map((c) => [c.name, c.address || "", c.phone || "", c.email || ""])] });
  return tabs;
}

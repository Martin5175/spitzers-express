// Reads the old Google Sheet (downloaded as .xlsx) into clean records. Never changes the sheet.
import { detectArea } from "./areas.ts";

export type ImportedPayment = { amount: number | null; method: string | null; raw: string };
export type ImportedRow = {
  ref: string;           // "Nov 2025!B14" style reference back to the sheet
  date: string | null;   // ISO date
  customer: string;
  pickup: string | null;
  dropoff: string | null;
  description: string | null;
  rate: number | null;
  paymentText: string;   // original payment text (card data removed)
  payment: ImportedPayment | null;
  invoiceRequested: boolean;
  extraNotes: string;    // anything else on the row
  flags: string[];
};
export type ImportedContact = { name: string; phone: string | null; email: string | null; address: string | null; notes: string; ref: string };

// ---- card data removal -------------------------------------------------------
const CARD = /\b(?:\d{4}[ -]?){3}\d{1,4}\b|\b\d{4}[ -]?\d{6}[ -]?\d{4,5}\b|\b\d{13,19}\b/g;
const EXP = /\b(?:exp(?:iry|iration)?\.?\s*:?\s*)?(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})\b/gi;
const CVV = /\b(?:cvv|cvc|cv2|csc|sec(?:urity)?\s*code|code)\s*[:#]?\s*\d{3,4}\b/gi;

export function stripCardData(s: string): { text: string; removed: boolean } {
  let removed = false;
  let t = s.replace(CARD, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 13 && luhn(digits)) { removed = true; return "[card removed]"; }
    if (digits.length >= 15) { removed = true; return "[number removed]"; }
    return m;
  });
  t = t.replace(CVV, () => { removed = true; return "[removed]"; });
  if (removed || /card|cc|visa|amex|master/i.test(s)) t = t.replace(EXP, () => { removed = true; return "[removed]"; });
  return { text: t, removed };
}
function luhn(d: string) {
  let sum = 0, alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = +d[i];
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

// ---- payments ---------------------------------------------------------------
export function parsePayment(raw: string): ImportedPayment | null {
  const s = raw.trim();
  if (!s) return null;
  const low = s.toLowerCase();
  let method: string | null = null;
  if (/zel+e/.test(low)) method = "Zelle";
  else if (/\bcc\b|card|credit card|charged/.test(low)) method = "Card";
  else if (/cash/.test(low)) method = "Cash";
  else if (/check|chk/.test(low)) method = "Check";
  if (!/paid|cc|charged|zelle|cash|check/.test(low)) return null;
  const nums = [...low.matchAll(/\$?\s*(\d+(?:\.\d{1,2})?)/g)].map((m) => parseFloat(m[1]));
  return { amount: nums.length ? nums[0] : null, method: method ?? (low.includes("paid") ? null : method), raw: s };
}

// ---- dates ------------------------------------------------------------------
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
export function parseDateCell(v: unknown, fallbackYear: number): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(+v)) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim().toLowerCase();
  const m = s.match(/^([a-z]+)\.?\s*(\d{1,2})(?:[, ]+(\d{4}))?/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3));
    if (mi >= 0) return iso(m[3] ? +m[3] : fallbackYear, mi + 1, +m[2]);
  }
  const n = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (n) { let y = n[3] ? +n[3] : fallbackYear; if (y < 100) y += 2000; return iso(y, +n[1], +n[2]); }
  return null;
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function yearFromSheetName(name: string, fallback: number): number {
  const m = name.match(/(20\d{2})/);
  return m ? +m[1] : fallback;
}

// ---- delivery tabs ----------------------------------------------------------
const H = {
  date: /^date/i, customer: /customer/i, pickup: /pick\s*up/i, dropoff: /drop/i,
  description: /desc/i, rate: /rate|price|charge/i, method: /payment\s*meth/i, status: /payment\s*stat|status/i,
};

function cell(r: unknown[], i: number | undefined): string {
  if (i == null || i < 0) return "";
  const v = r[i];
  return v == null ? "" : String(v).trim();
}

export function findHeader(rows: unknown[][]): { row: number; cols: Record<keyof typeof H, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const r = rows[i].map((c) => String(c ?? "").trim());
    const ci = r.findIndex((c) => H.customer.test(c));
    if (ci < 0) continue;
    const idx = (re: RegExp) => r.findIndex((c) => re.test(c));
    return {
      row: i,
      cols: {
        date: idx(H.date), customer: ci, pickup: idx(H.pickup), dropoff: idx(H.dropoff),
        description: idx(H.description), rate: idx(H.rate), method: idx(H.method), status: idx(H.status),
      },
    };
  }
  return null;
}

export function parseDeliverySheet(name: string, rows: unknown[][], fallbackYear: number): ImportedRow[] {
  const hdr = findHeader(rows);
  if (!hdr) return [];
  const { cols } = hdr;
  const year = yearFromSheetName(name, fallbackYear);
  const out: ImportedRow[] = [];
  let curDate: string | null = null;
  for (let i = hdr.row + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const d = parseDateCell(r[cols.date], year);
    if (d) curDate = d;
    const customer = cell(r, cols.customer);
    if (!customer || customer === '"') continue;
    const rateRaw = cell(r, cols.rate).replace(/[$,]/g, "");
    const rate = rateRaw && !isNaN(+rateRaw) ? +rateRaw : null;
    const flags: string[] = [];

    // Everything right of the "Payment Method" column (status + spare columns) is payment/notes text
    const restIdx = new Set([cols.date, cols.customer, cols.pickup, cols.dropoff, cols.description, cols.rate]);
    const methodText = cell(r, cols.method);
    const extras: string[] = [];
    for (let c = 0; c < r.length; c++) {
      if (restIdx.has(c) || c === cols.method) continue;
      const v = cell(r, c);
      if (v) extras.push(v);
    }
    const clean1 = stripCardData(methodText);
    const clean2 = stripCardData(extras.join(" | "));
    if (clean1.removed || clean2.removed) flags.push("Card details were found and removed");
    const extraText = clean2.text;
    const invoiceRequested = /invoice/i.test(methodText + " " + extraText);
    const payText = clean1.text.replace(/please send (a |an )?invoice/i, "").trim();
    const payment = parsePayment(payText);

    if (!curDate) flags.push("No date found");
    if (rateRaw && rate == null) flags.push(`Rate "${cell(r, cols.rate)}" is not a number`);
    if (payment) {
      if (payment.amount == null) flags.push(`Payment "${payment.raw}" has no amount`);
      else if (rate != null && Math.abs(payment.amount - rate) > 0.009) flags.push(`Payment ${payment.amount} doesn't match rate ${rate} (may cover several jobs)`);
      if (!payment.method) flags.push(`Payment method unclear: "${payment.raw}"`);
    } else if (payText && !/^\s*$/.test(payText)) {
      flags.push(`Unclear payment note: "${payText}"`);
    }
    if (/credit/i.test(extraText + payText)) flags.push("Mentions a credit");

    let pickup = cell(r, cols.pickup) || null;
    let dropoff = cell(r, cols.dropoff) || null;
    if (pickup) pickup = stripCardData(pickup).text;
    if (dropoff) dropoff = stripCardData(dropoff).text;

    const desc = stripCardData(cell(r, cols.description));
    if (desc.removed && !flags.includes("Card details were found and removed")) flags.push("Card details were found and removed");
    out.push({
      ref: `${name}!row ${i + 1}`,
      date: curDate, customer: stripCardData(customer).text, pickup, dropoff,
      description: desc.text || null,
      rate, paymentText: payText, payment, invoiceRequested,
      extraNotes: extraText.replace(/please send (a |an )?invoice/gi, "").replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim(),
      flags,
    });
  }
  return out;
}

// ---- Customer Info tab ------------------------------------------------------
const PHONE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

export function parseCustomerSheet(name: string, rows: unknown[][]): ImportedContact[] {
  const out: ImportedContact[] = [];
  let header: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = (rows[i] || []).map((c) => (c == null ? "" : String(c).trim()));
    if (!r.some(Boolean)) continue;
    if (!header.length && r.some((c) => /name|customer/i.test(c))) { header = r.map((c) => c.toLowerCase()); continue; }
    const nameIdx = header.length ? header.findIndex((h) => /name|customer/.test(h)) : 0;
    const nm = r[nameIdx >= 0 ? nameIdx : 0];
    if (!nm) continue;
    const joined = stripCardData(r.filter((_, k) => k !== nameIdx).join(" | ")).text;
    const phone = (joined.match(PHONE) || [null])[0];
    const email = (joined.match(EMAIL) || [null])[0];
    const addrIdx = header.findIndex((h) => /addr|location/.test(h));
    const address = addrIdx >= 0 ? stripCardData(r[addrIdx] || "").text || null : null;
    out.push({ name: nm, phone, email, address, notes: joined, ref: `${name}!row ${i + 1}` });
  }
  return out;
}

export function rowArea(row: ImportedRow) {
  return { pickupArea: detectArea(row.pickup), dropoffArea: detectArea(row.dropoff) };
}

export const DEFAULT_PHOTO_MESSAGE =
  "Hi {customer}, your delivery to {address} was completed at {time}. Photo attached. Thank you! – {business} {phone}. Reply STOP to opt out.";

export const PLACEHOLDERS: [string, string][] = [
  ["{customer}", "customer name"],
  ["{receiver}", "who received it"],
  ["{address}", "drop-off address"],
  ["{item}", "what was delivered"],
  ["{time}", "time delivered"],
  ["{date}", "date"],
  ["{business}", "Spitzer's Express"],
  ["{phone}", "845-781-6392"],
];

export function fillMessage(tpl: string, v: Record<string, string | null | undefined>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (m, k) => (k in v ? (v[k] || "").trim() : m))
    .replace(/\s+([,.!])/g, "$1")
    .replace(/ {2,}/g, " ")
    .replace(/\bto\s+was\b/, "was")
    .trim();
}

/** US phone to +1XXXXXXXXXX, or null if it doesn't look like a phone number. */
export function toE164(p?: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  if (p.trim().startsWith("+") && d.length >= 10) return "+" + d;
  return null;
}

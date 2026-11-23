import { mapsHint } from "./areas.ts";

export const MAX_STOPS_PER_LINK = 10; // Google Maps allows 9 waypoints + destination

function full(addr: string, area: string | null | undefined) {
  const a = addr.trim();
  if (/\b(ny|nj|new york|new jersey|\d{5})\b/i.test(a)) return a;
  return `${a}, ${mapsHint(area)}`;
}

/**
 * Builds Google Maps direction links for stops in order. Starts from the phone's current location.
 * Long lists are split into several links of up to 10 stops.
 */
export function mapsLinks(stops: { address: string; area?: string | null }[]): string[] {
  const list = stops.filter((s) => s.address && s.address.trim()).map((s) => full(s.address, s.area));
  // Drop back-to-back duplicates (same building twice in a row)
  const clean = list.filter((a, i) => i === 0 || a.toLowerCase() !== list[i - 1].toLowerCase());
  const links: string[] = [];
  for (let i = 0; i < clean.length; i += MAX_STOPS_PER_LINK) {
    const chunk = clean.slice(i, i + MAX_STOPS_PER_LINK);
    const dest = chunk[chunk.length - 1];
    const way = chunk.slice(0, -1);
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(dest)}`;
    if (way.length) url += `&waypoints=${encodeURIComponent(way.join("|"))}`;
    links.push(url);
  }
  return links;
}

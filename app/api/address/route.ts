import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Area the driver covers (Brooklyn up to Orange County). Suggestions here come first.
const BOX = { minLat: 40.55, minLon: -74.45, maxLat: 41.55, maxLon: -73.75 };

/**
 * Address suggestions while typing.
 * Uses Google Places when GOOGLE_MAPS_API_KEY is set (most accurate), otherwise the free OpenStreetMap lookup.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length < 3) return NextResponse.json({ results: [] });
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const results = key ? await google(q, key) : await photon(q);
    return NextResponse.json({ results: [...new Set(results)].slice(0, 6) });
  } catch {
    return NextResponse.json({ results: [] });
  }
}

async function google(q: string, key: string): Promise<string[]> {
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({
      input: q,
      includedRegionCodes: ["us"],
      locationBias: { rectangle: { low: { latitude: BOX.minLat, longitude: BOX.minLon }, high: { latitude: BOX.maxLat, longitude: BOX.maxLon } } },
    }),
  });
  if (!r.ok) return photon(q);
  const j = await r.json();
  return (j.suggestions || [])
    .map((s: any) => s.placePrediction?.text?.text as string)
    .filter(Boolean)
    .map((t: string) => t.replace(/, USA$/, ""));
}

async function photon(q: string): Promise<string[]> {
  const center = `lat=${(BOX.minLat + BOX.maxLat) / 2}&lon=${(BOX.minLon + BOX.maxLon) / 2}`;
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=10&lang=en&${center}&bbox=${BOX.minLon},${BOX.minLat},${BOX.maxLon},${BOX.maxLat}`;
  const r = await fetch(url, { headers: { "User-Agent": "SpitzersExpress/1.0" } });
  if (!r.ok) return [];
  const j = await r.json();
  const typedNum = (q.match(/^\s*(\d+[a-z]?)\b/i) || [])[1];
  return (j.features || []).map((f: any) => {
    const p = f.properties || {};
    if (p.countrycode && p.countrycode !== "US") return "";
    const road = p.street || (p.osm_key === "highway" ? p.name : "");
    const num = p.housenumber || (road ? typedNum : "");
    const street = [num, road].filter(Boolean).join(" ");
    let town = p.city || p.town || p.village || p.district || p.county || "";
    if (town === "New York" || town === "New York City") town = p.district || (p.county === "Kings County" ? "Brooklyn" : town);
    const state = p.state === "New York" ? "NY" : p.state === "New Jersey" ? "NJ" : p.state || "";
    return [street || p.name, town, [state, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }).filter((s: string) => !!s && /\d/.test(s.split(",")[0]));
}

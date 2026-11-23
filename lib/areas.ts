// Route groups. Each day's stops are split into these groups, each with its own Google Maps link.
export const AREAS = ["Monroe", "Monsey", "Williamsburg", "Borough Park", "Other"] as const;
export type Area = (typeof AREAS)[number];

const RULES: [Area, string[]][] = [
  ["Williamsburg", ["williamsburg", "wburg", "w-burg", "crown heights", "crown hts", "bedford ave", "bedford avenue", "lee ave", "keap", "wythe", "division ave", "kent ave", "marcy", "flushing ave", "wallabout", "rutledge", "heyward", "hayward", "skillman", "nostrand", "brooklyn navy yard", "navy yard", "dekalb", "kingston ave", "eastern pkwy", "eastern parkway", "president st", "montgomery st"]],
  ["Borough Park", ["borough park", "boro park", "bp", "flatbush", "midwood", "kensington", "ave n", "ave j", "ave m", "coney island ave", "ocean pkwy", "ocean parkway", "new utrecht", "fort hamilton", "dahill", "mcdonald ave", "bensonhurst"]],
  ["Monroe", ["monroe", "kiryas joel", "kj", "harriman", "highland mills", "woodbury", "chester", "central valley", "blooming grove", "bakertown", "forest rd", "acres rd", "mountainview", "mountain rd", "heather ridge", "lemberg", "satmar dr", "garfield rd", "ostrov", "orshava", "prag", "getzel berger", "lizensk", "duelk", "karlsburg", "fred eller", "mezabish", "zenta", "vienna", "quickway"]],
  ["Monsey", ["monsey", "new square", "new sq", "pomona", "spring valley", "suffern", "chestnut ridge", "airmont", "wesley hills", "nanuet", "viola", "tallman", "montebello", "new hempstead", "route 59", "rt 59", "ny 59", "n.y 59", "route 306", "route 45", "saddle river rd", "maple ave", "carlton rd", "union rd", "remsen", "blauvelt", "lombardy", "executive blvd", "college rd", "francis pl", "melnick", "opal ct", "secor", "plum hill", "spook rock"]],
];

// Brooklyn street numbers like "4014 18th Ave", "1320 50th st" are Borough Park.
const BP_STREET = /\b\d{3,5}\s+(\d{1,2})(st|nd|rd|th)?\s*(st|street|ave|avenue)\b/i;

export function detectArea(text?: string | null): Area | null {
  if (!text) return null;
  const t = " " + text.toLowerCase().replace(/[^a-z0-9 .\-]/g, " ").replace(/\s+/g, " ") + " ";
  for (const [area, words] of RULES) {
    for (const w of words) {
      if (t.includes(" " + w + " ") || t.includes(" " + w + ".") || t.endsWith(" " + w + " ")) return area;
    }
  }
  const m = text.match(BP_STREET);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 10 && n <= 65) return "Borough Park";
  }
  return null;
}

/** Text appended to an address so Google Maps finds the right town. */
export function mapsHint(area: string | null | undefined): string {
  switch (area) {
    case "Monroe": return "Monroe, NY";
    case "Monsey": return "Monsey, NY";
    case "Williamsburg": return "Brooklyn, NY";
    case "Borough Park": return "Brooklyn, NY";
    default: return "NY";
  }
}

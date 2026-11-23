import { test } from "node:test";
import assert from "node:assert/strict";
import { detectArea } from "../lib/areas.ts";
import { mapsLinks } from "../lib/maps.ts";
import { findMatches, duplicateGroups } from "../lib/match.ts";
import { allocateOldestFirst } from "../lib/money.ts";
import { patternsFor } from "../lib/suggest.ts";
import { parsePayment, stripCardData, parseDeliverySheet, parseDateCell } from "../lib/importSheet.ts";

test("areas", () => {
  assert.equal(detectArea("BP /Williamsburg"), "Williamsburg");
  assert.equal(detectArea("BP"), "Borough Park");
  assert.equal(detectArea("Flatbush"), "Borough Park");
  assert.equal(detectArea("Crown Heights"), "Williamsburg");
  assert.equal(detectArea("3 Opal ct. Pomona"), "Monsey");
  assert.equal(detectArea("New square"), "Monsey");
  assert.equal(detectArea("52 Bakertown rd"), "Monroe");
  assert.equal(detectArea("4014 18th Ave"), "Borough Park");
  assert.equal(detectArea("664 Bedford Avenue"), "Williamsburg");
  assert.equal(detectArea("Clark NJ"), null);
});

test("maps links split at 10", () => {
  const stops = Array.from({ length: 23 }, (_, i) => ({ address: `${i + 1} Main st`, area: "Monroe" }));
  const l = mapsLinks(stops);
  assert.equal(l.length, 3);
  assert.ok(l[0].includes("destination=10%20Main%20st%2C%20Monroe%2C%20NY"));
  assert.ok(decodeURIComponent(l[0]).includes("1 Main st, Monroe, NY|2 Main st"));
});

test("matching", () => {
  const items = [{ name: "Jewelry Master" }, { name: "Gemsli" }, { name: "Balabosta", aliases: ["Bolbusta"] }];
  assert.equal(findMatches("jewelry masters", items)[0].item.name, "Jewelry Master");
  assert.equal(findMatches("balebusta", items)[0].item.name, "Balabosta");
  const g = duplicateGroups(["Sign up ny", "Sign Up NY", "sign up ny ", "Birtch Kitchen", "Birch Kitchen", "Gemsli", "GEMSLI", "Em Kay"]);
  assert.equal(g.length, 3);
});

test("allocation", () => {
  const r = allocateOldestFirst(100, [
    { job_id: "b", job_date: "2026-11-02", balance: 35 },
    { job_id: "a", job_date: "2026-11-01", balance: 50 },
    { job_id: "c", job_date: "2026-11-03", balance: 40 },
  ]);
  assert.deepEqual(r.allocations, [{ job_id: "a", amount: 50 }, { job_id: "b", amount: 35 }, { job_id: "c", amount: 15 }]);
  assert.equal(r.leftover, 0);
  assert.equal(allocateOldestFirst(10, []).leftover, 10);
});

test("patterns", () => {
  const s = (kind: "pickup" | "dropoff", a: string) => ({ kind, contact_id: null, address_id: null, address_text: a, area: null, instructions: null });
  const jobs = [
    { id: "1", job_date: "2026-11-20", price: 35, description: null, stops: [s("pickup", "203 Rutledge"), s("dropoff", "Monroe")] },
    { id: "2", job_date: "2026-11-18", price: 35, description: null, stops: [s("pickup", "203 Rutledge"), s("dropoff", "Monroe")] },
    { id: "3", job_date: "2026-11-10", price: 45, description: null, stops: [s("pickup", "203 Rutledge"), s("dropoff", "Monroe")] },
    { id: "4", job_date: "2026-10-01", price: 60, description: null, stops: [s("pickup", "53 Forest rd"), s("dropoff", "Williamsburg")] },
  ];
  const p = patternsFor(jobs, [], "2026-11-22");
  assert.equal(p[0].count, 3);
  assert.equal(p[0].price?.amount, 35);
  const p2 = patternsFor(jobs, [{ pattern_key: p[0].key, amount: 40 }], "2026-11-22");
  assert.equal(p2[0].price?.amount, 40);
  assert.ok(p2[0].price?.saved);
});

test("payments + card stripping", () => {
  assert.deepEqual(parsePayment("paid 35(zelle)"), { amount: 35, method: "Zelle", raw: "paid 35(zelle)" });
  assert.equal(parsePayment("cc 25")?.method, "Card");
  assert.equal(parsePayment("charged cc 60")?.amount, 60);
  assert.equal(parsePayment("please send a invoice"), null);
  const s = stripCardData("card 4111 1111 1111 1111 exp 12/27 cvv 123");
  assert.ok(s.removed);
  assert.ok(!/4111|12\/27|123/.test(s.text));
  assert.equal(parseDateCell("Nov 3", 2026), "2026-11-03");
  assert.equal(parseDateCell("October 5 2026", 2025), "2026-10-05");
});

test("delivery sheet", () => {
  const rows = [
    ["Date", "Customer Name", "Pick Up Location", "Drop off Location", "Description", "Rate", "Payment Meth", "Payment Status"],
    [],
    ["Nov 4", "Luxury Linen", "16 Arlington", "BP /Williamsburg", "3 stops", 80, "paid 80"],
    ["", "All in one appliances", "1 Lemberg", "Williamsburg", "2 stops", 70, "", "please send a invoice"],
    ["", "Gemsli", "", "", "", 169, "paid 879.29"],
  ];
  const r = parseDeliverySheet("November", rows, 2026);
  assert.equal(r.length, 3);
  assert.equal(r[1].date, "2026-11-04");
  assert.ok(r[1].invoiceRequested);
  assert.equal(r[0].payment?.amount, 80);
  assert.ok(r[2].flags.some((f) => f.includes("doesn't match")));
});

test("card data never survives", () => {
  for (const s of ["4111 1111 1111 1111 12/27 cvv 123", "card 4111-1111-1111-1111 exp 09/28", "amex 3782 822463 10005 sec code 1234", "4111111111111111"]) {
    const t = stripCardData(s).text;
    assert.ok(!/\d{4}[ -]?\d{4}|\d{2}\/\d{2}|\b\d{3,4}\b/.test(t), t);
  }
  assert.equal(stripCardData("call 845-781-6392").text, "call 845-781-6392");
});

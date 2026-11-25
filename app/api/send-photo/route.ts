import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { toE164 } from "@/lib/phone";
import { DEFAULT_PHOTO_MESSAGE, fillMessage } from "@/lib/photoMessage";

export const runtime = "nodejs";

/** Texts delivery photo(s) to whoever the customer chose (customer / receiver / sender). */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  const s = auth.supabase;
  const { photoIds } = (await req.json()) as { photoIds: string[] };
  if (!photoIds?.length) return NextResponse.json({ ok: false, message: "No photo" }, { status: 400 });

  const { data: photos } = await s.from("photos").select("*").in("id", photoIds);
  if (!photos?.length) return NextResponse.json({ ok: false, message: "Photo not found" }, { status: 404 });
  const jobId = photos[0].job_id;
  const { data: job } = await s.from("jobs").select("*, stops(*)").eq("id", jobId).single();
  const mark = (patch: Record<string, unknown>) => s.from("photos").update(patch).in("id", photoIds);

  const { data: customer } = job?.customer_id ? await s.from("contacts").select("*").eq("id", job.customer_id).single() : { data: null };
  const mode = customer?.photo_text_to || "customer";
  if (mode === "none") {
    await mark({ text_status: "skipped", text_error: "customer set to no texts" });
    return NextResponse.json({ ok: true, message: "Photo saved (this customer doesn't get texts)" });
  }

  const stops = (job?.stops || []).sort((a: any, b: any) => a.seq - b.seq);
  const photoStop = stops.find((x: any) => x.id === photos[0].stop_id);
  let contactId: string | null = null;
  if (mode === "customer") contactId = job?.customer_id;
  else if (mode === "dropoff") contactId = (photoStop?.kind === "dropoff" ? photoStop.contact_id : null) || stops.filter((x: any) => x.kind === "dropoff").map((x: any) => x.contact_id).find(Boolean) || null;
  else if (mode === "pickup") contactId = stops.filter((x: any) => x.kind === "pickup").map((x: any) => x.contact_id).find(Boolean) || null;

  const { data: who } = contactId ? await s.from("contacts").select("name, phone").eq("id", contactId).single() : { data: null };
  const to = toE164(who?.phone);
  if (!to) {
    const msg = who ? `${who.name} has no valid phone number` : "No person to text for this setting";
    await mark({ text_status: "failed", text_error: msg });
    return NextResponse.json({ ok: false, message: `Photo saved. Not texted: ${msg}.` });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    await mark({ text_status: "failed", text_error: "Texting isn't set up yet" });
    return NextResponse.json({ ok: false, message: "Photo saved. Texting isn't set up yet." });
  }

  const urls: string[] = [];
  for (const p of photos.slice(0, 10)) {
    const { data } = await s.storage.from("photos").createSignedUrl(p.path, 60 * 60 * 24 * 7);
    if (data?.signedUrl) urls.push(data.signedUrl);
  }
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
  const dropStop = photoStop?.kind === "dropoff" ? photoStop : stops.filter((x: any) => x.kind === "dropoff").slice(-1)[0];
  const { data: receiver } = dropStop?.contact_id ? await s.from("contacts").select("name").eq("id", dropStop.contact_id).single() : { data: null };
  // Message: this customer's own message → general message from Settings → built-in default
  let tpl = (customer as any)?.photo_message as string | null;
  if (!tpl) {
    const { data: setting, error } = await s.from("app_settings").select("value").eq("key", "photo_message").maybeSingle();
    if (!error && setting?.value) tpl = setting.value;
  }
  const body = fillMessage(tpl || DEFAULT_PHOTO_MESSAGE, {
    customer: customer?.name, receiver: receiver?.name || who?.name, address: dropStop?.address_text?.split(",")[0],
    item: job?.description, time, date,
    business: process.env.BUSINESS_NAME || "Spitzer's Express", phone: process.env.BUSINESS_PHONE || "845-781-6392",
  }).slice(0, 1450);
  const finalBody = /\bSTOP\b/.test(body) ? body : body + " Reply STOP to opt out.";

  const form = new URLSearchParams({ To: to, From: from, Body: finalBody });
  urls.forEach((u) => form.append("MediaUrl", u));
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!r.ok) {
    let msg = "Text failed";
    try { msg = (await r.json()).message || msg; } catch {}
    await mark({ text_status: "failed", text_error: msg.slice(0, 200) });
    return NextResponse.json({ ok: false, message: `Photo saved. Text failed: ${msg}` });
  }
  await mark({ text_status: "sent", text_to: `${who!.name} (${who!.phone})`, text_error: null, texted_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, message: `Photo texted to ${who!.name}` });
}

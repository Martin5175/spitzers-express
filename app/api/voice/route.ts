import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCHEMA_HINT = `Return JSON only, shaped exactly like:
{"jobs":[{
  "customer": string|null,            // who is ordering/paying, as spoken
  "date": "YYYY-MM-DD"|null,          // only if a day is mentioned
  "stops": [{"kind":"pickup"|"dropoff","name":string|null,"address":string|null,"instructions":string|null}],
  "description": string|null,         // what is being delivered (boxes, cake, 2 bags…)
  "price": number|null,               // only if a price is said
  "notes": string|null,
  "unclear": [string]                 // anything you were not sure about, in plain words
}]}`;

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: "Voice memos aren't set up yet (missing OpenAI key)." }, { status: 500 });

  const form = await req.formData();
  const audio = form.get("audio");
  const typed = (form.get("text") as string | null) || "";
  let transcript = typed;

  if (audio && audio instanceof Blob && audio.size > 0) {
    const fd = new FormData();
    const ext = (audio.type.includes("mp4") || audio.type.includes("m4a")) ? "m4a" : audio.type.includes("mpeg") ? "mp3" : audio.type.includes("wav") ? "wav" : audio.type.includes("ogg") ? "ogg" : "webm";
    fd.append("file", audio, `memo.${ext}`);
    fd.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1");
    fd.append("prompt", "Courier delivery memo. Places: Monroe, Monsey, Williamsburg, Borough Park, BP, Flatbush, Crown Heights, New Square, Pomona, Spring Valley, Kiryas Joel.");
    const tr = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
    if (!tr.ok) return NextResponse.json({ error: "Couldn't understand the recording. Try again.", detail: await tr.text() }, { status: 502 });
    transcript = ((await tr.json()).text || "").trim();
  }
  if (!transcript) return NextResponse.json({ error: "The recording was empty." }, { status: 400 });

  const { data: contacts } = await auth.supabase.from("contacts").select("name, aliases").limit(2000);
  const names = (contacts || []).flatMap((c: any) => [c.name, ...(c.aliases || [])]).slice(0, 1500);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });

  const sys = `You turn a courier's voice memo into delivery jobs. The courier works around Monroe, Monsey and Brooklyn (Williamsburg, Borough Park). Today is ${weekday} ${today}.
Rules:
- One job per separate delivery request. A job can have several pickups and drop-offs.
- Only use what is actually said. Never invent addresses, names, prices or dates. Use null when not said.
- Keep names as spoken, but if a name clearly matches one of the saved names, use the saved spelling.
- "BP" means Borough Park. "Wburg" means Williamsburg.
- Put anything uncertain into "unclear".
Saved names: ${names.join("; ")}
${SCHEMA_HINT}`;

  const ex = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_EXTRACT_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: transcript }],
    }),
  });
  if (!ex.ok) return NextResponse.json({ error: "Couldn't read the jobs from the memo.", transcript, detail: await ex.text() }, { status: 502 });
  let jobs: any[] = [];
  try {
    const content = (await ex.json()).choices?.[0]?.message?.content || "{}";
    jobs = JSON.parse(content).jobs || [];
  } catch {
    return NextResponse.json({ error: "Couldn't read the jobs from the memo.", transcript }, { status: 502 });
  }
  return NextResponse.json({ transcript, jobs });
}

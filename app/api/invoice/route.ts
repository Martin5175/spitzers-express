import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase-server";
import { sendInvoice } from "@/lib/invoice-server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth) return NextResponse.json({ ok: false, message: "Not signed in" }, { status: 401 });
  const { customerId } = await req.json();
  return NextResponse.json(await sendInvoice(auth.supabase, customerId));
}

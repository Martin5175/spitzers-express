import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function serverClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
        },
      },
    }
  );
}

/** Admin client for background jobs only (weekly invoices). Never sent to the browser. */
export function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export function emailAllowed(email?: string | null) {
  const list = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  return !!email && list.includes(email.toLowerCase());
}

/** Returns the signed-in user for API routes, or null. */
export async function requireUser() {
  const s = await serverClient();
  const { data } = await s.auth.getUser();
  if (!data.user || !emailAllowed(data.user.email)) return null;
  return { supabase: s, user: data.user };
}

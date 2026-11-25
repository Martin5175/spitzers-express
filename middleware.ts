import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;
  const allowed = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (data.user && allowed.length && !allowed.includes((data.user.email || "").toLowerCase())) {
    await supabase.auth.signOut();
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  const open = path.startsWith("/login") || path.startsWith("/api/cron") || path.startsWith("/privacy") || path.startsWith("/terms") || path.startsWith("/sms-consent");
  if (!data.user && !open) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|logo.png|manifest.webmanifest|sw.js).*)"],
};

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Today", ic: "🚚" },
  { href: "/voice", label: "Voice", ic: "🎤" },
  { href: "/new", label: "New Job", ic: "+", plus: true },
  { href: "/jobs", label: "Jobs", ic: "📋" },
  { href: "/customers", label: "Customers", ic: "👥" },
  { href: "/money", label: "Money", ic: "💵" },
];

export function toast(msg: string) {
  window.dispatchEvent(new CustomEvent("toast", { detail: msg }));
}

export default function Shell({ title, back, children, headerExtra }: { title: string; back?: boolean; children: React.ReactNode; headerExtra?: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const h = (e: Event) => { setMsg((e as CustomEvent).detail); clearTimeout(t); t = setTimeout(() => setMsg(null), 3500); };
    window.addEventListener("toast", h);
    return () => window.removeEventListener("toast", h);
  }, []);
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          {back ? (
            <button className="back" onClick={() => router.back()} aria-label="Back">‹</button>
          ) : (
            <img src="/logo.png" alt="" />
          )}
          <h1>{title}</h1>
          {path !== "/settings" && !back && (
            <Link href="/settings" aria-label="Settings" style={{ fontSize: 26 }}>⚙️</Link>
          )}
        </div>
        {headerExtra}
      </header>
      <main className="page">{children}</main>
      <nav className="nav">
        <div className="nav-in">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={(active(n.href) ? "on " : "") + (n.plus ? "plus" : "")}>
              <span className="ic">{n.ic}</span>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>
      {msg && <div className="toast">{msg}</div>}
    </div>
  );
}

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

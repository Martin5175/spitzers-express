import Link from "next/link";

export const BIZ = "Spitzer's Express Messenger Service";
export const PHONE = "845-781-6392";
export const UPDATED = "November 25, 2026";

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--cream-soft)", minHeight: "100vh" }}>
      <header style={{ background: "var(--orange)", padding: "20px 16px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/logo.png" alt="" style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff" }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 24, textTransform: "uppercase", lineHeight: 1 }}>{title}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{BIZ}</div>
          </div>
        </div>
      </header>
      <main className="legal" style={{ maxWidth: 760, margin: "0 auto", padding: "20px 16px 48px" }}>
        <p className="muted small">Last updated: {UPDATED}</p>
        {children}
        <hr style={{ border: 0, borderTop: "1.5px solid var(--line)", margin: "32px 0 16px" }} />
        <p className="small muted">
          <Link href="/privacy" className="link">Privacy Policy</Link> · <Link href="/terms" className="link">Terms &amp; Conditions</Link> · {PHONE}
        </p>
      </main>
    </div>
  );
}

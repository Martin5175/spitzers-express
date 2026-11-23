"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Shell, { toast } from "@/components/Shell";
import { useContacts } from "@/lib/useContacts";
import { findMatches } from "@/lib/match";
import { createContact } from "@/lib/data";
import { money } from "@/lib/money";

export default function Customers() {
  const { contacts, ranked, stats, loading } = useContacts();
  const [q, setQ] = useState("");
  const router = useRouter();

  const list = useMemo(() => {
    if (q.trim()) return findMatches(q, contacts, 0.45).map((m) => m.item);
    const byId = new Map(contacts.map((c) => [c.id, c]));
    const top = ranked.map((id) => byId.get(id)!).filter(Boolean);
    const rest = contacts.filter((c) => !ranked.includes(c.id));
    return [...top, ...rest];
  }, [q, contacts, ranked]);

  async function add() {
    try {
      const c = await createContact({ name: q.trim() });
      router.push(`/customers/${c.id}`);
    } catch (e: any) { toast(e.message); }
  }

  return (
    <Shell title="Customers">
      <input className="input" placeholder="🔍 Search name…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim() && <button className="btn block" style={{ marginTop: 8 }} onClick={add}>+ Add “{q.trim()}”</button>}
      {!q && <div className="h2">Most used first</div>}
      {loading && <p className="muted">Loading…</p>}
      <div style={{ marginTop: 8 }}>
        {list.slice(0, 200).map((c) => {
          const s = stats[c.id];
          return (
            <Link key={c.id} href={`/customers/${c.id}`} className="list-item">
              <div className="avatar">{c.name[0]?.toUpperCase()}</div>
              <div className="grow">
                <div style={{ fontWeight: 800 }}>{c.name}</div>
                <div className="muted small">{[c.phone, s?.jobs_total ? `${s.jobs_total} jobs` : ""].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              {s && s.balance > 0.005 && <span className="tag bad">owes {money(s.balance)}</span>}
            </Link>
          );
        })}
      </div>
      {!loading && contacts.length === 0 && (
        <div className="card center" style={{ marginTop: 12 }}>
          No customers yet. Type a name above to add one, or <Link href="/import" className="link">import the old sheet</Link>.
        </div>
      )}
    </Shell>
  );
}

"use client";
import { useEffect, useState } from "react";
import type { Contact } from "./types";
import { loadContacts, loadCustomerStats } from "./data";
import { customerScore } from "./suggest";
import { todayISO } from "./dates";

/** All contacts + customer ids ranked by how often/recently they order. */
export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ranked, setRanked] = useState<string[]>([]);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof loadCustomerStats>>>({});
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([loadContacts(), loadCustomerStats()]).then(([c, s]) => {
      setContacts(c);
      setStats(s);
      const t = todayISO();
      setRanked(
        c.filter((x) => s[x.id]?.jobs_total)
          .map((x) => ({ id: x.id, sc: customerScore(s[x.id].jobs_90d, s[x.id].last_job, t) }))
          .sort((a, b) => b.sc - a.sc).map((x) => x.id)
      );
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);
  return { contacts, setContacts, ranked, stats, loading };
}

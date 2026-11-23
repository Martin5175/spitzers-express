export function norm(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/\b(inc|llc|co|corp|the)\b/g, "").replace(/\s+/g, " ").trim();
}

export function lev(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** 0..1 similarity of two names */
export function similarity(a: string, b: string): number {
  const x = norm(a).replace(/ /g, ""), y = norm(b).replace(/ /g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = lev(x, y);
  return 1 - d / Math.max(x.length, y.length);
}

export type Match<T> = { item: T; score: number };

/** Best matches of a spoken/typed name against saved records (name + aliases). */
export function findMatches<T extends { name: string; aliases?: string[] | null }>(query: string, items: T[], min = 0.6): Match<T>[] {
  const q = norm(query);
  if (!q) return [];
  const out: Match<T>[] = [];
  for (const it of items) {
    const names = [it.name, ...(it.aliases || [])];
    let best = 0;
    for (const n of names) {
      const nn = norm(n);
      let s = similarity(q, nn);
      if (nn && (nn.startsWith(q) || q.startsWith(nn)) && Math.min(q.length, nn.length) >= 3) s = Math.max(s, 0.85);
      if (nn.split(" ").includes(q) && q.length >= 4) s = Math.max(s, 0.75);
      best = Math.max(best, s);
    }
    if (best >= min) out.push({ item: it, score: best });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Groups names that are probably the same customer (for import review). */
export function duplicateGroups(names: string[], threshold = 0.8): string[][] {
  const uniq = [...new Set(names)];
  const parent = new Map(uniq.map((n) => [n, n]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (let i = 0; i < uniq.length; i++)
    for (let j = i + 1; j < uniq.length; j++) {
      const a = norm(uniq[i]).replace(/ /g, ""), b = norm(uniq[j]).replace(/ /g, "");
      if (!a || !b) continue;
      const same = a === b || (a.length >= 5 && b.length >= 5 && similarity(a, b) >= threshold);
      if (same) parent.set(find(uniq[i]), find(uniq[j]));
    }
  const groups = new Map<string, string[]>();
  for (const n of uniq) { const r = find(n); groups.set(r, [...(groups.get(r) || []), n]); }
  return [...groups.values()].filter((g) => g.length > 1);
}

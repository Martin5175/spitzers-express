"use client";
import { useEffect, useRef, useState } from "react";

/** Address box that suggests full addresses (town, state, zip) as you type. */
export default function AddressInput({ value, onChange, onPick, className, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  onPick: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [list, setList] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const typed = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!typed.current) return;
    const q = value.trim();
    if (q.length < 3 || !/\d/.test(q)) { setList([]); return; }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/address?q=${encodeURIComponent(q)}`);
        const j = await r.json();
        if (n === seq.current) { setList(j.results || []); setOpen(true); }
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <input
        className={className || "input"}
        value={value}
        placeholder={placeholder || "Start typing, e.g. 16 Main St"}
        autoComplete="off"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => list.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && list.length > 0 && (
        <div className="suggest-box">
          {list.map((a) => (
            <button type="button" key={a} className="suggest-item" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { typed.current = false; onPick(a); setOpen(false); setList([]); }}>
              📍 {a}
            </button>
          ))}
          <div className="muted small" style={{ padding: "6px 12px" }}>Or keep what you typed</div>
        </div>
      )}
    </div>
  );
}

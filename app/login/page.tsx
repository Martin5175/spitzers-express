"use client";
import { useState } from "react";
import { sb } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setErr("That email or password didn't work. Try again.");
    else window.location.href = "/";
  }
  return (
    <div className="login">
      <div className="login-top">
        <img src="/logo.png" alt="Spitzer's Express" />
        <h1>Spitzer&apos;s<br />Express</h1>
      </div>
      <form className="login-box" onSubmit={go}>
        <label className="f"><span>Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="f"><span>Password</span>
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {err && <div className="note bad" style={{ marginTop: 14 }}>{err}</div>}
        <button className="btn primary block xl" style={{ marginTop: 20 }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="muted small center" style={{ marginTop: 18 }}>You stay signed in on this phone.</p>
        <p className="small center" style={{ marginTop: 8 }}><a href="/privacy" className="link">Privacy Policy</a> · <a href="/terms" className="link">Terms &amp; Conditions</a></p>
      </form>
    </div>
  );
}

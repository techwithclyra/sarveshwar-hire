import React, { useState, useEffect } from "react";
import { LogIn, UserPlus, AlertTriangle, Loader2 } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { DB } from "../lib/db.js";
import { AuthAPI } from "../lib/authApi.js";
import { supabase } from "../lib/supabaseClient.js";
import { inputStyle } from "./ui.jsx";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Candidate identity for the assessment. Every login path (password or
// Google) funnels through here, keyed by email so the same person always
// resumes the same candidate record and attempt history.
async function startForProfile(profile, onStart) {
  const id = (profile.email || profile.id || "").toLowerCase();
  const studentProfile = {
    id, name: profile.name, email: profile.email,
    college: profile.college, department: profile.department, batch: profile.batch || "",
  };
  const existing = await DB.getCandidate(id);
  const candidate = {
    id, name: studentProfile.name, dept: studentProfile.department, college: studentProfile.college,
    createdAt: existing?.createdAt || Date.now(), attempts: existing?.attempts || [], inProgress: existing?.inProgress || [],
  };
  await DB.saveCandidate(candidate);
  onStart({ ...candidate, student: studentProfile });
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

// Unified sign-in surface: Log In / Create Account tabs plus Google. A
// first-time Google user is routed through a short profile-completion step
// (college + department) because those aren't part of a Google identity.
export function AuthGate({ onStart }) {
  const [mode, setMode] = useState("login"); // login | signup | google-profile
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Shared fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [college, setCollege] = useState("");
  const [department, setDepartment] = useState("");

  const [googleToken, setGoogleToken] = useState(null);

  // On mount (and after a Google redirect), pick up any Supabase session and
  // exchange it for a student profile.
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data: { session } = {} } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;
      setBusy(true); setErr("");
      try {
        const resp = await AuthAPI.google({ accessToken: session.access_token });
        if (cancelled) return;
        if (resp.needsProfile) {
          setGoogleToken(session.access_token);
          setName(resp.name || "");
          setEmail(resp.email || "");
          setMode("google-profile");
        } else if (resp.student) {
          await startForProfile(resp.student, onStart);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || "Google sign-in failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doLogin() {
    if (!email.trim() || !password) { setErr("Enter your email and password."); return; }
    setErr(""); setBusy(true);
    try {
      const student = await AuthAPI.login(email.trim(), password);
      await startForProfile(student, onStart);
    } catch (e) { setErr(e.message || "Login failed"); setBusy(false); }
  }

  async function doSignup() {
    if (!name.trim() || !email.trim() || !college.trim() || !department.trim() || !password) {
      setErr("Please fill in every field."); return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) { setErr("Enter a valid email address (e.g. name@example.com)."); return; }
    if (password.length < 6) { setErr("Choose a password of at least 6 characters."); return; }
    setErr(""); setBusy(true);
    try {
      const student = await AuthAPI.signup({
        name: name.trim(), email: email.trim().toLowerCase(), college: college.trim(), department: department.trim(), password,
      });
      await startForProfile(student, onStart);
    } catch (e) { setErr(e.message || "Could not create account"); setBusy(false); }
  }

  async function doGoogle() {
    setErr("");
    if (!supabase) { setErr("Google sign-in isn't configured for this deployment. Use email instead."); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setErr(error.message);
  }

  async function completeGoogleProfile() {
    if (!college.trim() || !department.trim()) { setErr("Enter your college and department to finish."); return; }
    setErr(""); setBusy(true);
    try {
      const resp = await AuthAPI.google({ accessToken: googleToken, college: college.trim(), department: department.trim() });
      if (resp.student) await startForProfile(resp.student, onStart);
      else throw new Error("Could not complete your Google sign-up.");
    } catch (e) { setErr(e.message || "Could not complete sign-up"); setBusy(false); }
  }

  const tabBtn = (active) => ({
    flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none",
    background: active ? COLORS.panelAlt : "transparent", color: active ? COLORS.text : COLORS.muted,
    borderBottom: `2px solid ${active ? COLORS.gold : "transparent"}`,
  });
  const primaryBtn = {
    marginTop: 18, width: "100%", background: COLORS.gold, color: "#1A1300", border: "none", borderRadius: 8,
    padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
  };

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 420, maxWidth: "100%", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
        {mode === "google-profile" ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <UserPlus size={16} color={COLORS.gold} /><span style={{ fontSize: 17, fontWeight: 700 }}>Finish setting up</span>
            </div>
            <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 18 }}>
              Signed in as {email}. Just a couple more details to complete your account.
            </p>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="College"><input value={college} onChange={(e) => setCollege(e.target.value)} style={inputStyle} placeholder="e.g. SNU Chennai" /></Field>
              <Field label="Department"><input value={department} onChange={(e) => setDepartment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && completeGoogleProfile()} style={inputStyle} placeholder="e.g. Computer Science" /></Field>
            </div>
            <button onClick={completeGoogleProfile} disabled={busy} style={primaryBtn}>
              {busy ? <Loader2 size={15} className="ph-spin" /> : null}{busy ? "Finishing…" : "Continue"}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.border}`, marginBottom: 18, borderRadius: 8, overflow: "hidden" }}>
              <button style={tabBtn(mode === "login")} onClick={() => { setMode("login"); setErr(""); }}>Log In</button>
              <button style={tabBtn(mode === "signup")} onClick={() => { setMode("signup"); setErr(""); }}>Create Account</button>
            </div>

            {mode === "signup" && (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Full name"><input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Priya Krishnan" /></Field>
                <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. priya@example.com" /></Field>
                <Field label="College"><input value={college} onChange={(e) => setCollege(e.target.value)} style={inputStyle} placeholder="e.g. SNU Chennai" /></Field>
                <Field label="Department"><input value={department} onChange={(e) => setDepartment(e.target.value)} style={inputStyle} placeholder="e.g. Computer Science" /></Field>
                <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSignup()} style={inputStyle} placeholder="At least 6 characters" /></Field>
              </div>
            )}

            {mode === "login" && (
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. priya@example.com" /></Field>
                <Field label="Password"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doLogin()} style={inputStyle} placeholder="Your password" /></Field>
              </div>
            )}

            <button onClick={mode === "signup" ? doSignup : doLogin} disabled={busy} style={primaryBtn}>
              {busy ? <Loader2 size={15} className="ph-spin" /> : mode === "signup" ? <UserPlus size={15} /> : <LogIn size={15} />}
              {busy ? "Please wait…" : mode === "signup" ? "Create Account" : "Log In"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
              <div style={{ flex: 1, height: 1, background: COLORS.border }} />
              <span style={{ fontSize: 11, color: COLORS.muted }}>OR</span>
              <div style={{ flex: 1, height: 1, background: COLORS.border }} />
            </div>

            <button
              onClick={doGoogle} disabled={busy}
              style={{ width: "100%", background: "#fff", color: "#1f2937", border: "none", borderRadius: 8, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: busy ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}
            >
              <GoogleG />Continue with Google
            </button>
          </>
        )}

        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 14, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} />{err}</div>}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

import React, { useState } from "react";
import { UserPlus, LogIn, AlertTriangle } from "lucide-react";
import { COLORS } from "../config/colors.js";
import { DB } from "../lib/db.js";
import { AuthAPI } from "../lib/authApi.js";
import { inputStyle } from "./ui.jsx";

// A real, properly formatted email address — not exhaustive RFC 5322, but
// catches the "not an email at all" case without being pedantic.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Two ways in: students new to the platform create an account (name, email,
// college, department, password); returning students log in with their email
// + password, which restores their full attempt history. Either path resolves
// to the same shape — a student profile plus a candidate record keyed by the
// student's id — that the rest of the app expects.
export function StudentIntake({ onStart }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [college, setCollege] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next) {
    setMode(next);
    setErr("");
    setPassword("");
  }

  // Both flows return a student profile from the backend; from there the
  // steps are identical, so share them.
  async function enterWith(student) {
    const id = student.id;
    const existing = await DB.getCandidate(id);
    const candidate = {
      id,
      name: student.name,
      dept: student.department,
      college: student.college,
      createdAt: existing?.createdAt || Date.now(),
      attempts: existing?.attempts || [],
      inProgress: existing?.inProgress || [],
    };
    await DB.saveCandidate(candidate);
    onStart({ ...candidate, student });
  }

  async function submit() {
    setErr("");
    if (!email.trim() || !password) {
      setErr("Enter your email and password.");
      return;
    }
    if (!EMAIL_PATTERN.test(email.trim())) {
      setErr("Enter a valid email address (e.g. name@example.com).");
      return;
    }
    if (mode === "signup") {
      if (!name.trim() || !college.trim() || !department.trim()) {
        setErr("Please fill in your name, college, and department.");
        return;
      }
      if (password.length < 6) {
        setErr("Choose a password of at least 6 characters.");
        return;
      }
    }
    setBusy(true);
    try {
      const student =
        mode === "signup"
          ? await AuthAPI.signup({
              name: name.trim(),
              email: email.trim().toLowerCase(),
              college: college.trim(),
              department: department.trim(),
              password,
            })
          : await AuthAPI.login(email.trim().toLowerCase(), password);
      await enterWith(student);
    } catch (e) {
      setErr(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === "signup";
  const accent = isSignup ? COLORS.gold : COLORS.teal;

  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 420, maxWidth: "100%", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 28 }}>
        {/* Mode toggle */}
        <div style={{ display: "flex", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 4, marginBottom: 20 }}>
          <TabButton active={!isSignup} onClick={() => switchMode("login")} icon={<LogIn size={13} />}>Log in</TabButton>
          <TabButton active={isSignup} onClick={() => switchMode("signup")} icon={<UserPlus size={13} />}>Create account</TabButton>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          {isSignup ? <UserPlus size={16} color={accent} /> : <LogIn size={16} color={accent} />}
          <span style={{ fontSize: 17, fontWeight: 700 }}>{isSignup ? "Create your account" : "Welcome back"}</span>
        </div>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 18 }}>
          {isSignup
            ? "New here? Set up an account to start practicing your prompt engineering."
            : "Log in with your email and password to continue where you left off — your history comes with you."}
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {isSignup && (
            <Field label="Full name">
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Priya Krishnan" />
            </Field>
          )}
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. priya@example.com" />
          </Field>
          {isSignup && (
            <>
              <Field label="College">
                <input value={college} onChange={(e) => setCollege(e.target.value)} style={inputStyle} placeholder="e.g. SNU Chennai" />
              </Field>
              <Field label="Department">
                <input value={department} onChange={(e) => setDepartment(e.target.value)} style={inputStyle} placeholder="e.g. Computer Science" />
              </Field>
            </>
          )}
          <Field label={isSignup ? "Password (min 6 characters)" : "Password"}>
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} style={inputStyle}
              placeholder={isSignup ? "Choose a password" : "Your password"}
            />
          </Field>
        </div>

        {err && <div style={{ color: COLORS.rose, fontSize: 12.5, marginTop: 12, display: "flex", gap: 6 }}><AlertTriangle size={13} style={{ marginTop: 1 }} />{err}</div>}

        <button
          onClick={submit} disabled={busy}
          style={{ marginTop: 18, width: "100%", background: accent, color: "#12130A", border: "none", borderRadius: 8, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer" }}
        >
          {busy ? (isSignup ? "Creating account…" : "Logging in…") : isSignup ? "Create account & start" : "Log in"}
        </button>

        <div style={{ textAlign: "center", marginTop: 14, fontSize: 12.5, color: COLORS.muted }}>
          {isSignup ? (
            <>Already have an account?{" "}
              <button onClick={() => switchMode("login")} style={linkBtn}>Log in</button>
            </>
          ) : (
            <>New to the platform?{" "}
              <button onClick={() => switchMode("signup")} style={linkBtn}>Create an account</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: active ? COLORS.panelAlt : "transparent",
        color: active ? COLORS.text : COLORS.muted,
        border: active ? `1px solid ${COLORS.border}` : "1px solid transparent",
        borderRadius: 7, padding: "8px 0", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
      }}
    >
      {icon}{children}
    </button>
  );
}

const linkBtn = {
  background: "none", border: "none", color: COLORS.teal, cursor: "pointer",
  fontSize: 12.5, fontWeight: 600, padding: 0, textDecoration: "underline",
};
